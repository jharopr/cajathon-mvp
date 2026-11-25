/** Diagnóstico con datos sintéticos: no imprime secretos ni modifica .env. */
import 'reflect-metadata';
import 'dotenv/config';
import {mkdir,writeFile} from 'node:fs/promises';
import {pool} from '../apps/api/src/database.js';
import {Repository} from '../apps/api/src/repository.js';
import {runAgent} from '../apps/api/src/agent.js';
const repo=new Repository();
try {
  const {rows}=await pool.query('SELECT id FROM climashield.evaluation_runs ORDER BY assessed_at DESC LIMIT 1');
  if(!rows[0])throw new Error('Falta evaluación sintética para el diagnóstico');
  const run=await repo.run(rows[0].id);
  const response=await runAgent('Consulta get_exposed_businesses y explica brevemente qué negocios sintéticos están expuestos. Cita las evidencias y aclara las limitaciones.',run,repo);
  const result={checked_at:new Date().toISOString(),provider:response.provider,mode:response.mode,tools:response.trace,evidence_count:response.evidence.length,answer:response.answer};
  await mkdir('artifacts/diagnostics',{recursive:true});
  await writeFile('artifacts/diagnostics/gemini-agent.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({ok:true,mode:response.mode,provider:response.provider,tools:response.trace,evidence_count:response.evidence.length}));
}catch(error) {
  const e=error as {status?:number;name?:string};
  console.log(JSON.stringify({ok:false,status:e.status??null,error_type:e.name??'Error',note:'No se imprimen detalles que puedan contener credenciales.'}));
  process.exitCode=1;
}finally{await pool.end();}
