import 'dotenv/config';
import { pool,transaction } from '../apps/api/src/database.js';
import { generate,hazards,uid } from '../apps/api/src/data.js';
import { loadCenepred,loadSenamhiSnapshot,upsertSyntheticAndForecastSources } from '../apps/api/src/official.js';
export async function seed() {
  await transaction(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(2026112402)');
    await upsertSyntheticAndForecastSources(c);
    const existing=await c.query('SELECT count(*) FROM climashield.businesses');
    if(+existing.rows[0].count>0) console.log('Cartera ficticia ya existe: no se sobrescribe.');
    else {
      for(const b of generate()) {
        await c.query(`INSERT INTO climashield.businesses(id,code,name,sector,district,location,monthly_revenue,monthly_fixed_cost,variable_cost_ratio,inventory_value,cash_reserve,vulnerability,adaptation)
          VALUES($1,$2,$3,$4,$5,CASE WHEN $6::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($6,$7),4326) END,$8,$9,$10,$11,$12,$13,$14)`,
          [b.id,b.code,b.name,b.sector,b.district,b.location?.[0]??null,b.location?.[1]??null,b.monthly_revenue,b.monthly_fixed_cost,b.variable_cost_ratio,b.inventory_value,b.cash_reserve,b.vulnerability,b.adaptation]);
        await c.query("INSERT INTO climashield.loans(id,business_id,balance,monthly_installment,status) VALUES($1,$2,$3,$4,'ACTIVE')",[uid('loan'+b.id),b.id,b.balance,b.monthly_installment]);
      }
      await c.query("INSERT INTO climashield.loans(id,business_id,balance,monthly_installment,status) VALUES($1,$2,2500,100,'ACTIVE')",[uid('second-loan'),uid('5')]);
      for(const h of hazards().features) await c.query(`INSERT INTO climashield.climate_hazards(id,name,geometry,source_id,intensity,valid_from,valid_until,issued_at)
        VALUES($1,$2,ST_SetSRID(ST_GeomFromGeoJSON($3),4326),$4,.9,$5,$6,$7)`,[h.id,h.properties.name,JSON.stringify(h.geometry),uid('source'),h.properties.valid_from,h.properties.valid_until,h.properties.issued_at]);
      console.log('Seed sintético: 1000 negocios ficticios, 1001 créditos, 3 amenazas hipotéticas.');
    }
    // Capas oficiales públicas: idempotentes por checksum/fecha de consulta, independientes de la cartera.
    const cenepred=await loadCenepred(c);
    console.log(cenepred.loaded?`CENEPRED cargado: ${cenepred.zones} zonas, ${cenepred.districts} distritos.`:'CENEPRED sin cambios (checksum igual).');
    const senamhi=await loadSenamhiSnapshot(c);
    console.log(senamhi.loaded?`Instantánea SENAMHI cargada (${(senamhi as any).stored} zonas).`:'Instantánea SENAMHI no aplicada (ausente o más antigua que la última consulta).');
  });
}
if(process.argv[1]?.endsWith('seed.ts')) seed().catch(e=>{console.error('Seed falló; verifique migraciones y conexión.',e instanceof Error?e.message:'');process.exitCode=1;}).finally(()=>pool.end());
