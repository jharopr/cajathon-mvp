import { Decimal } from 'decimal.js';
import { z } from 'zod';
import type { Business } from './data.js';
export const VERSION='experimental-0.2';
export const money=(v:Decimal.Value)=>new Decimal(v).toFixed(2);
export const Assumptions=z.object({days_closed:z.number().min(0).max(30).default(10),inventory_damage_pen:z.number().min(0).max(1e6).default(1200),
  days_mitigation:z.number().min(0).max(1).default(.4),damage_mitigation:z.number().min(0).max(1).default(.4),intervention_cost_pen:z.number().min(0).max(1e5).default(200)}).strict();
export type AssumptionsType=z.infer<typeof Assumptions>;
export function riskScore(h:number|null,e:number|null,v:number|null,c:number|null) {
  if([h,e,v,c].some(x=>x===null)) return null;
  if([h,e,v,c].some(x=>!Number.isFinite(x)||x!<0||x!>1)) throw new Error('Ratios fuera de [0,1]');
  return Math.round(100*h!*e!*v!*(1-.5*c!)*100)/100;
}
export const priority=(score:number|null)=>score===null?'UNKNOWN':score>=65?'ALTA':score>=30?'MEDIA':'BAJA';
export function simulate(b:Business,a:AssumptionsType) {
  const required=[b.monthly_revenue,b.monthly_fixed_cost,b.variable_cost_ratio,b.cash_reserve];
  if(required.some(x=>x===null)) throw new Error('Faltan datos financieros; cálculo bloqueado');
  const [s,f,v,l]=required.map(x=>new Decimal(x!)),q=new Decimal(b.monthly_installment);
  const margin=new Decimal(1).minus(v);
  const normal=s.mul(margin).minus(f).minus(q);
  const stressed=s.mul(new Decimal(1).minus(new Decimal(a.days_closed).div(30))).mul(margin).minus(f).minus(q).minus(a.inventory_damage_pen);
  const before=s.mul(new Decimal(1).minus(new Decimal(a.days_closed).mul(new Decimal(1).minus(a.days_mitigation)).div(30))).mul(margin).minus(f).minus(q)
    .minus(new Decimal(a.inventory_damage_pen).mul(new Decimal(1).minus(a.damage_mitigation)));
  const mitigated=before.minus(a.intervention_cost_pen),gross=before.minus(stressed);
  return {business_id:b.id,baseline_cash:money(normal),stressed_cash:money(stressed),mitigated_cash:money(mitigated),
    incremental_loss:money(normal.minus(stressed)),gross_avoided_loss:money(gross),intervention_cost:money(a.intervention_cost_pen),net_benefit:money(gross.minus(a.intervention_cost_pen)),
    baseline_liquidity:money(l.plus(normal)),stressed_liquidity:money(l.plus(stressed)),mitigated_liquidity:money(l.plus(mitigated)),
    liquidity_gap:money(Decimal.max(0,l.plus(mitigated).neg())),assumptions:a,model_version:VERSION,synthetic:true,horizon_days:30};
}
export type HazardSource='synthetic'|'official';
export const SCENARIO_H={leve:.4,moderado:.65,severo:.9} as const;
export interface Evaluation {hazard_id:string;hazard_name:string;kind:'synthetic'|'susceptibility'|'district'|'alert';exposure:number|null;score:number|null;layer?:string;level?:number;intensity?:number|null;source_id?:string;district_level?:string;}
export interface RiskItem extends Business {
  score:number|null; priority:string; exposed:boolean; financial_ready:boolean; data_quality:string;
  evaluations:Evaluation[]; reasons:string[];
  official_district?:string|null; district_risk?:{flood?:string;mass_movement?:string}|null; alerts?:number; location_issue?:string|null;
}
export interface Run {id:string;scenario_id:'leve'|'moderado'|'severo';hazard_source?:HazardSource;scenario_clock:string;assessed_at:string;model_version:string;
  summary:{total:number;exposed:number;high:number;unknown:number;partial:number;exposed_balance:string;elapsed_ms:number;hazard_source?:HazardSource;
    point_zone?:number;exposed_flood?:number;exposed_mass_movement?:number;under_alert?:number;location_issues?:number};items:RiskItem[];}
export const OptimizeSchema=z.object({run_id:z.string().uuid(),budget_pen:z.number().min(0).max(1e6).default(1500),capacity_minutes:z.number().int().min(0).max(100000).default(480),min_high_priority:z.number().int().min(0).max(1000).default(0)}).strict();
export type OptimizeInput=z.infer<typeof OptimizeSchema>;
export const ACTIONS=[{code:'CALL',name:'Llamada preventiva',minutes:10,cost:20,days:.1,damage:.05},
  {code:'INVENTORY',name:'Verificar protección de inventario',minutes:20,cost:80,days:.25,damage:.4},
  {code:'LIQUIDITY',name:'Evaluar liquidez y continuidad',minutes:30,cost:120,days:.4,damage:.2}];
export interface Candidate {business_id:string;code:string;name:string;priority:string;action_code:string;action:string;cost:number;minutes:number;net_benefit:string;evidence_id:string;}
export function candidates(run:Run):Candidate[][] {
  return [...run.items].sort((a,b)=>a.code.localeCompare(b.code)).filter(b=>b.exposed&&b.financial_ready&&b.score!==null).map(b=>ACTIONS.map(action=>{
    const a={days_closed:{leve:3,moderado:6,severo:10}[run.scenario_id],inventory_damage_pen:+b.inventory_value!*.2,days_mitigation:action.days,damage_mitigation:action.damage,intervention_cost_pen:action.cost};
    return {business_id:b.id,code:b.code,name:b.name,priority:b.priority,action_code:action.code,action:action.name,cost:action.cost,minutes:action.minutes,
      net_benefit:simulate(b,a).net_benefit,evidence_id:`${run.id}:${b.id}`};
  }).filter(c=>+c.net_benefit>0));
}
export function metrics(items:Candidate[]) {return {coverage:items.length,high_coverage:items.filter(c=>c.priority==='ALTA').length,cost:money(items.reduce((s,c)=>s+c.cost,0)),
  minutes:items.reduce((s,c)=>s+c.minutes,0),net_benefit:money(items.reduce((s,c)=>s.plus(c.net_benefit),new Decimal(0)))};}
// Programación dinámica de mochila de opciones múltiples; tope de estados explícito.
// Si hay poda, se informa FEASIBLE/UNKNOWN, nunca se certifica optimalidad.
export function optimizeGroups(groups:Candidate[][],p:OptimizeInput,stateLimit=6000) {
  type State={cost:number;minutes:number;high:number;benefit:number;previous?:State;item?:Candidate};
  let states=new Map<string,State>([['0:0:0',{cost:0,minutes:0,high:0,benefit:0}]]),pruned=false;
  const budget=Math.floor(p.budget_pen*100);
  for(const group of groups) {
    const choices=group.map(item=>({item,benefit:new Decimal(item.net_benefit).mul(100).toNumber()}));
    let next=new Map(states);
    for(const s of states.values()) for(const choice of choices) {
      const c=choice.item;
      const cost=s.cost+c.cost*100,minutes=s.minutes+c.minutes,high=Math.min(p.min_high_priority,s.high+(c.priority==='ALTA'?1:0));
      if(cost>budget||minutes>p.capacity_minutes) continue;
      const benefit=s.benefit+choice.benefit,key=`${cost}:${minutes}:${high}`,prior=next.get(key);
      if(!prior||benefit>prior.benefit) next.set(key,{cost,minutes,high,benefit,previous:s,item:c});
    }
    if(next.size>stateLimit) {
      pruned=true;
      // Mantener parte de los estados por cobertura para no perder toda factibilidad.
      const sorted=[...next.values()].sort((a,b)=>b.benefit-a.benefit||a.cost-b.cost);
      const byHigh=[...next.values()].sort((a,b)=>b.high-a.high||b.benefit-a.benefit);
      const kept=[...byHigh.slice(0,Math.floor(stateLimit/4)),...sorted.slice(0,Math.ceil(stateLimit*3/4))];
      next=new Map(kept.map(s=>[`${s.cost}:${s.minutes}:${s.high}`,s]));
    }
    states=next;
  }
  let best=[...states.values()].filter(s=>s.high>=p.min_high_priority).sort((a,b)=>b.benefit-a.benefit||a.cost-b.cost||a.minutes-b.minutes)[0];
  const selected:Candidate[]=[]; const feasible=!!best;
  while(best?.item) {selected.push(best.item);best=best.previous!;}
  selected.reverse();
  const fifo:Candidate[]=[];const used=new Set<string>();let cost=0,minutes=0;
  const pick=(c:Candidate)=>{if(!used.has(c.business_id)&&cost+c.cost<=p.budget_pen&&minutes+c.minutes<=p.capacity_minutes){fifo.push(c);used.add(c.business_id);cost+=c.cost;minutes+=c.minutes;}};
  const flat=groups.flat();
  for(const c of flat) {if(fifo.filter(x=>x.priority==='ALTA').length>=p.min_high_priority) break;if(c.priority==='ALTA') pick(c);}
  for(const c of flat) pick(c);
  return {solver_status:feasible?(pruned?'FEASIBLE':'OPTIMAL'):(pruned?'UNKNOWN':'INFEASIBLE'),selected,metrics:metrics(selected),baseline:metrics(fifo),
    baseline_feasible:fifo.filter(x=>x.priority==='ALTA').length>=p.min_high_priority,constraints:p,candidate_count:flat.length,
    algorithm:'Programación dinámica de opciones múltiples (TypeScript)',state_limit:stateLimit,pruned,
    assumptions:'Costos y eficacia hipotéticos; beneficio neto modelado. Una acción por negocio. No son ahorros observados.'};
}
export const transitions:Record<string,string[]>={DRAFT:['APPROVED','CANCELLED'],APPROVED:['ASSIGNED','CANCELLED'],ASSIGNED:['CONTACTED','CANCELLED'],CONTACTED:['COMPLETED','CANCELLED'],COMPLETED:[],CANCELLED:[]};

