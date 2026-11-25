import 'dotenv/config';
import pg, { type PoolClient } from 'pg';
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  max: 5, connectionTimeoutMillis: 5000,
  options: '-c search_path=climashield,extensions,public',
});
pool.on('error', () => console.error('Conexión PostgreSQL interrumpida'));
export async function transaction<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T> {
  const client=await pool.connect();
  try { await client.query('BEGIN'); const result=await fn(client); await client.query('COMMIT'); return result; }
  catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

