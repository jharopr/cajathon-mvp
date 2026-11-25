// Ingesta del paquete SHAPE de CENEPRED/SIGRID (102_shape.zip) para el área de Trujillo.
// Uso: npm run data:cenepred -- --dir data/raw/cenepred-102 [--zip ruta/102_shape.zip]
// Lee shapefiles por desplazamiento, recorta/simplifica con PostGIS en tablas temporales y escribe
// GeoJSON compacto + manifiesto en data/official/. No modifica tablas del esquema climashield.
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pool } from '../apps/api/src/database.js';
import { openShapefile, readPolygons, ringToWkt, type BBox } from '../apps/api/src/shapefile.js';
import { AREA_OF_INTEREST, LEVEL_LABELS, CENEPRED_DOCUMENT_URL, CENEPRED_VALID_FROM, CENEPRED_VALID_UNTIL } from '../apps/api/src/official.js';

const args = Object.fromEntries(process.argv.slice(2).reduce<string[][]>((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const dir = args.dir ?? 'data/raw/cenepred-102';
const SIMPLIFY = 0.00005; // ≈5.5 m en Trujillo; suficiente para cruce con puntos aproximados.
const DISTRICT_SIMPLIFY = 0.0002;
const PROVINCE = '1301'; // Trujillo, La Libertad
const area: BBox = AREA_OF_INTEREST.bbox;

const susceptibility = [
  { file: 'Suscep_Inund', layer: 'cenepred_suscep_inundacion', hazard_type: 'flood' },
  { file: 'Suscep_MMasa', layer: 'cenepred_suscep_mmasa', hazard_type: 'mass_movement' },
] as const;

async function sha256(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}
const num = (v: string | undefined) => (v === undefined || v === '' ? null : Number(v));

async function main() {
  for (const f of ['Suscep_Inund', 'Suscep_MMasa', 'Dist_Riesgo_Inundacion_', 'Dist_Riesgo_MMasa_'])
    if (!existsSync(join(dir, f + '.shp'))) throw new Error(`Falta ${f}.shp en ${dir}. Extraiga 102_shape.zip en esa carpeta.`);
  const client = await pool.connect();
  const files: { name: string; modified: string; records: number; selected: number }[] = [];
  try {
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE raw_rings(layer text, level int, record int, ring geometry(LineString,4326)) ON COMMIT DROP');
    const envelope = `ST_MakeEnvelope(${area.join(',')},4326)`;

    for (const s of susceptibility) {
      const shp = openShapefile(join(dir, s.file));
      let selected = 0;
      for (const rec of readPolygons(shp.shp, shp.shx, i => shp.dbf.rows[i].region === 'LA LIBERTAD', area)) {
        selected++;
        const level = Number(shp.dbf.rows[rec.index].GRIDCODE);
        if (!(level >= 1 && level <= 5)) throw new Error(`GRIDCODE inesperado en ${s.file}#${rec.index}`);
        for (let k = 0; k < rec.rings.length; k += 400)
          await client.query(`INSERT INTO raw_rings SELECT $1,$2,$3,ST_GeomFromText(w,4326) FROM unnest($4::text[]) AS w`, [s.layer, level, rec.index, rec.rings.slice(k, k + 400).map(ringToWkt)]);
      }
      files.push({ name: s.file + '.shp', modified: statSync(join(dir, s.file + '.shp')).mtime.toISOString(), records: shp.shx.length, selected });
    }
    // Reconstruye áreas con huecos por registro, recorta al área de interés, disuelve por nivel y separa polígonos.
    const zones = await client.query(`
      WITH built AS (SELECT layer, level, ST_MakeValid(ST_BuildArea(ST_Collect(ring))) AS g FROM raw_rings GROUP BY layer, level, record),
      clipped AS (SELECT layer, level, ST_Intersection(g, ${envelope}) AS g FROM built WHERE g IS NOT NULL),
      dissolved AS (SELECT layer, level, ST_Union(ST_CollectionExtract(g,3)) AS g FROM clipped GROUP BY layer, level),
      simple AS (SELECT layer, level, ST_MakeValid(ST_SimplifyPreserveTopology(g, $1)) AS g FROM dissolved),
      parts AS (SELECT layer, level, (ST_Dump(ST_CollectionExtract(g,3))).geom AS g FROM simple)
      SELECT layer, level, row_number() OVER (PARTITION BY layer, level ORDER BY ST_XMin(g), ST_YMin(g)) AS n,
        ST_AsGeoJSON(ST_Multi(g), 6)::json AS geometry, ST_Area(g::geography) AS m2
      FROM parts WHERE ST_Area(g::geography) >= 50 ORDER BY layer, level, n`, [SIMPLIFY]);

    const susFeatures = zones.rows.map(r => ({
      type: 'Feature', geometry: r.geometry,
      properties: { external_id: `${r.layer}:L${r.level}:${r.n}`, layer: r.layer, hazard_type: susceptibility.find(s => s.layer === r.layer)!.hazard_type,
        level: r.level, level_label: LEVEL_LABELS[r.level], region: 'LA LIBERTAD', area_m2: Math.round(r.m2) },
    }));

    // Riesgo distrital: ambos archivos comparten geometría por UBIGEO; se guarda una vez con atributos de ambos peligros.
    const flood = openShapefile(join(dir, 'Dist_Riesgo_Inundacion_')), mass = openShapefile(join(dir, 'Dist_Riesgo_MMasa_'));
    const massByUbigeo = new Map(mass.dbf.rows.map(r => [r.UBIGEO, r]));
    await client.query('CREATE TEMP TABLE raw_districts(ubigeo text, ring geometry(LineString,4326)) ON COMMIT DROP');
    const attributes = new Map<string, Record<string, unknown>>();
    for (const rec of readPolygons(flood.shp, flood.shx, i => flood.dbf.rows[i].IDPROV === PROVINCE)) {
      const f = flood.dbf.rows[rec.index], m = massByUbigeo.get(f.UBIGEO);
      if (!m) throw new Error(`UBIGEO ${f.UBIGEO} sin registro de movimientos en masa`);
      attributes.set(f.UBIGEO, {
        ubigeo: f.UBIGEO, department: f.NOMBDEP, province: f.NOMBPROV, district: f.NOMBDIST, population_total: num(f.pob_tot), dwellings_total: num(f.viv_total),
        flood: { risk_level: f.nriesg_inu, risk_value: num(f.vriesg_inu), susceptibility_level: f.n_sinu, vulnerability_level: f.n_vuln_inu, population_exposed: num(f.pob_sinu), dwellings_exposed: num(f.viv_sinu) },
        mass_movement: { risk_level: m.nriesg_mm, risk_value: num(m.vriesg_mm), susceptibility_level: m.n_smm, vulnerability_level: m.n_vuln_mm, population_exposed: num(m.pob_smm), dwellings_exposed: num(m.viv_smm) },
      });
      await client.query(`INSERT INTO raw_districts SELECT $1,ST_GeomFromText(w,4326) FROM unnest($2::text[]) AS w`, [f.UBIGEO, rec.rings.map(ringToWkt)]);
    }
    files.push({ name: 'Dist_Riesgo_Inundacion_.shp', modified: statSync(join(dir, 'Dist_Riesgo_Inundacion_.shp')).mtime.toISOString(), records: flood.shx.length, selected: attributes.size });
    files.push({ name: 'Dist_Riesgo_MMasa_.shp', modified: statSync(join(dir, 'Dist_Riesgo_MMasa_.shp')).mtime.toISOString(), records: mass.shx.length, selected: attributes.size });
    const districts = await client.query(`
      SELECT ubigeo, ST_AsGeoJSON(ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SimplifyPreserveTopology(ST_MakeValid(ST_BuildArea(ST_Collect(ring))), $1)),3)), 6)::json AS geometry
      FROM raw_districts GROUP BY ubigeo ORDER BY ubigeo`, [DISTRICT_SIMPLIFY]);
    const districtFeatures = districts.rows.map(r => ({ type: 'Feature', geometry: r.geometry, properties: attributes.get(r.ubigeo) }));
    await client.query('ROLLBACK'); // Solo tablas temporales: nada que persistir.

    const generated_at = new Date().toISOString();
    const zip = args.zip && existsSync(args.zip) ? { package: basename(args.zip), package_bytes: statSync(args.zip).size, package_sha256: await sha256(args.zip), retrieved_at: statSync(args.zip).mtime.toISOString() } : null;
    const manifest = {
      dataset: 'cenepred-102', publisher: 'CENEPRED · SIGRID',
      title: 'Escenario de riesgo ante lluvias, noviembre 2026 – enero 2027 (paquete SHAPE 102)',
      document_url: CENEPRED_DOCUMENT_URL, ...(zip ?? { package: '102_shape.zip', package_sha256: null }),
      scenario_valid_from: CENEPRED_VALID_FROM, scenario_valid_until: CENEPRED_VALID_UNTIL, files,
      area_of_interest: AREA_OF_INTEREST,
      processing: { script: 'scripts/ingest-cenepred.ts', generated_at, simplify_tolerance_deg: SIMPLIFY, district_simplify_tolerance_deg: DISTRICT_SIMPLIFY, coordinate_precision: 6, min_part_area_m2: 50, crs: 'EPSG:4326' },
      outputs: { susceptibility_features: susFeatures.length, districts: districtFeatures.length },
      assumptions: [
        'GRIDCODE 1–5 se interpreta como susceptibilidad muy baja, baja, media, alta y muy alta; el XML del paquete no trae la leyenda y debe confirmarse con CENEPRED.',
        'La susceptibilidad es cartografía de condición del territorio, no un aviso ni un evento ocurrido.',
        'Geometrías recortadas al área de interés y simplificadas; no sustituyen la cartografía original para decisiones de campo.',
      ],
      license_note: 'Datos públicos de CENEPRED/SIGRID. Conservar atribución y revisar condiciones de uso de la entidad antes de redistribuir o usar en producción.',
    };
    await mkdir('data/official', { recursive: true });
    await writeFile('data/official/cenepred-susceptibilidad-trujillo.geojson', JSON.stringify({ type: 'FeatureCollection', features: susFeatures }));
    await writeFile('data/official/cenepred-riesgo-distrital-trujillo.geojson', JSON.stringify({ type: 'FeatureCollection', features: districtFeatures }));
    await writeFile('data/official/cenepred-manifest.json', JSON.stringify(manifest, null, 2));
    const counts = susFeatures.reduce<Record<string, number>>((a, f) => ({ ...a, [`${f.properties.layer}:L${f.properties.level}`]: (a[`${f.properties.layer}:L${f.properties.level}`] ?? 0) + 1 }), {});
    console.log('CENEPRED procesado:', { zonas: susFeatures.length, distritos: districtFeatures.length, ...counts });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); await pool.end(); }
}
main().catch(e => { console.error('Ingesta CENEPRED fallida:', e instanceof Error ? e.message : e); process.exitCode = 1; });
