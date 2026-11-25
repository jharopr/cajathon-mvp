import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../apps/api/src/data.js';
import { riskScore,priority,simulate,Assumptions,optimizeGroups,OptimizeSchema,type Candidate } from '../apps/api/src/domain.js';
import { executeTool,runAgent } from '../apps/api/src/agent.js';

test('cartera reproducible, 1000 negocios y casos extremos',()=>{const rows=generate();assert.deepEqual(rows,generate());assert.equal(rows.length,1000);assert.equal(rows[2].location,null);assert.equal(rows[3].monthly_revenue,null);assert.notDeepEqual(rows,generate(43));});
test('índice conocido, límites, ausencia de datos y monotonicidad',()=>{
  assert.equal(riskScore(.9,1,.9,.2),72.9);assert.equal(priority(72.9),'ALTA');assert.equal(riskScore(1,0,1,0),0);assert.equal(riskScore(.9,null,.9,.2),null);
  for(let i=1;i<=10;i++){const h=i/10;assert.ok(riskScore(h,1,.8,.2)!>=riskScore(h-.1,1,.8,.2)!);assert.ok(riskScore(.9,1,h,.2)!>=riskScore(.9,1,h-.1,.2)!);assert.ok(riskScore(.9,1,.8,h)!<=riskScore(.9,1,.8,h-.1)!);}
  assert.throws(()=>riskScore(1.1,1,1,0));assert.throws(()=>riskScore(NaN,1,1,0));
});
test('simulación exacta del caso representativo y costo una sola vez',()=>{
  const r=simulate(generate()[0],Assumptions.parse({}));assert.equal(r.baseline_cash,'2500.00');assert.equal(r.stressed_cash,'-2700.00');assert.equal(r.mitigated_cash,'-820.00');assert.equal(r.gross_avoided_loss,'2080.00');assert.equal(r.net_benefit,'1880.00');assert.equal(r.liquidity_gap,'820.00');
});
test('simulación bloquea datos ausentes y valida ratios/días',()=>{assert.throws(()=>simulate(generate()[3],Assumptions.parse({})));assert.equal(Assumptions.safeParse({days_closed:31}).success,false);assert.equal(Assumptions.safeParse({damage_mitigation:1.1}).success,false);});
const c=(id:string,cost:number,minutes:number,benefit:number,priority='ALTA'):Candidate=>({business_id:id,code:id,name:id,priority,action_code:'test',action:'test',cost,minutes,net_benefit:String(benefit),evidence_id:id});
test('optimizador encuentra óptimo conocido con una acción por negocio',()=>{
  const p=OptimizeSchema.parse({run_id:'00000000-0000-4000-a000-000000000000',budget_pen:100,capacity_minutes:30});
  const result=optimizeGroups([[c('a',20,10,100),c('a',80,20,500)],[c('b',20,10,200)]],p);
  assert.equal(result.solver_status,'OPTIMAL');assert.equal(result.metrics.net_benefit,'700.00');assert.equal(result.metrics.cost,'100.00');assert.equal(result.metrics.coverage,2);assert.equal(result.metrics.minutes,30);
});
test('presupuesto cero, cobertura imposible y búsqueda limitada se informan',()=>{
  const p=OptimizeSchema.parse({run_id:'00000000-0000-4000-a000-000000000000',budget_pen:0,capacity_minutes:10});assert.equal(optimizeGroups([[c('a',20,10,100)]],p).metrics.coverage,0);
  assert.equal(optimizeGroups([[c('a',20,10,100)]],{...p,min_high_priority:1}).solver_status,'INFEASIBLE');
  const r=optimizeGroups([[c('a',20,10,100),c('a',80,20,500)]],{...p,budget_pen:100,capacity_minutes:30},1);assert.equal(r.pruned,true);assert.equal(r.solver_status,'FEASIBLE');
});
test('restricciones y cobertura mínima en una cartera mayor',()=>{
  const groups=Array.from({length:30},(_,i)=>[c(String(i),20,10,100+i,i<10?'ALTA':'MEDIA'),c(String(i),80,20,300+i,i<10?'ALTA':'MEDIA')]);
  const p=OptimizeSchema.parse({run_id:'00000000-0000-4000-a000-000000000000',budget_pen:500,capacity_minutes:150,min_high_priority:5});
  const r=optimizeGroups(groups,p);assert.ok(+r.metrics.cost<=500);assert.ok(r.metrics.minutes<=150);assert.ok(r.metrics.high_coverage>=5);assert.equal(new Set(r.selected.map(x=>x.business_id)).size,r.selected.length);
});
test('herramientas del LLM rechazan acciones y argumentos no permitidos',async()=>{await assert.rejects(executeTool('approve_intervention',{},{} as any,{} as any));await assert.rejects(executeTool('calculate_business_risk',{business_id:'invalido'},{} as any,{} as any));});
test('bucle Gemini procesa tool calling real del protocolo con cliente de prueba',async()=>{
  let n=0;const client={interactions:{create:async(input:any)=>{n++;assert.equal(input.store,false);if(n===1)return {steps:[{type:'function_call',id:'call1',name:'get_prevention_guidelines',arguments:{sector:'Comercio'}}]};assert.equal(input.input.at(-1).type,'function_result');return {steps:[],output_text:'Revisar continuidad cuando sea seguro; datos sintéticos.'};}}};
  const r=await runAgent('Explica pautas',{} as any,{} as any,client);assert.equal(r.mode,'gemini');assert.equal(r.trace[0].tool,'get_prevention_guidelines');assert.equal(n,2);
});


import { readShx,readDbf,parsePolygon,bboxIntersects } from '../apps/api/src/shapefile.js';
import { fetchSenamhi,senamhiValidity,freshness,LEVEL_WEIGHT,DISTRICT_WEIGHT,AREA_OF_INTEREST } from '../apps/api/src/official.js';
function polygonContent(rings:[number,number][][]) {
  const pts=rings.flat(),buf=Buffer.alloc(44+rings.length*4+pts.length*16);
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  buf.writeInt32LE(5,0);[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)].forEach((v,i)=>buf.writeDoubleLE(v,4+i*8));
  buf.writeInt32LE(rings.length,36);buf.writeInt32LE(pts.length,40);
  let start=0;rings.forEach((r,i)=>{buf.writeInt32LE(start,44+i*4);start+=r.length;});
  pts.forEach(([x,y],i)=>{buf.writeDoubleLE(x,44+rings.length*4+i*16);buf.writeDoubleLE(y,44+rings.length*4+i*16+8);});
  return buf;
}
test('lector shapefile: índice, DBF UTF-8 y filtro de anillos por recuadro',()=>{
  const near:[number,number][]=[[-79.05,-8.12],[-79.05,-8.10],[-79.03,-8.10],[-79.03,-8.12],[-79.05,-8.12]];
  const far:[number,number][]=[[-75,-12],[-75,-11.9],[-74.9,-11.9],[-75,-12]];
  const r=parsePolygon(polygonContent([near,far]),0,AREA_OF_INTEREST.bbox)!;
  assert.equal(r.totalRings,2);assert.equal(r.rings.length,1);assert.deepEqual(r.rings[0][0],[-79.05,-8.12]);
  assert.equal(parsePolygon(Buffer.alloc(4),1),null);
  const shx=Buffer.alloc(116);shx.writeInt32BE(9994,0);shx.writeInt32BE(50,100);shx.writeInt32BE(30,104);shx.writeInt32BE(84,108);shx.writeInt32BE(20,112);
  assert.deepEqual(readShx(shx),[{offset:100,length:60},{offset:168,length:40}]);assert.throws(()=>readShx(Buffer.alloc(100)));
  const name=Buffer.from('región','utf8'),dbf=Buffer.alloc(32+32+1+1+12);
  dbf.writeUInt32LE(1,4);dbf.writeUInt16LE(65,8);dbf.writeUInt16LE(13,10);Buffer.from('region').copy(dbf,32);dbf[43]=67;dbf[48]=12;dbf[64]=0x0d;dbf[65]=0x20;name.copy(dbf,66);dbf.fill(0x20,66+name.length);
  assert.deepEqual(readDbf(dbf).rows,[{region:'región'}]);
  assert.equal(bboxIntersects([0,0,1,1],[1,1,2,2]),true);assert.equal(bboxIntersects([0,0,1,1],[1.1,0,2,1]),false);
});
test('SENAMHI: vigencia de 24 h en hora de Lima y frescura derivada',()=>{
  assert.deepEqual(senamhiValidity('2026-11-24Z'),{valid_from:'2026-11-24T05:00:00.000Z',valid_until:'2026-11-25T05:00:00.000Z'});
  assert.equal(freshness({status:'current',valid_until:'2026-01-01T00:00:00Z',data_kind:'official_static'},new Date('2026-11-24')),'stale');
  assert.equal(freshness({status:'current',valid_until:null,data_kind:'official_alert'}),'current');assert.equal(freshness({status:'unavailable',valid_until:null,data_kind:'x'}),'unavailable');
  for(let l=2;l<=5;l++)assert.ok(LEVEL_WEIGHT[l]>LEVEL_WEIGHT[l-1]);assert.ok(DISTRICT_WEIGHT['Muy Alto']>DISTRICT_WEIGHT.Alto);
});
test('SENAMHI: valida esquema, descarta fuera del área y distingue vacío de caída',async()=>{
  const inside={type:'Feature',geometry:{type:'Polygon',coordinates:[[[-79.1,-8.2],[-79.1,-8.0],[-78.95,-8.0],[-79.1,-8.2]]]},properties:{gid:6,nivel:'Nivel 1',fecha:'2026-11-24Z'}};
  const outside={...inside,geometry:{type:'Polygon',coordinates:[[[-75,-12],[-75,-11],[-74,-11],[-75,-12]]]}};
  const invalid={type:'Feature',geometry:{type:'Point',coordinates:[-79,-8]},properties:{gid:1,nivel:'x',fecha:'?'}};
  const ok=(body:unknown)=>(async()=>new Response(JSON.stringify(body),{status:200}))as unknown as typeof fetch;
  const live=await fetchSenamhi(ok({type:'FeatureCollection',features:[inside,outside,invalid]}));
  assert.equal(live.status,'live');assert.equal(live.layers[0].features.length,1);assert.equal(live.layers[0].rejected,2);
  assert.equal((await fetchSenamhi(ok({type:'FeatureCollection',features:[]}))).status,'empty');
  const down=await fetchSenamhi((async()=>{throw new Error('timeout');}) as unknown as typeof fetch);assert.equal(down.status,'unavailable');assert.ok(down.layers.every(l=>l.status==='unavailable'));
  assert.equal((await fetchSenamhi((async()=>new Response('<html>',{status:200})) as unknown as typeof fetch)).status,'unavailable');
});
