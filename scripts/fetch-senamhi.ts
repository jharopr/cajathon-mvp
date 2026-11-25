// Consulta avisos SENAMHI (IDESEP WFS) para el área de demo, guarda una instantánea versionable
// en data/official/ y la persiste en PostgreSQL. Uso: npm run data:senamhi
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { pool, transaction } from '../apps/api/src/database.js';
import { fetchSenamhi, persistSenamhi } from '../apps/api/src/official.js';

const result = await fetchSenamhi();
try {
  if (result.status !== 'unavailable') {
    await mkdir('data/official', { recursive: true });
    await writeFile('data/official/senamhi-avisos-snapshot.json', JSON.stringify(result));
  }
  const saved = await transaction(c => persistSenamhi(c, result));
  console.log('SENAMHI:', JSON.stringify(saved));
  if (result.status === 'unavailable') process.exitCode = 2;
} catch (e) {
  console.error('No se pudo persistir SENAMHI:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally { await pool.end(); }
