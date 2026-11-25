import {readFile,writeFile,mkdir} from 'node:fs/promises';
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
const result=[];
for(const [path,entry] of Object.entries(lock.packages)) {
  if(!path.startsWith('node_modules/'))continue;
  try {const p=JSON.parse(await readFile(path+'/package.json','utf8'));result.push({name:p.name,version:p.version,license:p.license??'Consultar paquete',dev:!!entry.dev,repository:p.repository??null});}catch{}
}
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/dependency-licenses.json',JSON.stringify(result.sort((a,b)=>a.name.localeCompare(b.name)),null,2));
console.log(`Inventario: ${result.length} paquetes instalados; revisar textos originales de licencia.`);

