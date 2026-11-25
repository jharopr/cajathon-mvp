import 'dotenv/config';
import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export async function migrate(connectionString=process.env.DIRECT_URL || process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('Configura DIRECT_URL/DATABASE_URL en .env');
  const client=new pg.Client({connectionString,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock(2026112401)');
    await client.query('CREATE SCHEMA IF NOT EXISTS climashield');
    await client.query('CREATE TABLE IF NOT EXISTS climashield.schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const folder=new URL('../supabase/migrations/',import.meta.url);
    for(const file of (await readdir(folder)).filter(f=>f.endsWith('.sql')).sort()) {
      const sql=await readFile(new URL(file,folder),'utf8'); const checksum=createHash('sha256').update(sql).digest('hex');
      const found=await client.query('SELECT checksum FROM climashield.schema_migrations WHERE version=$1',[file]);
      if(found.rowCount) { if(found.rows[0].checksum!==checksum) throw new Error(`Migración aplicada fue modificada: ${file}`); console.log(`OK ${file} (ya aplicada)`); continue; }
      await client.query('BEGIN');
      try {
        // Resolver esquema de una extensión PostGIS preexistente en Supabase.
        const ext=await client.query("SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='postgis'");
        const schema=ext.rows[0]?.nspname ?? 'extensions';
        await client.query(`SET LOCAL search_path TO climashield,${pg.escapeIdentifier(schema)},extensions,public`);
        await client.query(sql);
        await client.query('INSERT INTO climashield.schema_migrations(version,checksum) VALUES ($1,$2)',[file,checksum]);
        await client.query('COMMIT'); console.log(`APPLIED ${file}`);
      } catch(error) { await client.query('ROLLBACK'); throw error; }
    }
  } finally { await client.query('SELECT pg_advisory_unlock(2026112401)').catch(()=>{}); await client.end(); }
}
if(process.argv[1]?.endsWith('migrate.ts')) migrate().catch(()=>{console.error('Migración fallida. Verifique PostgreSQL, permisos de PostGIS y URLs. No se imprimen credenciales.'); process.exitCode=1;});

