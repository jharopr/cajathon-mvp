import { mkdir,writeFile } from 'node:fs/promises';
import {generate,hazards} from '../apps/api/src/data.js';
await mkdir('data/synthetic',{recursive:true});
const businesses=generate();
// CS-0006 tiene un segundo crédito en el seed; exportar el agregado equivalente.
businesses[5].balance=String(+businesses[5].balance+2500);
businesses[5].monthly_installment=String(+businesses[5].monthly_installment+100);
await writeFile('data/synthetic/portfolio.json',JSON.stringify(businesses,null,2));
await writeFile('data/synthetic/hazards.geojson',JSON.stringify(hazards(),null,2));
const keys=Object.keys(businesses[0]) as (keyof typeof businesses[0])[];
const quote=(v:unknown)=>`"${String(v??'').replaceAll('"','""')}"`;
await writeFile('data/synthetic/portfolio.csv',[keys.join(','),...businesses.map(b=>keys.map(k=>quote(k==='location'?b.location?.join(' '):b[k])).join(','))].join('\n'));
console.log('Dataset exportado: 1000 negocios, seed 42.');

