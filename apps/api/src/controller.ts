import { Controller,Get,Post,Patch,Body,Param,Query,Headers,Inject,HttpException,ForbiddenException,ConflictException,BadRequestException } from '@nestjs/common';
import { randomUUID,timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { pool,transaction } from './database.js';
import { Repository,audit } from './repository.js';
import { Assumptions,OptimizeSchema,simulate,candidates,optimizeGroups,transitions,VERSION } from './domain.js';
import { runAgent } from './agent.js';
import { fetchSenamhi,persistSenamhi,recordOpenMeteo } from './official.js';
const uuid=z.string().uuid();
function coordinator(token:string|undefined) {
  const expected=process.env.DEMO_COORDINATOR_TOKEN;
  if(!expected||!token||Buffer.byteLength(token)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(token),Buffer.from(expected)))throw new ForbiddenException('Ingrese la credencial local de coordinador');
}
@Controller('api/v1')
export class ApiController {
  constructor(@Inject(Repository) private readonly repo:Repository){}
  @Get('health') async health() {
    await pool.query('SELECT 1');
    return {status:'ok',db:'PostgreSQL + PostGIS',version:VERSION,synthetic_portfolio:true,official_hazards:['CENEPRED','SENAMHI'],gemini_configured:!!(process.env.GEMINI_API_KEY||process.env.LLM_API_KEY),evaluation_clock:{synthetic:'2026-11-24 (fijo)',official:'hora de evaluación (America/Lima)'}};
  }
  @Get('businesses') async businesses(@Query() query:Record<string,string>) {
    const p=z.object({limit:z.coerce.number().int().min(1).max(100).default(20),offset:z.coerce.number().int().min(0).default(0),district:z.string().optional(),sector:z.string().optional(),search:z.string().max(100).optional()}).parse(query);
    const rows=(await this.repo.businesses()).filter(b=>(!p.district||b.district===p.district)&&(!p.sector||b.sector===p.sector)&&(!p.search||(b.name+b.code).toLowerCase().includes(p.search.toLowerCase())));
    return {items:rows.slice(p.offset,p.offset+p.limit),total:rows.length};
  }
  @Get('businesses/:id') business(@Param('id') id:string) {return this.repo.business(uuid.parse(id));}
  @Get('climate/hazards.geojson') hazards(@Query('source') source?:string) {
    return z.enum(['official','synthetic']).default('official').parse(source||undefined)==='synthetic'?this.repo.hazardGeoJSON():this.repo.officialGeoJSON();
  }
  @Get('climate/districts.geojson') districts() {return this.repo.districtsGeoJSON();}
  @Get('climate/alerts') alerts() {return this.repo.alerts();}
  @Get('climate/live') async live() {
    const retrieved_at=new Date().toISOString();
    let result:any;
    try {
      const res=await fetch('https://api.open-meteo.com/v1/forecast?latitude=-8.11&longitude=-79.03&daily=precipitation_sum&timezone=America%2FLima&forecast_days=3',{signal:AbortSignal.timeout(8000)});
      if(!res.ok)throw new Error();const data=await res.json() as any;
      if(!data.daily?.time||!data.daily?.precipitation_sum)throw new Error();
      result={status:'live',source:'Open-Meteo',retrieved_at,daily:data.daily,note:'Pronóstico puntual contextual; no modifica el índice ni la cartografía oficial.'};
    }catch{result={status:'unavailable',source:'Open-Meteo',retrieved_at,note:'No disponible. La evaluación continúa con CENEPRED/SENAMHI almacenados.'};}
    await transaction(c=>recordOpenMeteo(c,result.status==='live'?'current':'unavailable',{status:result.status,retrieved_at,daily:result.daily??null})).catch(()=>{});
    return result;
  }
  @Get('sources') sources() {return this.repo.sources();}
  private lastRefresh=0;
  @Post('sources/senamhi/refresh') async refreshSenamhi(@Headers('x-coordinator-token') token:string) {
    coordinator(token);
    if(Date.now()-this.lastRefresh<60000)throw new HttpException('Espere un minuto entre consultas a SENAMHI',429);
    this.lastRefresh=Date.now();
    const result=await fetchSenamhi();
    return transaction(async c=>{const saved=await persistSenamhi(c,result);await audit(c,'SOURCE_REFRESHED','senamhi',saved,'demo-coordinator');return saved;});
  }
  @Post('risk/assess') assess(@Body() body:unknown) {const p=z.object({scenario_id:z.enum(['leve','moderado','severo']).default('severo'),hazard_source:z.enum(['official','synthetic']).default('official')}).strict().parse(body);return this.repo.assess(p.scenario_id,p.hazard_source);}
  @Get('risk/portfolio') run(@Query('run_id') id:string) {return this.repo.run(uuid.parse(id));}
  @Get('risk/businesses.geojson') async points(@Query('run_id') id:string) {
    const run=await this.repo.run(uuid.parse(id));return {type:'FeatureCollection',features:run.items.filter(b=>b.location).map(b=>({type:'Feature',geometry:{type:'Point',coordinates:b.location},properties:{id:b.id,code:b.code,name:b.name,score:b.score,priority:b.priority}}))};
  }
  @Post('simulation/run') async simulation(@Body() body:unknown) {
    const parsed=Assumptions.extend({business_id:uuid}).parse(body),{business_id,...a}=parsed;
    let result;try {result=simulate(await this.repo.business(business_id),a);}catch(e){if(e instanceof HttpException)throw e;throw new BadRequestException('Faltan datos financieros; cálculo bloqueado');}
    const id=randomUUID();
    await pool.query(`INSERT INTO climashield.financial_scenarios(id,business_id,assumptions,baseline_cash,stressed_cash,mitigated_cash,gross_avoided_loss,intervention_cost,net_benefit,result,model_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,business_id,JSON.stringify(a),result.baseline_cash,result.stressed_cash,result.mitigated_cash,result.gross_avoided_loss,result.intervention_cost,result.net_benefit,JSON.stringify(result),VERSION]);
    return {id,...result};
  }
  @Post('optimization/run') async optimization(@Body() body:unknown) {
    const p=OptimizeSchema.parse(body),run=await this.repo.run(p.run_id),start=performance.now(),result=optimizeGroups(candidates(run),p);
    const id=randomUUID();await transaction(async c=>{
      await c.query('INSERT INTO climashield.optimization_plans(id,run_id,solver_status,constraints,result) VALUES($1,$2,$3,$4,$5)',[id,run.id,result.solver_status,JSON.stringify(p),JSON.stringify(result)]);
      await audit(c,'PLAN_CREATED',id,{status:result.solver_status});
    });return {id,run_id:run.id,...result,elapsed_ms:Math.round(performance.now()-start)};
  }
  @Post('interventions/drafts') async drafts(@Body() body:unknown) {
    const p=z.object({plan_id:uuid}).strict().parse(body),plan=await this.repo.plan(p.plan_id);
    if(!['OPTIMAL','FEASIBLE'].includes(plan.solver_status))throw new ConflictException('El plan no es factible');
    return transaction(async c=>{
      await c.query('SELECT id FROM climashield.optimization_plans WHERE id=$1 FOR UPDATE',[p.plan_id]);
      let created=0;
      for(const item of plan.selected) {
        const id=randomUUID();const res=await c.query(`INSERT INTO climashield.interventions(id,plan_id,business_id,action_code,action,estimated_cost,duration_minutes,estimated_benefit) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(plan_id,business_id) DO NOTHING RETURNING id`,[id,p.plan_id,item.business_id,item.action_code,item.action,item.cost,item.minutes,item.net_benefit]);
        if(res.rowCount){created++;await audit(c,'DRAFT_CREATED',id);}
      }return {created};
    });
  }
  @Get('interventions') async interventions() {
    const {rows}=await pool.query('SELECT i.*,b.code,b.name FROM climashield.interventions i JOIN climashield.businesses b ON b.id=i.business_id ORDER BY i.created_at DESC LIMIT 1000');return {items:rows};
  }
  @Patch('interventions/:id') async transition(@Param('id') id:string,@Body() body:unknown,@Headers('x-coordinator-token') token:string) {
    coordinator(token);uuid.parse(id);
    const p=z.object({status:z.enum(['APPROVED','ASSIGNED','CONTACTED','COMPLETED','CANCELLED']),reason:z.string().max(500).default('')}).strict().parse(body);
    return transaction(async c=>{
      const {rows}=await c.query('SELECT * FROM climashield.interventions WHERE id=$1 FOR UPDATE',[id]);const row=rows[0];
      if(!row)throw new BadRequestException('Intervención no encontrada');
      if(!transitions[row.status]?.includes(p.status))throw new ConflictException('Transición no permitida');
      if(['CANCELLED','COMPLETED'].includes(p.status)&&!p.reason.trim())throw new BadRequestException('Registre motivo o resultado');
      const result=await c.query("UPDATE climashield.interventions SET status=$2,result_note=$3,approved_at=CASE WHEN $2='APPROVED' THEN now() ELSE approved_at END,assigned_advisor=CASE WHEN $2='ASSIGNED' THEN 'Asesor demo' ELSE assigned_advisor END WHERE id=$1 RETURNING *",[id,p.status,p.reason]);
      await audit(c,'STATUS_CHANGED',id,{before:row.status,after:p.status,reason:p.reason},'demo-coordinator');return result.rows[0];
    });
  }
  @Get('audit') async audit() {return {items:(await pool.query('SELECT * FROM climashield.audit_events ORDER BY timestamp DESC LIMIT 100')).rows};}
  private calls:number[]=[];
  @Post('agent/run') async agent(@Body() body:unknown) {
    const p=z.object({question:z.string().min(3).max(1500),run_id:uuid}).strict().parse(body),run=await this.repo.run(p.run_id);
    const now=Date.now();this.calls=this.calls.filter(t=>now-t<60000);
    if(this.calls.length>=6)throw new HttpException('Límite global de demo: 6 consultas por minuto',429);this.calls.push(now);
    try {
      const result=await runAgent(p.question,run,this.repo);
      await transaction(c=>audit(c,'AGENT_RUN',run.id,{mode:result.mode,tools:result.trace}));return result;
    }catch {throw new HttpException('Gemini no disponible. Revise clave, modelo o cuota. Los cálculos de la demo siguen disponibles.',503);}
  }
}

