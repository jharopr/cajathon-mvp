import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { Decimal } from "decimal.js";
import { pool, transaction } from "../database.js";
import { type Business } from "../data.js";
import {
  riskScore,
  priority,
  VERSION,
  SCENARIO_H,
  type Run,
  type RiskItem,
  type HazardSource,
  type Evaluation,
} from "./risk.js";
import { money } from "../shared/money.js";
import {
  SOURCE_IDS,
  LEVEL_WEIGHT,
  DISTRICT_WEIGHT,
  DISTRICT_RESOLUTION,
  EXPOSURE_MIN_LEVEL,
  freshness,
  UPDATE_POLICY,
  AREA_OF_INTEREST,
} from "../official.js";

export async function audit(
  c: PoolClient,
  action: string,
  id: string,
  metadata: unknown = {},
  actor = "demo-analyst",
) {
  await c.query(
    "INSERT INTO climashield.audit_events(id,actor_id,entity_type,entity_id,action,metadata) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), actor, "demo", id, action, JSON.stringify(metadata)],
  );
}
const businessSql = `SELECT b.*,ST_X(b.location) AS lon,ST_Y(b.location) AS lat,
  COALESCE(l.balance,0)::text AS balance,COALESCE(l.monthly_installment,0)::text AS monthly_installment
  FROM climashield.businesses b LEFT JOIN (SELECT business_id,sum(balance) AS balance,sum(monthly_installment) AS monthly_installment FROM climashield.loans WHERE status='ACTIVE' GROUP BY business_id) l ON l.business_id=b.id`;
function mapBusiness(r: any): Business {
  const { lon, lat, created_at, ...rest } = r;
  return {
    ...rest,
    location: lon === null ? null : [+lon, +lat],
    vulnerability: r.vulnerability === null ? null : +r.vulnerability,
    adaptation: r.adaptation === null ? null : +r.adaptation,
  };
}
const HAZARD_NAMES: Record<string, string> = {
  cenepred_suscep_inundacion: "Susceptibilidad a inundación",
  cenepred_suscep_mmasa: "Susceptibilidad a movimientos en masa",
  senamhi_aviso_lluvia: "Aviso SENAMHI por lluvias (24 h)",
  senamhi_activacion_quebrada: "Aviso SENAMHI activación de quebradas",
};
/** Una evaluación oficial expone si el punto está en zona media+ o si el distrito tiene susceptibilidad alta+ con ≥50 % de población expuesta. */
export const isExposing = (e: Evaluation) =>
  (e.kind === "susceptibility" && (e.level ?? 0) >= EXPOSURE_MIN_LEVEL) ||
  (e.kind === "district" &&
    (DISTRICT_WEIGHT[e.district_level ?? ""] ?? 0) >= DISTRICT_WEIGHT.Alto &&
    (e.exposure ?? 0) >= 0.5);
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

@Injectable()
export class Repository {
  async businesses() {
    const { rows } = await pool.query(businessSql + " ORDER BY b.code");
    return rows.map(mapBusiness);
  }
  async business(id: string) {
    const { rows } = await pool.query(businessSql + " WHERE b.id=$1", [id]);
    if (!rows[0]) throw new NotFoundException("Negocio no encontrado");
    return mapBusiness(rows[0]);
  }
  async hazardGeoJSON() {
    const { rows } = await pool.query(
      `SELECT id,name,ST_AsGeoJSON(geometry)::json AS geometry,valid_from,valid_until,issued_at FROM climashield.climate_hazards ORDER BY name`,
    );
    return {
      type: "FeatureCollection",
      features: rows.map((r) => ({
        type: "Feature",
        id: r.id,
        geometry: r.geometry,
        properties: {
          id: r.id,
          name: r.name,
          valid_from: r.valid_from,
          valid_until: r.valid_until,
          issued_at: r.issued_at,
          synthetic: true,
          kind: "synthetic",
          source: "Escenario hipotético ClimaShield; no cartografía oficial",
        },
      })),
    };
  }
  /** Zonas oficiales para el mapa. Susceptibilidad sin vencimiento; avisos solo si están vigentes en `at`. Simplificación solo de visualización. */
  async officialGeoJSON(at = new Date()) {
    const { rows } = await pool.query(
      `SELECT z.id,z.layer,z.hazard_type,z.level,z.level_label,z.valid_from,z.valid_until,z.issued_at,s.publisher,s.version,
        z.properties->>'descripcio' AS description,z.properties->>'title' AS title,
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(z.geometry,0.00008),5)::json AS geometry
      FROM climashield.official_hazard_zones z JOIN climashield.data_sources s ON s.id=z.source_id
      WHERE z.valid_until IS NULL OR $1::timestamptz BETWEEN z.valid_from AND z.valid_until ORDER BY z.layer,z.level`,
      [at.toISOString()],
    );
    return {
      type: "FeatureCollection",
      features: rows.map((r) => ({
        type: "Feature",
        id: r.id,
        geometry: r.geometry,
        properties: {
          id: r.id,
          kind: r.layer.startsWith("senamhi") ? "alert" : "susceptibility",
          layer: r.layer,
          hazard_type: r.hazard_type,
          level: r.level,
          level_label: r.level_label,
          name: `${HAZARD_NAMES[r.layer]} · ${r.level_label}`,
          source: `${r.publisher} · ${r.version ?? "consulta en vivo"}`,
          valid_from: r.valid_from,
          valid_until: r.valid_until,
          description: r.description,
          synthetic: false,
        },
      })),
    };
  }
  async districtsGeoJSON(at = new Date()) {
    const { rows } = await pool.query(
      `SELECT ubigeo,district,province,population_total,ST_AsGeoJSON(min(geometry::text)::geometry,5)::json AS geometry,
        jsonb_object_agg(hazard_type,jsonb_build_object('risk_level',risk_level,'risk_value',risk_value,'susceptibility_level',susceptibility_level,'vulnerability_level',vulnerability_level,'population_exposed',population_exposed,'dwellings_exposed',dwellings_exposed)) AS risk,
        min(valid_from) AS valid_from,max(valid_until) AS valid_until
      FROM climashield.district_risk_scenarios WHERE $1::timestamptz BETWEEN valid_from AND valid_until GROUP BY ubigeo,district,province,population_total ORDER BY ubigeo`,
      [at.toISOString()],
    );
    return {
      type: "FeatureCollection",
      features: rows.map((r) => ({
        type: "Feature",
        id: r.ubigeo,
        geometry: r.geometry,
        properties: {
          ubigeo: r.ubigeo,
          district: r.district,
          province: r.province,
          population_total: r.population_total,
          flood_risk: r.risk.flood?.risk_level ?? null,
          mass_movement_risk: r.risk.mass_movement?.risk_level ?? null,
          risk: r.risk,
          valid_from: r.valid_from,
          valid_until: r.valid_until,
          source: "CENEPRED · escenario nov 2026 – ene 2027",
        },
      })),
    };
  }
  async alerts(at = new Date()) {
    const { rows } = await pool.query(
      `SELECT z.id,z.layer,z.level,z.level_label,z.valid_from,z.valid_until,z.properties - 'retrieved_at' AS properties,
        ($1::timestamptz BETWEEN z.valid_from AND z.valid_until) AS active
      FROM climashield.official_hazard_zones z WHERE z.layer LIKE 'senamhi_%' ORDER BY z.valid_until DESC,z.level DESC LIMIT 50`,
      [at.toISOString()],
    );
    const source =
      (await this.sources()).items.find((s) => s.id === SOURCE_IDS.senamhi) ??
      null;
    return {
      data_kind: "official_alert",
      checked_at: at.toISOString(),
      source,
      active: rows.filter((r) => r.active),
      recent: rows.filter((r) => !r.active).slice(0, 10),
      note: "Avisos oficiales recortados al área de demo. Vacío significa sin registros vigentes en esta fuente/zona, no ausencia de riesgo.",
    };
  }
  async sources() {
    const { rows } =
      await pool.query(`SELECT s.id,s.name,s.url,s.data_kind,s.publisher,s.version,s.published_at,s.valid_from,s.valid_until,s.retrieved_at,s.last_checked_at,s.status,s.feature_count,s.license_note,s.metadata,
        (SELECT count(*)::int FROM climashield.official_hazard_zones z WHERE z.source_id=s.id AND (z.valid_until IS NULL OR now() BETWEEN z.valid_from AND z.valid_until)) AS active_features
      FROM climashield.data_sources s ORDER BY CASE s.data_kind WHEN 'official_static' THEN 0 WHEN 'official_alert' THEN 1 WHEN 'forecast' THEN 2 ELSE 3 END,s.name`);
    return {
      checked_at: new Date().toISOString(),
      items: rows.map((r) => {
        const derived = freshness(r);
        const effective =
          r.data_kind === "synthetic"
            ? "synthetic"
            : r.data_kind === "official_alert" &&
                derived === "current" &&
                r.active_features === 0
              ? "no_active"
              : derived;
        const { metadata, ...rest } = r;
        return {
          ...rest,
          freshness: effective,
          assumptions:
            metadata?.assumptions ??
            (metadata?.validity_rule
              ? [metadata.validity_rule, metadata.semantic_note]
              : []),
          last_result: metadata?.last_result ?? null,
          package_sha256: metadata?.package_sha256 ?? null,
          processing: metadata?.processing ?? null,
        };
      }),
      policy: UPDATE_POLICY,
      area_of_interest: AREA_OF_INTEREST,
    };
  }

  async assess(
    scenario: Run["scenario_id"],
    hazard_source: HazardSource = "official",
    event?: { clock: string; geometry: unknown; intensity: number },
  ) {
    const start = performance.now(),
      id = randomUUID(),
      h = event?.intensity ?? SCENARIO_H[scenario];
    const clock =
      event?.clock ??
      (hazard_source === "synthetic"
        ? "2026-11-24T18:00:00Z"
        : new Date().toISOString());
    return transaction(async (c) => {
      const businesses = (
        await c.query(businessSql + " ORDER BY b.code")
      ).rows.map(mapBusiness);
      const byBusiness = new Map<string, any[]>(),
        districts = new Map<string, any[]>();
      const membership = event
        ? new Map(
            (
              await c.query(
                `SELECT id,ST_Covers(ST_SetSRID(ST_GeomFromGeoJSON($1),4326),location) AS inside FROM climashield.businesses`,
                [JSON.stringify(event.geometry)],
              )
            ).rows.map((r) => [r.id, r.inside]),
          )
        : null;
      let spatialRows: any[] = [],
        sourceVersions: any[] = [];
      if (hazard_source === "synthetic") {
        spatialRows = (
          await c.query(
            `SELECT b.id AS business_id,h.id AS hazard_id,h.name AS hazard_name,
          CASE WHEN b.location IS NULL THEN NULL ELSE ST_Covers(h.geometry,b.location)::int END AS exposure
          FROM climashield.businesses b CROSS JOIN climashield.climate_hazards h WHERE $1::timestamptz BETWEEN h.valid_from AND h.valid_until`,
            [clock],
          )
        ).rows;
        sourceVersions = [
          {
            id: SOURCE_IDS.synthetic,
            name: "Escenario sintético ClimaShield",
            version: "seed-42",
          },
        ];
      } else {
        spatialRows = (
          await c.query(
            `SELECT b.id AS business_id,z.id AS hazard_id,z.layer,z.hazard_type,z.level,z.level_label,z.source_id,z.valid_until
          FROM climashield.businesses b JOIN climashield.official_hazard_zones z ON ST_Covers(z.geometry,b.location)
          WHERE b.location IS NOT NULL AND (z.valid_until IS NULL OR $1::timestamptz BETWEEN z.valid_from AND z.valid_until)
          ORDER BY b.id,z.layer,z.level DESC`,
            [clock],
          )
        ).rows;
        for (const r of (
          await c.query(
            `SELECT b.id AS business_id,d.id AS district_row,d.ubigeo,d.district,d.hazard_type,d.risk_level,d.susceptibility_level,d.population_total,d.population_exposed
          FROM climashield.businesses b JOIN climashield.district_risk_scenarios d ON ST_Covers(d.geometry,b.location)
          WHERE $1::timestamptz BETWEEN d.valid_from AND d.valid_until`,
            [clock],
          )
        ).rows) {
          const g = districts.get(r.business_id) ?? [];
          g.push(r);
          districts.set(r.business_id, g);
        }
        sourceVersions = (
          await c.query(
            `SELECT id,name,version,checksum,status,last_checked_at FROM climashield.data_sources WHERE id=ANY($1)`,
            [[SOURCE_IDS.cenepred, SOURCE_IDS.senamhi]],
          )
        ).rows;
        if (!sourceVersions.some((s) => s.id === SOURCE_IDS.cenepred))
          throw new NotFoundException(
            "Cartografía CENEPRED no cargada. Ejecute npm run db:seed.",
          );
      }
      for (const r of spatialRows) {
        const group = byBusiness.get(r.business_id) ?? [];
        group.push(r);
        byBusiness.set(r.business_id, group);
      }

      const items: RiskItem[] = businesses.map((b) => {
        let evaluations: Evaluation[],
          reasons: string[],
          exposed: boolean,
          official_district: string | null = null,
          district_risk: RiskItem["district_risk"] = null,
          alerts = 0,
          location_issue: string | null = null;
        if (hazard_source === "synthetic") {
          evaluations = (byBusiness.get(b.id) ?? []).map((r) => ({
            hazard_id: r.hazard_id,
            hazard_name: r.hazard_name,
            kind: "synthetic",
            exposure: r.exposure,
            score: riskScore(h, r.exposure, b.vulnerability, b.adaptation),
          }));
          exposed = evaluations.some((e) => e.exposure === 1);
          reasons =
            b.location === null
              ? ["Ubicación ausente: no se asigna riesgo cero"]
              : [
                  `H=${h}, V=${b.vulnerability}, C=${b.adaptation}`,
                  exposed
                    ? "Interseca amenaza hipotética"
                    : "Fuera de estos polígonos; no implica ausencia de otros riesgos",
                ];
        } else {
          const rows = byBusiness.get(b.id) ?? [];
          // Una evaluación por capa: el nivel más alto (en bordes simplificados puede cubrir más de un nivel).
          const best = new Map<string, any>();
          for (const r of rows)
            if (!best.has(r.layer) || r.level > best.get(r.layer).level)
              best.set(r.layer, r);
          evaluations = [...best.values()].map((r) => {
            const alert = r.layer.startsWith("senamhi");
            const H = alert
              ? null
              : Math.round(h * LEVEL_WEIGHT[r.level] * 10000) / 10000;
            return {
              hazard_id: r.hazard_id,
              hazard_name: `${HAZARD_NAMES[r.layer]} · ${r.level_label}`,
              kind: alert ? "alert" : "susceptibility",
              layer: r.layer,
              level: r.level,
              exposure: 1,
              intensity: H,
              score: alert
                ? null
                : riskScore(H, 1, b.vulnerability, b.adaptation),
              source_id: r.source_id,
            };
          });
          alerts = evaluations.filter((e) => e.kind === "alert").length;
          const dist = districts.get(b.id) ?? [];
          if (dist.length) {
            official_district = dist[0].district;
            district_risk = Object.fromEntries(
              dist.map((d) => [d.hazard_type, d.risk_level]),
            ) as any;
          }
          // Respaldo distrital (menor resolución) para peligros sin zona puntual: E = población expuesta / población total.
          for (const d of dist) {
            const layer =
              d.hazard_type === "flood"
                ? "cenepred_suscep_inundacion"
                : "cenepred_suscep_mmasa";
            if (
              best.has(layer) ||
              !DISTRICT_WEIGHT[d.susceptibility_level] ||
              !d.population_total
            )
              continue;
            const H =
              Math.round(
                h *
                  DISTRICT_WEIGHT[d.susceptibility_level] *
                  DISTRICT_RESOLUTION *
                  10000,
              ) / 10000;
            const E =
              Math.round(
                Math.min(1, (d.population_exposed ?? 0) / d.population_total) *
                  10000,
              ) / 10000;
            evaluations.push({
              hazard_id: d.district_row,
              hazard_name: `${d.hazard_type === "flood" ? "Inundación" : "Movimientos en masa"} · susceptibilidad distrital ${d.susceptibility_level} (${d.district})`,
              kind: "district",
              layer: "cenepred_distrito_" + d.hazard_type,
              exposure: E,
              intensity: H,
              score: riskScore(H, E, b.vulnerability, b.adaptation),
              source_id: SOURCE_IDS.cenepred,
              district_level: d.susceptibility_level,
            });
          }
          if (b.location && !official_district)
            location_issue =
              "Coordenada fuera de los límites distritales oficiales (posible mar o fuera de la provincia): revisar geocodificación";
          else if (
            official_district &&
            norm(official_district) !== norm(b.district)
          )
            location_issue = `Distrito declarado (${b.district}) distinto del oficial por coordenada (${official_district})`;
          exposed = evaluations.some(isExposing);
          const top = evaluations
            .filter((e) => e.score !== null)
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
          reasons =
            b.location === null
              ? ["Ubicación ausente: no se asigna riesgo cero"]
              : [
                  top?.kind === "susceptibility"
                    ? `Mayor índice: ${top.hazard_name} (zona CENEPRED que contiene el punto) → H=${h}×${LEVEL_WEIGHT[top.level!]}=${top.intensity}, E=1; V=${b.vulnerability}, C=${b.adaptation}`
                    : top
                      ? `Mayor índice: ${top.hazard_name} → H=${h}×${DISTRICT_WEIGHT[top.district_level!]}×${DISTRICT_RESOLUTION}=${top.intensity}, E=${top.exposure} (población expuesta/total); V=${b.vulnerability}, C=${b.adaptation}`
                      : "Sin zona de susceptibilidad ni escenario distrital aplicable; no implica ausencia de riesgo",
                  ...(official_district
                    ? [
                        `Distrito oficial ${official_district}: riesgo inundación ${district_risk?.flood ?? "—"}, movimientos en masa ${district_risk?.mass_movement ?? "—"} (escenario CENEPRED nov 2026 – ene 2027)`,
                      ]
                    : []),
                  ...(alerts
                    ? [
                        "Dentro de un aviso SENAMHI vigente: señal para activar seguimiento; no modifica el índice ni define exposición",
                      ]
                    : []),
                  ...(location_issue ? [location_issue] : []),
                ];
        }
        if (membership && !membership.get(b.id)) exposed = false;
        const scores = evaluations
          .map((e) => e.score)
          .filter((s): s is number => s !== null);
        const score =
          b.location === null
            ? null
            : scores.length
              ? Math.max(...scores)
              : hazard_source === "official"
                ? 0
                : null;
        const financial_ready = [
          b.monthly_revenue,
          b.monthly_fixed_cost,
          b.variable_cost_ratio,
          b.inventory_value,
          b.cash_reserve,
        ].every((x) => x !== null);
        return {
          ...b,
          in_event: membership ? membership.get(b.id) === true : true,
          score,
          priority: priority(score),
          exposed,
          financial_ready,
          data_quality:
            score === null
              ? "DESCONOCIDA"
              : financial_ready && !location_issue
                ? "COMPLETA"
                : "PARCIAL",
          evaluations,
          reasons,
          official_district,
          district_risk,
          alerts,
          location_issue,
        };
      });
      items.sort(
        (a, b) =>
          (b.score ?? -1) - (a.score ?? -1) || a.code.localeCompare(b.code),
      );
      const exposedItems = items.filter((x) => x.exposed);
      const summary: Run["summary"] = {
        total: items.length,
        exposed: exposedItems.length,
        high: items.filter((x) => x.priority === "ALTA").length,
        unknown: items.filter((x) => x.priority === "UNKNOWN").length,
        partial: items.filter((x) => x.data_quality === "PARCIAL").length,
        exposed_balance: money(
          exposedItems.reduce((s, x) => s.plus(x.balance), new Decimal(0)),
        ),
        elapsed_ms: 0,
        hazard_source,
        ...(hazard_source === "official"
          ? {
              point_zone: items.filter((x) =>
                x.evaluations.some(
                  (e) =>
                    e.kind === "susceptibility" &&
                    (e.level ?? 0) >= EXPOSURE_MIN_LEVEL,
                ),
              ).length,
              exposed_flood: items.filter((x) =>
                x.evaluations.some(
                  (e) =>
                    isExposing(e) &&
                    (e.layer === "cenepred_suscep_inundacion" ||
                      e.layer === "cenepred_distrito_flood"),
                ),
              ).length,
              exposed_mass_movement: items.filter((x) =>
                x.evaluations.some(
                  (e) =>
                    isExposing(e) &&
                    (e.layer === "cenepred_suscep_mmasa" ||
                      e.layer === "cenepred_distrito_mass_movement"),
                ),
              ).length,
              under_alert: items.filter((x) => (x.alerts ?? 0) > 0).length,
              location_issues: items.filter((x) => x.location_issue).length,
            }
          : {}),
      };
      const hash = createHash("sha256")
        .update(
          JSON.stringify({
            businesses,
            spatial: spatialRows,
            districts: [...districts.entries()],
            scenario,
            hazard_source,
            clock,
            version: VERSION,
            sources: sourceVersions.map((s) => [
              s.id,
              s.version,
              s.checksum,
              s.last_checked_at,
            ]),
          }),
        )
        .digest("hex");
      await c.query(
        "INSERT INTO climashield.evaluation_runs(id,scenario_id,scenario_clock,model_version,source_id,input_hash,summary,hazard_source,source_versions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          id,
          scenario,
          clock,
          VERSION,
          hazard_source === "synthetic"
            ? SOURCE_IDS.synthetic
            : SOURCE_IDS.cenepred,
          hash,
          JSON.stringify(summary),
          hazard_source,
          JSON.stringify(sourceVersions),
        ],
      );
      const records = items.map((b) => ({
        id: randomUUID(),
        business_id: b.id,
        score: b.score,
        priority: b.priority,
        exposed: b.exposed,
        data_quality: b.data_quality,
        evidence: JSON.stringify({
          evaluations: b.evaluations,
          reasons: b.reasons,
          snapshot: b,
        }),
      }));
      await c.query(
        `INSERT INTO climashield.risk_assessments(id,run_id,business_id,score,priority,exposed,data_quality,evidence)
        SELECT x.id,$1,x.business_id,x.score,x.priority,x.exposed,x.data_quality,x.evidence::jsonb
        FROM jsonb_to_recordset($2::jsonb) AS x(id uuid,business_id uuid,score numeric,priority text,exposed boolean,data_quality text,evidence text)`,
        [id, JSON.stringify(records)],
      );
      summary.elapsed_ms = Math.round((performance.now() - start) * 100) / 100;
      await c.query(
        "UPDATE climashield.evaluation_runs SET summary=$2 WHERE id=$1",
        [id, JSON.stringify(summary)],
      );
      await audit(c, "RISK_ASSESSED", id, summary);
      return {
        id,
        scenario_id: scenario,
        hazard_source,
        scenario_clock: clock,
        assessed_at: new Date().toISOString(),
        model_version: VERSION,
        summary,
        items,
        source_versions: sourceVersions,
        synthetic_portfolio: true,
        spatial_engine: "PostGIS ST_Covers",
        input_hash: hash,
      };
    });
  }
  async run(id: string): Promise<Run> {
    const { rows } = await pool.query(
      "SELECT * FROM climashield.evaluation_runs WHERE id=$1",
      [id],
    );
    if (!rows[0]) throw new NotFoundException("Evaluación no encontrada");
    const assessments = await pool.query(
      "SELECT evidence FROM climashield.risk_assessments WHERE run_id=$1 ORDER BY score DESC NULLS LAST,business_id",
      [id],
    );
    return {
      ...rows[0],
      items: assessments.rows.map((r) => r.evidence.snapshot),
    };
  }
  async plan(id: string) {
    const { rows } = await pool.query(
      "SELECT * FROM climashield.optimization_plans WHERE id=$1",
      [id],
    );
    if (!rows[0]) throw new NotFoundException("Plan no encontrado");
    return { id: rows[0].id, ...rows[0].result };
  }
}
