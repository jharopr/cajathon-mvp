import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { pool, transaction } from "../database.js";
import { fetchSenamhi, persistSenamhi, SOURCE_IDS } from "../official.js";
import { hazards } from "../data.js";

export function eventKey(input: unknown) {
  const clean = (v: any): any =>
    Array.isArray(v)
      ? v.map(clean)
      : v && typeof v === "object" && !(v instanceof Date)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .filter((k) => !["retrieved_at", "last_checked_at"].includes(k))
              .map((k) => [k, clean(v[k])]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(clean(input)))
    .digest("hex");
}
@Injectable()
export class EventsService {
  async list() {
    return (
      await pool.query(`SELECT e.id,e.name,e.hazard_type,e.mode,e.hazard_source,e.valid_from,e.valid_until,e.intensity,e.source_snapshot,e.created_at,
      (e.mode='LIVE' AND now() BETWEEN e.valid_from AND e.valid_until) AS active,
      (SELECT jsonb_build_object('id',a.id,'status',a.status,'summary',a.result->'summary') FROM climashield.analysis_runs a WHERE a.event_id=e.id ORDER BY a.created_at DESC LIMIT 1) AS analysis
      FROM climashield.climate_events e ORDER BY e.created_at DESC LIMIT 100`)
    ).rows;
  }
  async discover(replay = false) {
    const rows = (
      await pool.query(
        `SELECT z.*,ST_AsGeoJSON(z.geometry)::json AS geo,s.version,s.checksum,s.last_checked_at,s.status AS source_status
      FROM climashield.official_hazard_zones z JOIN climashield.data_sources s ON s.id=z.source_id
      WHERE z.source_id=$1 AND ($2::boolean OR (now() BETWEEN z.valid_from AND z.valid_until AND s.status<>'unavailable'))
      ORDER BY z.valid_from DESC LIMIT 50`,
        [SOURCE_IDS.senamhi, replay],
      )
    ).rows;
    const ids: string[] = [];
    for (const row of replay ? rows.slice(0, 1) : rows) {
      const mode = replay ? "REPLAY" : "LIVE";
      const snapshot = {
        publisher: "SENAMHI",
        external_id: row.external_id,
        layer: row.layer,
        version: row.version,
        checksum: row.checksum,
        source_status: row.source_status,
        last_checked_at: row.last_checked_at,
        valid_from: row.valid_from,
        valid_until: row.valid_until,
        properties: row.properties,
        validity_note:
          "Fecha de la fuente + 24 h según hipótesis vigente del conector; confirmar vigencia oficial.",
      };
      const key = eventKey({
        id: row.external_id,
        geometry: row.geo,
        level: row.level,
        from: row.valid_from,
        to: row.valid_until,
        properties: row.properties,
        mode,
      });
      // La hora de consulta cambia sin que haya cambiado el aviso: no forma parte de la identidad.
      const id = await this.insert(
        key,
        `${replay ? "Reproducción · " : ""}Lluvias y quebradas · Trujillo`,
        mode,
        "official",
        row.valid_from,
        row.valid_until,
        Math.min(1, 0.3 + Number(row.level) * 0.15),
        row.geo,
        snapshot,
      );
      ids.push(id);
    }
    return ids;
  }
  private async insert(
    key: string,
    name: string,
    mode: string,
    source: string,
    from: Date | string,
    to: Date | string,
    intensity: number,
    geometry: unknown,
    snapshot: unknown,
  ) {
    const id = randomUUID();
    const row = (
      await pool.query(
        `INSERT INTO climashield.climate_events(id,event_key,name,hazard_type,mode,hazard_source,valid_from,valid_until,intensity,geometry,source_snapshot)
      VALUES($1,$2,$3,'rain_flood',$4,$5,$6,$7,$8,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($9),4326)),$10) ON CONFLICT(event_key) DO NOTHING RETURNING id`,
        [
          id,
          key,
          name,
          mode,
          source,
          from,
          to,
          intensity,
          JSON.stringify(geometry),
          JSON.stringify(snapshot),
        ],
      )
    ).rows[0];
    return (
      row ??
      (
        await pool.query(
          "SELECT id FROM climashield.climate_events WHERE event_key=$1",
          [key],
        )
      ).rows[0]
    ).id as string;
  }
  async ensureDemo() {
    const ids = await this.discover(true);
    if (ids.length) return ids[0];
    const h = hazards().features[0];
    return this.insert(
      "synthetic-rain-demo-1",
      "Escenario ficticio · Lluvias Trujillo",
      "SYNTHETIC",
      "synthetic",
      "2026-11-24T00:00:00-05:00",
      "2026-11-25T00:00:00-05:00",
      0.9,
      h.geometry,
      {
        synthetic: true,
        version: "seed-42",
        note: "Evento ficticio precargado; no aviso vigente.",
      },
    );
  }
  async refresh() {
    const result = await fetchSenamhi();
    await transaction((c) => persistSenamhi(c, result));
    return { status: result.status, event_ids: await this.discover() };
  }
  async checkMonthlyReview() {
    // No se inventa una consulta a CENEPRED: hasta tener un feed verificable se crea tarea humana.
    const month = new Date().toISOString().slice(0, 7);
    await pool.query(
      `INSERT INTO climashield.notifications(id,notification_key,title,message) VALUES($1,$2,'Revisión mensual de fuentes y cartera',
      'Revisar versión CENEPRED y corte de cartera. Registrar la comprobación en Fuentes; un temporizador no confirma que la fuente haya cambiado.') ON CONFLICT(notification_key) DO NOTHING`,
      [randomUUID(), `source-review:${month}`],
    );
  }
}
