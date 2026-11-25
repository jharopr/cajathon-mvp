import 'reflect-metadata';
import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile,mkdir } from 'node:fs/promises';
import { createApp } from '../apps/api/src/main.js';
import { pool } from '../apps/api/src/database.js';
import { uid } from '../apps/api/src/data.js';
import { migrate } from '../scripts/migrate.js';
import { loadCenepred,persistSenamhi,SOURCE_IDS } from '../apps/api/src/official.js';

test('integración PostgreSQL/PostGIS y flujo HTTP NestJS',async t=>{
  await migrate(); // volver a aplicar verifica idempotencia y checksums.
  const app=await createApp();await app.listen(0,'127.0.0.1');
  const base=await app.getUrl();
  async function request(path:string,body?:unknown,method='POST',token?:string) {
    const res=await fetch(base+'/api/v1'+path,{method:body===undefined?'GET':method,headers:{'Content-Type':'application/json',...(token?{'X-Coordinator-Token':token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:res.status,data:await res.json() as any};
  }
  let run:any,plan:any,official:any;
  try {
    await t.test('salud y tablas base',async()=>{assert.equal((await request('/health')).status,200);const tables=await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema='climashield'");assert.equal(+tables.rows[0].count,13);});
    await t.test('cruce espacial, borde, desconocido y saldo deduplicado',async()=>{
      const r=await request('/risk/assess',{scenario_id:'severo',hazard_source:'synthetic'});assert.equal(r.status,201);run=r.data;
      assert.equal(run.summary.total,1000);assert.equal(run.summary.unknown,1);assert.equal(run.items.find((b:any)=>b.code==='CS-0001').score,72.9);
      assert.equal(run.items.find((b:any)=>b.code==='CS-0002').exposed,true);assert.equal(run.items.find((b:any)=>b.code==='CS-0003').score,null);assert.equal(run.items.find((b:any)=>b.code==='CS-0005').exposed,false);
      const total=run.items.filter((b:any)=>b.exposed).reduce((sum:number,b:any)=>sum+Math.round(+b.balance*100),0);
      assert.equal(+run.summary.exposed_balance*100,total);assert.ok(run.items.some((b:any)=>b.evaluations.filter((e:any)=>e.exposure===1).length>1));
      assert.equal(+run.items.find((b:any)=>b.code==='CS-0006').balance,+(await request('/businesses/'+uid('5'))).data.balance);
      const saved=await request('/risk/portfolio?run_id='+run.id);assert.equal(saved.data.items.length,1000);
    });
    await t.test('geometrías inválidas rechazadas y vigencia separada',async()=>{
      const c=await pool.connect();try {await c.query('BEGIN');await assert.rejects(c.query("UPDATE climashield.climate_hazards SET geometry=ST_GeomFromText('POLYGON((0 0,1 1,1 0,0 1,0 0))',4326) WHERE id=$1",[uid('hazard0')]));}finally {await c.query('ROLLBACK');c.release();}
      const expired=await pool.query("SELECT count(*) FROM climashield.climate_hazards WHERE '2027-01-01'::timestamptz BETWEEN valid_from AND valid_until");assert.equal(+expired.rows[0].count,0);
    });
    await t.test('cartografía oficial: carga idempotente, geometrías válidas y procedencia',async()=>{
      const c=await pool.connect();try {await c.query('BEGIN');assert.equal((await loadCenepred(c)).loaded,false);}finally {await c.query('ROLLBACK');c.release();}
      const zones=await pool.query("SELECT layer,count(*)::int AS n,bool_and(ST_IsValid(geometry)) AS valid,bool_and(NOT synthetic) AS official FROM climashield.official_hazard_zones WHERE source_id=$1 GROUP BY layer",[SOURCE_IDS.cenepred]);
      assert.deepEqual(zones.rows.map(r=>r.layer).sort(),['cenepred_suscep_inundacion','cenepred_suscep_mmasa']);assert.ok(zones.rows.every(r=>r.valid&&r.official&&r.n>100));
      assert.equal(+(await pool.query('SELECT count(DISTINCT ubigeo) FROM climashield.district_risk_scenarios WHERE source_id=$1',[SOURCE_IDS.cenepred])).rows[0].count,12);
      const sources=(await request('/sources')).data,cenepred=sources.items.find((s:any)=>s.data_kind==='official_static');
      assert.equal(cenepred.freshness,'current');assert.match(cenepred.version,/^cenepred-102@/);assert.equal(sources.policy.length,4);
      const layer=(await request('/climate/hazards.geojson')).data;assert.equal(layer.features.filter((f:any)=>f.properties.kind==='susceptibility').length,zones.rows.reduce((s,r)=>s+r.n,0));
      assert.equal((await request('/climate/districts.geojson')).data.features.length,12);assert.equal((await request('/climate/hazards.geojson?source=otro')).status,422);
    });
    await t.test('evaluación oficial: distrito, respaldo distrital, ubicación, UNKNOWN y saldo deduplicado',async()=>{
      const r=await request('/risk/assess',{scenario_id:'severo'});assert.equal(r.status,201);official=r.data;
      assert.equal(official.hazard_source,'official');assert.equal(official.summary.total,1000);assert.equal(official.summary.unknown,1);
      const b1=official.items.find((b:any)=>b.code==='CS-0001');
      assert.equal(b1.official_district,'EL PORVENIR');assert.equal(b1.district_risk.flood,'Alto');assert.equal(b1.score,43.74);assert.equal(b1.exposed,true);
      assert.equal(official.items.find((b:any)=>b.code==='CS-0003').score,null);assert.match(official.items.find((b:any)=>b.code==='CS-0002').location_issue,/Laredo.*TRUJILLO/);
      assert.ok(official.summary.location_issues>0&&official.summary.point_zone>0&&official.summary.exposed>0);
      for(const b of official.items) for(const e of b.evaluations) {
        if(e.kind==='susceptibility')assert.equal(e.exposure,1);
        if(e.kind==='district')assert.ok(e.exposure>=0&&e.exposure<=1);
        if(e.kind==='alert')assert.equal(e.score,null);
      }
      const total=official.items.filter((b:any)=>b.exposed).reduce((sum:number,b:any)=>sum+Math.round(+b.balance*100),0);assert.equal(Math.round(+official.summary.exposed_balance*100),total);
      const saved=await pool.query('SELECT hazard_source,source_versions FROM climashield.evaluation_runs WHERE id=$1',[official.id]);
      assert.equal(saved.rows[0].hazard_source,'official');assert.ok(saved.rows[0].source_versions.some((s:any)=>s.id===SOURCE_IDS.cenepred));
      assert.equal((await request('/risk/assess',{scenario_id:'severo',hazard_source:'inventada'})).status,422);
    });
    await t.test('SENAMHI: persistencia recortada, conservación ante caída y refresco autorizado',async()=>{
      const c=await pool.connect();
      try {
        await c.query('BEGIN');
        const feature={type:'Feature',geometry:{type:'Polygon',coordinates:[[[-80,-9],[-80,-7],[-78,-7],[-80,-9]]]},properties:{gid:'test-1',nivel:'Nivel 3',fecha:'2026-11-24Z'}};
        const saved=await persistSenamhi(c,{status:'live',retrieved_at:'2099-01-01T00:00:00Z',layers:[{typeName:'g_prono_pp_24h:view_aviso24h',layer:'senamhi_aviso_lluvia',status:'live',total:1,rejected:0,features:[feature as any]}]});
        assert.equal(saved.stored,1);
        const row=(await c.query("SELECT level,ST_CoveredBy(geometry,ST_Buffer(ST_MakeEnvelope(-79.2,-8.25,-78.9,-7.98,4326),1e-9)) AS inside FROM climashield.official_hazard_zones WHERE external_id='senamhi_aviso_lluvia:2026-11-24:test-1'")).rows[0];
        assert.equal(row.level,3);assert.equal(row.inside,true);
        const count=async()=>+(await c.query("SELECT count(*) FROM climashield.official_hazard_zones WHERE layer LIKE 'senamhi%'")).rows[0].count,before=await count();
        await persistSenamhi(c,{status:'unavailable',retrieved_at:new Date().toISOString(),layers:[]});
        assert.equal(await count(),before);assert.equal((await c.query('SELECT status FROM climashield.data_sources WHERE id=$1',[SOURCE_IDS.senamhi])).rows[0].status,'unavailable');
      }finally {await c.query('ROLLBACK');c.release();}
      assert.equal((await request('/sources/senamhi/refresh',{})).status,403);
    });
    await t.test('simulación y validaciones API',async()=>{
      const r=await request('/simulation/run',{business_id:uid('0')});assert.equal(r.status,201);assert.equal(r.data.net_benefit,'1880.00');assert.equal(r.data.mitigated_cash,'-820.00');
      assert.equal((await request('/simulation/run',{business_id:uid('3')})).status,400);assert.equal((await request('/simulation/run',{business_id:uid('0'),days_closed:31})).status,422);
      assert.equal((await request('/businesses/'+uid('nonexistent'))).status,404);
    });
    await t.test('optimización, recursos y cobertura',async()=>{
      const r=await request('/optimization/run',{run_id:run.id,budget_pen:1500,capacity_minutes:480,min_high_priority:2});assert.equal(r.status,201);plan=r.data;
      assert.ok(['OPTIMAL','FEASIBLE'].includes(plan.solver_status));assert.ok(+plan.metrics.cost<=1500);assert.ok(plan.metrics.minutes<=480);assert.ok(plan.metrics.high_coverage>=2);assert.ok(+plan.metrics.net_benefit>=+plan.baseline.net_benefit);
      assert.equal(new Set(plan.selected.map((c:any)=>c.business_id)).size,plan.selected.length);
      const no=await request('/optimization/run',{run_id:run.id,budget_pen:0,capacity_minutes:0,min_high_priority:1});assert.equal(no.data.solver_status,'INFEASIBLE');
    });
    await t.test('borradores idempotentes, autorización y auditoría',async()=>{
      const draft=await request('/interventions/drafts',{plan_id:plan.id});assert.equal(draft.data.created,plan.selected.length);assert.equal((await request('/interventions/drafts',{plan_id:plan.id})).data.created,0);
      const list=(await request('/interventions')).data.items,id=list.find((i:any)=>i.plan_id===plan.id).id;
      assert.equal((await request('/interventions/'+id,{status:'APPROVED'},'PATCH')).status,403);
      const token=process.env.DEMO_COORDINATOR_TOKEN;assert.ok(token,'Configurar DEMO_COORDINATOR_TOKEN en .env para esta prueba');
      assert.equal((await request('/interventions/'+id,{status:'COMPLETED'},'PATCH',token)).status,409);
      for(const status of ['APPROVED','ASSIGNED','CONTACTED','COMPLETED'])assert.equal((await request('/interventions/'+id,{status,reason:'Resultado de prueba sintético'},'PATCH',token)).status,200);
      const audit=(await request('/audit')).data.items;assert.ok(audit.some((e:any)=>e.entity_id===id&&e.action==='STATUS_CHANGED'));
    });
    await t.test('asistente sin clave usa fallback explícito',async()=>{
      if(process.env.GEMINI_API_KEY||process.env.LLM_API_KEY) return t.diagnostic('Hay clave: la prueba live se ejecuta por separado, no se consume cuota automáticamente.');
      const r=await request('/agent/run',{run_id:run.id,question:'Resume la exposición'});assert.equal(r.status,201);assert.equal(r.data.mode,'deterministic');assert.ok(r.data.evidence.length);
    });
    await mkdir('artifacts',{recursive:true});
    await writeFile('artifacts/demo-results.json',JSON.stringify({executed_at:new Date().toISOString(),risk:run.summary,official:official?.summary,official_sources:official?.source_versions?.map((x:any)=>({name:x.name,version:x.version,status:x.status,last_checked_at:x.last_checked_at})),plan:{solver_status:plan.solver_status,metrics:plan.metrics,baseline:plan.baseline,pruned:plan.pruned,elapsed_ms:plan.elapsed_ms}},null,2));
  }finally {await app.close();await pool.end();}
});

