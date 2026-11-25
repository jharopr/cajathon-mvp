export async function api<T>(path:string,body?:unknown,method='POST',token?:string):Promise<T> {
  const res=await fetch('/api/v1'+path,{method:body===undefined?'GET':method,headers:body===undefined?undefined:{'Content-Type':'application/json',...(token?{'X-Coordinator-Token':token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await res.json().catch(()=>({message:'Respuesta del servidor no válida'}));
  if(!res.ok) throw new Error(data.message||'No se pudo completar la operación');
  return data;
}
export const pen=(value:string|number)=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN',maximumFractionDigits:0}).format(Number(value));

