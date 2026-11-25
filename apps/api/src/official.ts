// Fuentes oficiales públicas: CENEPRED (cartografía estática versionada) y SENAMHI (avisos con vigencia).
// Conectores con URL fija, validación de geometría y estados explícitos. Nunca rellenan con datos ficticios.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { uid } from './data.js';
import { bboxIntersects, type BBox } from './shapefile.js';

export const AREA_OF_INTEREST = { bbox: [-79.2, -8.25, -78.9, -7.98] as BBox, description: 'Trujillo metropolitano y periurbano, La Libertad (recorte de demo)' };
export const LEVEL_LABELS: Record<number, string> = { 1: 'Muy baja', 2: 'Baja', 3: 'Media', 4: 'Alta', 5: 'Muy alta' };
/** Peso hipotético de la susceptibilidad sobre la intensidad del escenario. Versionado, no calibrado. */
export const LEVEL_WEIGHT: Record<number, number> = { 1: 0.1, 2: 0.25, 3: 0.5, 4: 0.75, 5: 1 };
export const EXPOSURE_MIN_LEVEL = 3;
/** Susceptibilidad distrital (n_sinu / n_smm) y factor por menor resolución espacial. Hipótesis versionadas. */
export const DISTRICT_WEIGHT: Record<string, number> = { Bajo: 0.25, Medio: 0.5, Alto: 0.75, 'Muy Alto': 1 };
export const DISTRICT_RESOLUTION = 0.8;
export const CENEPRED_DOCUMENT_URL = 'https://sigrid.cenepred.gob.pe/sigridv3/documento/23277';
export const CENEPRED_VALID_FROM = '2026-11-01T00:00:00-05:00';
export const CENEPRED_VALID_UNTIL = '2027-02-01T00:00:00-05:00';
export const SOURCE_IDS = { synthetic: uid('source'), cenepred: uid('source:cenepred-102'), senamhi: uid('source:senamhi-idesep-wfs'), openmeteo: uid('source:open-meteo') };
export const SENAMHI_WFS = 'https://idesep.senamhi.gob.pe/geoserver/ows';
export const SENAMHI_LAYERS = [
  { typeName: 'g_prono_pp_24h:view_aviso24h', layer: 'senamhi_aviso_lluvia', hazard_type: 'rain', title: 'Aviso por lluvias, pronóstico 24 h' },
  { typeName: 'g_acti_quebrada:view_av_activ_qdra', layer: 'senamhi_activacion_quebrada', hazard_type: 'mass_movement', title: 'Aviso de activación de quebradas' },
] as const;
/** Política de actualización propuesta. Solo SENAMHI tiene refresco opcional automatizado (SENAMHI_REFRESH_MINUTES). */
export const UPDATE_POLICY = [
  { source: 'Paquete CENEPRED (escenario nov 2026 – ene 2027)', policy: 'Revisar mensualmente si existe nueva versión; descargar solo cuando cambie (checksum).', automated: false },
  { source: 'Cartografía de susceptibilidad CENEPRED', policy: 'Reemplazar cuando la entidad publique una revisión; sin frecuencia anual asumida.', automated: false },
  { source: 'Avisos SENAMHI (IDESEP WFS)', policy: 'Consultar según emisión y vigencia; comprobación cada 30 minutos como frecuencia del sistema.', automated: true },
  { source: 'Pronóstico Open-Meteo', policy: 'Consulta horaria guardando hora y pronóstico recibido.', automated: false },
];

const Position = z.tuple([z.number().finite(), z.number().finite()]).rest(z.number());
const PolygonCoords = z.array(z.array(Position).min(4)).min(1);
const SenamhiFeature = z.object({
  type: z.literal('Feature'),
  geometry: z.discriminatedUnion('type', [z.object({ type: z.literal('Polygon'), coordinates: PolygonCoords }), z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(PolygonCoords).min(1) })]),
  properties: z.object({ gid: z.union([z.number(), z.string()]), nivel: z.string().regex(/Nivel\s*[1-4]/i), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}/) }).passthrough(),
});
const SenamhiCollection = z.object({ type: z.literal('FeatureCollection'), features: z.array(z.unknown()).max(500) });

export interface SenamhiLayerResult { typeName: string; layer: string; status: 'live' | 'empty' | 'unavailable'; total: number; rejected: number; features: z.infer<typeof SenamhiFeature>[] }
export interface SenamhiResult { status: 'live' | 'empty' | 'unavailable'; retrieved_at: string; layers: SenamhiLayerResult[] }

function featureBBox(f: z.infer<typeof SenamhiFeature>): BBox {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of polys) for (const ring of poly) for (const [x, y] of ring) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
  return b;
}

/** Consulta las capas de avisos de SENAMHI recortadas por recuadro. Valida esquema y descarta lo que no cumpla. */
export async function fetchSenamhi(fetchImpl: typeof fetch = fetch): Promise<SenamhiResult> {
  const retrieved_at = new Date().toISOString();
  const layers: SenamhiLayerResult[] = [];
  for (const l of SENAMHI_LAYERS) {
    const url = `${SENAMHI_WFS}?service=WFS&version=1.0.0&request=GetFeature&typeName=${encodeURIComponent(l.typeName)}&outputFormat=application/json&srsName=EPSG:4326&maxFeatures=500&bbox=${AREA_OF_INTEREST.bbox.join(',')}`;
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = SenamhiCollection.parse(JSON.parse(new TextDecoder('utf-8').decode(await res.arrayBuffer())));
      const features: SenamhiLayerResult['features'] = [];
      let rejected = 0;
      for (const f of raw.features) {
        const parsed = SenamhiFeature.safeParse(f);
        if (parsed.success && bboxIntersects(featureBBox(parsed.data), AREA_OF_INTEREST.bbox)) features.push(parsed.data); else rejected++;
      }
      layers.push({ typeName: l.typeName, layer: l.layer, status: features.length ? 'live' : 'empty', total: raw.features.length, rejected, features });
    } catch {
      layers.push({ typeName: l.typeName, layer: l.layer, status: 'unavailable', total: 0, rejected: 0, features: [] });
    }
  }
  const status = layers.every(l => l.status === 'unavailable') ? 'unavailable' : layers.some(l => l.status === 'live') ? 'live' : 'empty';
  return { status, retrieved_at, layers };
}

/** fecha "2026-11-24Z" → vigencia asumida de 24 h desde 00:00 hora de Lima. */
export function senamhiValidity(fecha: string) {
  const from = new Date(`${fecha.slice(0, 10)}T00:00:00-05:00`);
  return { valid_from: from.toISOString(), valid_until: new Date(from.getTime() + 24 * 3600 * 1000).toISOString() };
}

async function upsertSource(c: PoolClient, s: { id: string; name: string; url: string | null; data_kind: string; license_note: string; publisher: string; version?: string | null;
  published_at?: string | null; valid_from?: string | null; valid_until?: string | null; status: string; checksum?: string | null; feature_count?: number | null; metadata?: unknown; retrieved?: boolean }) {
  await c.query(`INSERT INTO climashield.data_sources(id,name,url,data_kind,license_note,publisher,version,published_at,valid_from,valid_until,status,checksum,feature_count,metadata,last_checked_at,retrieved_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),now())
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,data_kind=EXCLUDED.data_kind,license_note=EXCLUDED.license_note,publisher=EXCLUDED.publisher,
      version=COALESCE(EXCLUDED.version,climashield.data_sources.version),published_at=COALESCE(EXCLUDED.published_at,climashield.data_sources.published_at),
      valid_from=COALESCE(EXCLUDED.valid_from,climashield.data_sources.valid_from),valid_until=COALESCE(EXCLUDED.valid_until,climashield.data_sources.valid_until),
      status=EXCLUDED.status,checksum=COALESCE(EXCLUDED.checksum,climashield.data_sources.checksum),feature_count=COALESCE(EXCLUDED.feature_count,climashield.data_sources.feature_count),
      metadata=climashield.data_sources.metadata || EXCLUDED.metadata,last_checked_at=now(),
      retrieved_at=CASE WHEN $15 THEN now() ELSE climashield.data_sources.retrieved_at END`,
    [s.id, s.name, s.url, s.data_kind, s.license_note, s.publisher, s.version ?? null, s.published_at ?? null, s.valid_from ?? null, s.valid_until ?? null, s.status, s.checksum ?? null, s.feature_count ?? null, JSON.stringify(s.metadata ?? {}), s.retrieved ?? true]);
}

/** Persiste avisos SENAMHI. Si la fuente falla, conserva los últimos avisos y marca la fuente como no disponible. */
export async function persistSenamhi(c: PoolClient, result: SenamhiResult) {
  let stored = 0;
  const status = result.status === 'live' ? 'current' : result.status;
  await upsertSource(c, { id: SOURCE_IDS.senamhi, name: 'SENAMHI · avisos IDESEP (WFS)', url: SENAMHI_WFS, data_kind: 'official_alert', publisher: 'SENAMHI',
    license_note: 'Servicio público IDESEP. Conservar atribución; validar condiciones de uso y vigencia oficial antes de operar.', status,
    retrieved: result.status !== 'unavailable',
    metadata: { last_result: { status: result.status, retrieved_at: result.retrieved_at, layers: result.layers.map(({ features, ...l }) => l) }, validity_rule: 'fecha + 24 h desde 00:00 America/Lima (supuesto)',
      semantic_note: 'La capa de pronóstico 24 h trae descripciones de activación de quebradas; se muestra el texto oficial sin reinterpretarlo.' } });
  for (const layer of result.layers) {
    const meta = SENAMHI_LAYERS.find(l => l.layer === layer.layer)!;
    for (const f of layer.features) {
      const p = f.properties, level = Number(/([1-4])/.exec(p.nivel)![1]), validity = senamhiValidity(p.fecha);
      const res = await c.query(`INSERT INTO climashield.official_hazard_zones(id,source_id,layer,hazard_type,level,level_label,external_id,region,geometry,issued_at,valid_from,valid_until,properties)
        SELECT $1,$2,$3,$4,$5,$6,$7,NULL,g,$8,$8,$9,$10 FROM (
          SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Intersection(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($11),4326)),ST_MakeEnvelope($12,$13,$14,$15,4326))),3)) AS g) x
        WHERE NOT ST_IsEmpty(g)
        ON CONFLICT(source_id,external_id) DO UPDATE SET geometry=EXCLUDED.geometry,level=EXCLUDED.level,level_label=EXCLUDED.level_label,properties=EXCLUDED.properties,valid_from=EXCLUDED.valid_from,valid_until=EXCLUDED.valid_until
        RETURNING id`,
        [uid(`senamhi:${layer.layer}:${p.fecha}:${p.gid}`), SOURCE_IDS.senamhi, layer.layer, meta.hazard_type, level, `Nivel ${level}`, `${layer.layer}:${p.fecha.slice(0, 10)}:${p.gid}`,
          validity.valid_from, validity.valid_until, JSON.stringify({ ...p, wfs_type: layer.typeName, title: meta.title, retrieved_at: result.retrieved_at }), JSON.stringify(f.geometry), ...AREA_OF_INTEREST.bbox]);
      stored += res.rowCount ?? 0;
    }
  }
  if (result.status !== 'unavailable') await c.query('UPDATE climashield.data_sources SET feature_count=$2 WHERE id=$1', [SOURCE_IDS.senamhi, stored]);
  return { status: result.status, stored, retrieved_at: result.retrieved_at, layers: result.layers.map(({ features, ...l }) => l) };
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** Carga GeoJSON CENEPRED versionado (data/official). Idempotente por checksum; reemplaza filas solo si cambia la versión. */
export async function loadCenepred(c: PoolClient, folder = 'data/official') {
  const [manifestText, zonesText, districtsText] = await Promise.all(['cenepred-manifest.json', 'cenepred-susceptibilidad-trujillo.geojson', 'cenepred-riesgo-distrital-trujillo.geojson'].map(f => readFile(`${folder}/${f}`, 'utf8')));
  const manifest = JSON.parse(manifestText), checksum = sha(zonesText + districtsText);
  const existing = await c.query('SELECT checksum FROM climashield.data_sources WHERE id=$1', [SOURCE_IDS.cenepred]);
  if (existing.rows[0]?.checksum === checksum) return { loaded: false, checksum };
  const zones = JSON.parse(zonesText).features as any[], districts = JSON.parse(districtsText).features as any[];
  await upsertSource(c, { id: SOURCE_IDS.cenepred, name: 'CENEPRED · escenario de riesgo por lluvias (SHAPE 102)', url: manifest.document_url, data_kind: 'official_static', publisher: manifest.publisher,
    version: `${manifest.dataset}@${(manifest.package_sha256 ?? checksum).slice(0, 12)}`, published_at: manifest.files?.map((f: any) => f.modified).sort().at(-1) ?? null,
    valid_from: manifest.scenario_valid_from, valid_until: manifest.scenario_valid_until, status: 'current', checksum, feature_count: zones.length + districts.length * 2,
    license_note: manifest.license_note, metadata: { package: manifest.package, package_sha256: manifest.package_sha256, retrieved_package_at: manifest.retrieved_at, area_of_interest: manifest.area_of_interest, processing: manifest.processing, assumptions: manifest.assumptions, files: manifest.files } });
  await c.query('DELETE FROM climashield.official_hazard_zones WHERE source_id=$1', [SOURCE_IDS.cenepred]);
  await c.query('DELETE FROM climashield.district_risk_scenarios WHERE source_id=$1', [SOURCE_IDS.cenepred]);
  for (let k = 0; k < zones.length; k += 300) {
    await c.query(`INSERT INTO climashield.official_hazard_zones(id,source_id,layer,hazard_type,level,level_label,external_id,region,geometry,properties)
      SELECT (f->>'id')::uuid,$1,f->'p'->>'layer',f->'p'->>'hazard_type',(f->'p'->>'level')::smallint,f->'p'->>'level_label',f->'p'->>'external_id',f->'p'->>'region',
        ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(f->>'g'),4326)),3)),jsonb_build_object('area_m2',f->'p'->'area_m2')
      FROM jsonb_array_elements($2::jsonb) f`,
      [SOURCE_IDS.cenepred, JSON.stringify(zones.slice(k, k + 300).map(f => ({ id: uid('cenepred:' + f.properties.external_id), p: f.properties, g: JSON.stringify(f.geometry) })))]);
  }
  for (const d of districts) for (const hazard of ['flood', 'mass_movement'] as const) {
    const p = d.properties, h = p[hazard];
    await c.query(`INSERT INTO climashield.district_risk_scenarios(id,source_id,ubigeo,department,province,district,hazard_type,risk_level,risk_value,susceptibility_level,vulnerability_level,population_total,population_exposed,dwellings_exposed,geometry,valid_from,valid_until)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($15),4326)),3)),$16,$17)`,
      [uid(`cenepred-district:${p.ubigeo}:${hazard}`), SOURCE_IDS.cenepred, p.ubigeo, p.department, p.province, p.district, hazard, h.risk_level, h.risk_value, h.susceptibility_level, h.vulnerability_level,
        p.population_total, h.population_exposed, h.dwellings_exposed, JSON.stringify(d.geometry), manifest.scenario_valid_from, manifest.scenario_valid_until]);
  }
  return { loaded: true, checksum, zones: zones.length, districts: districts.length };
}

/** Carga la última instantánea SENAMHI versionada para que la demo funcione sin red. Los avisos vencidos no se muestran como vigentes. */
export async function loadSenamhiSnapshot(c: PoolClient, folder = 'data/official') {
  let text: string;
  try { text = await readFile(`${folder}/senamhi-avisos-snapshot.json`, 'utf8'); } catch { return { loaded: false }; }
  const snapshot = JSON.parse(text) as SenamhiResult;
  const current = await c.query('SELECT metadata->\'last_result\'->>\'retrieved_at\' AS at FROM climashield.data_sources WHERE id=$1', [SOURCE_IDS.senamhi]);
  if (current.rows[0]?.at && current.rows[0].at >= snapshot.retrieved_at) return { loaded: false };
  return { loaded: true, ...(await persistSenamhi(c, snapshot)) };
}

export async function upsertSyntheticAndForecastSources(c: PoolClient) {
  await upsertSource(c, { id: SOURCE_IDS.synthetic, name: 'Escenario sintético ClimaShield', url: null, data_kind: 'synthetic', publisher: 'Equipo ClimaShield (ficticio)', version: 'seed-42',
    license_note: 'Datos ficticios del equipo; no representan cartera real de Caja Trujillo', status: 'current', retrieved: false,
    metadata: { seed: 42, scenario_clock: '2026-11-24', spatial_note: 'Cartera y polígonos hipotéticos; no límites distritales' } });
}

export async function recordOpenMeteo(c: PoolClient, status: 'current' | 'unavailable', metadata: unknown) {
  await upsertSource(c, { id: SOURCE_IDS.openmeteo, name: 'Open-Meteo · pronóstico puntual', url: 'https://open-meteo.com/en/docs', data_kind: 'forecast', publisher: 'Open-Meteo',
    license_note: 'Contexto puntual; no alimenta el índice. Revisar términos para uso comercial.', status, retrieved: status === 'current', metadata: { last_result: metadata } });
}

/** Estado derivado: una fuente con vigencia vencida se informa como 'stale' aunque su última consulta haya funcionado. */
export function freshness(row: { status: string; valid_until: string | Date | null; data_kind: string }, now = new Date()) {
  if (row.status === 'current' && row.valid_until && new Date(row.valid_until) < now) return 'stale';
  return row.status;
}
