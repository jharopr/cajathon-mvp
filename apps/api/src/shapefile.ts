// Lector mínimo de ESRI Shapefile (polígonos) y DBF, sin dependencias nativas.
// Usa el índice .shx para leer registros por desplazamiento: no carga archivos de GB completos en memoria.
import { openSync, readSync, closeSync, readFileSync } from 'node:fs';

export type BBox = [number, number, number, number];
export type Ring = [number, number][];
export interface ShxEntry { offset: number; length: number }
export interface DbfTable { fields: { name: string; type: string; length: number }[]; rows: Record<string, string>[] }
export interface PolygonRecord { index: number; shapeType: number; bbox: BBox; rings: Ring[]; totalRings: number }

const POLYGON_TYPES = new Set([5, 15, 25]); // Polygon, PolygonZ, PolygonM: mismo prefijo XY.

export function bboxIntersects(a: BBox, b: BBox) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export function readShx(buffer: Buffer): ShxEntry[] {
  if (buffer.readInt32BE(0) !== 9994) throw new Error('Índice .shx inválido');
  const entries: ShxEntry[] = [];
  for (let o = 100; o + 8 <= buffer.length; o += 8) entries.push({ offset: buffer.readInt32BE(o) * 2, length: buffer.readInt32BE(o + 4) * 2 });
  return entries;
}

export function readDbf(buffer: Buffer, encoding: BufferEncoding = 'utf8'): DbfTable {
  const count = buffer.readUInt32LE(4), headerLength = buffer.readUInt16LE(8), recordLength = buffer.readUInt16LE(10);
  const fields: DbfTable['fields'] = [];
  for (let o = 32; buffer[o] !== 0x0d && o < headerLength; o += 32) {
    const raw = buffer.subarray(o, o + 11);
    fields.push({ name: raw.subarray(0, raw.indexOf(0) === -1 ? 11 : raw.indexOf(0)).toString('latin1'), type: String.fromCharCode(buffer[o + 11]), length: buffer[o + 16] });
  }
  const rows: Record<string, string>[] = [];
  for (let r = 0; r < count; r++) {
    const start = headerLength + r * recordLength;
    if (buffer[start] === 0x2a) { rows.push({}); continue; } // registro borrado: conserva índice alineado con .shp
    let o = start + 1; const row: Record<string, string> = {};
    for (const f of fields) { row[f.name] = buffer.subarray(o, o + f.length).toString(encoding).trim(); o += f.length; }
    rows.push(row);
  }
  return { fields, rows };
}

/** Decodifica el contenido de un registro (sin la cabecera de 8 bytes). Conserva solo anillos cuyo recuadro cruza `area`. */
export function parsePolygon(content: Buffer, index: number, area?: BBox): PolygonRecord | null {
  const shapeType = content.readInt32LE(0);
  if (shapeType === 0) return null;
  if (!POLYGON_TYPES.has(shapeType)) throw new Error(`Tipo de geometría no soportado: ${shapeType}`);
  const bbox: BBox = [content.readDoubleLE(4), content.readDoubleLE(12), content.readDoubleLE(20), content.readDoubleLE(28)];
  const numParts = content.readInt32LE(36), numPoints = content.readInt32LE(40);
  const partsAt = 44, pointsAt = partsAt + numParts * 4;
  if (pointsAt + numPoints * 16 > content.length) throw new Error(`Registro ${index} truncado`);
  const rings: Ring[] = [];
  for (let p = 0; p < numParts; p++) {
    const from = content.readInt32LE(partsAt + p * 4), to = p + 1 < numParts ? content.readInt32LE(partsAt + (p + 1) * 4) : numPoints;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let k = from; k < to; k++) {
      const x = content.readDoubleLE(pointsAt + k * 16), y = content.readDoubleLE(pointsAt + k * 16 + 8);
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if (to - from < 4 || (area && !bboxIntersects([minX, minY, maxX, maxY], area))) continue;
    const ring: Ring = [];
    for (let k = from; k < to; k++) ring.push([content.readDoubleLE(pointsAt + k * 16), content.readDoubleLE(pointsAt + k * 16 + 8)]);
    rings.push(ring);
  }
  return { index, shapeType, bbox, rings, totalRings: numParts };
}

/** Recorre los registros seleccionados del .shp leyendo solo los bytes necesarios. */
export function* readPolygons(shpPath: string, shx: ShxEntry[], select: (index: number) => boolean, area?: BBox): Generator<PolygonRecord> {
  const fd = openSync(shpPath, 'r');
  try {
    const header = Buffer.alloc(44);
    for (let i = 0; i < shx.length; i++) {
      if (!select(i)) continue;
      const { offset, length } = shx[i];
      readSync(fd, header, 0, 44, offset + 8);
      const shapeType = header.readInt32LE(0);
      if (shapeType === 0) continue;
      const bbox: BBox = [header.readDoubleLE(4), header.readDoubleLE(12), header.readDoubleLE(20), header.readDoubleLE(28)];
      if (area && !bboxIntersects(bbox, area)) continue;
      const content = Buffer.alloc(length);
      if (readSync(fd, content, 0, length, offset + 8) !== length) throw new Error(`Registro ${i} incompleto`);
      const record = parsePolygon(content, i, area);
      if (record && record.rings.length) yield record;
    }
  } finally { closeSync(fd); }
}

export function openShapefile(basePath: string) {
  const shx = readShx(readFileSync(basePath + '.shx'));
  const dbf = readDbf(readFileSync(basePath + '.dbf'));
  if (dbf.rows.length !== shx.length) throw new Error(`DBF (${dbf.rows.length}) y SHX (${shx.length}) no coinciden`);
  return { shx, dbf, shp: basePath + '.shp' };
}

export const ringToWkt = (ring: Ring) => `LINESTRING(${ring.map(([x, y]) => `${x} ${y}`).join(',')})`;
