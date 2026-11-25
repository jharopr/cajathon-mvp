import { createHash } from 'node:crypto';
export function uid(value:string) { const h=createHash('sha256').update('climashield:'+value).digest('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`; }
export interface Business {
  id:string; code:string; name:string; sector:string; district:string; location:[number,number]|null;
  monthly_revenue:string|null; monthly_fixed_cost:string|null; variable_cost_ratio:string|null;
  inventory_value:string|null; cash_reserve:string|null; vulnerability:number|null; adaptation:number|null;
  balance:string; monthly_installment:string; synthetic:true;
}
const districts:[string,number,number][]=[['El Porvenir',-79.005,-8.075],['Laredo',-78.955,-8.09],['Moche',-79.01,-8.17],['La Esperanza',-79.055,-8.07],['Huanchaco',-79.105,-8.055]];
export function generate(seed=42,count=1000):Business[] {
  let state=seed>>>0;
  const rand=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
  const amount=(min:number,max:number,step=100)=>String(Math.floor((min+rand()*(max-min))/step)*step);
  return Array.from({length:count},(_,i)=>{
    const [district,lon,lat]=districts[i%5]; const sector=['Comercio','Agricultura','Servicios','Manufactura'][i%4];
    const revenue=amount(6000,30000);
    const b:Business={id:uid(String(i)),code:`CS-${String(i+1).padStart(4,'0')}`,name:`${sector} demo ${String(i+1).padStart(4,'0')}`,
      sector,district,location:[+(lon+(rand()-.5)*.036).toFixed(6),+(lat+(rand()-.5)*.03).toFixed(6)],
      monthly_revenue:revenue,monthly_fixed_cost:String(Math.round(+revenue*.38)),variable_cost_ratio:(.15+rand()*.2).toFixed(2),
      inventory_value:amount(1000,18000),cash_reserve:amount(0,4000),vulnerability:+(.4+rand()*.6).toFixed(2),adaptation:+(rand()*.6).toFixed(2),
      balance:amount(5000,50000),monthly_installment:amount(500,2000,50),synthetic:true};
    if(i===0) Object.assign(b,{name:'Bodega Horizonte · caso representativo',location:[-79.005,-8.075],monthly_revenue:'12000',monthly_fixed_cost:'8000',variable_cost_ratio:'0',inventory_value:'6000',cash_reserve:'0',vulnerability:.9,adaptation:.2,balance:'24000',monthly_installment:'1500'});
    if(i===1) b.location=[-79.04,-8.115];
    if(i===2) b.location=null;
    if(i===3) b.monthly_revenue=null;
    if(i===4) b.location=[-79.15,-8.03];
    return b;
  });
}
export function hazards() {
  const boxes=[[-79.04,-8.115,-78.975,-8.045],[-79.025,-8.20,-78.97,-8.135],[-79.075,-8.10,-79.015,-8.045]];
  return {type:'FeatureCollection' as const,features:boxes.map(([a,b,c,d],i)=>({type:'Feature' as const,id:uid('hazard'+i),
    properties:{id:uid('hazard'+i),name:['Corredor este','Corredor Moche','Corredor norte'][i],source:'ClimaShield · polígono hipotético, no oficial',synthetic:true,
      issued_at:'2026-11-24T12:00:00Z',valid_from:'2026-11-24T00:00:00Z',valid_until:'2026-11-30T23:59:59Z'},
    geometry:{type:'Polygon' as const,coordinates:[[[a,b],[c,b],[c,d],[a,d],[a,b]]]}}))};
}

