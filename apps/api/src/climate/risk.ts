import type { Business } from "../data.js";
export const VERSION = "experimental-0.2";
export function riskScore(
  h: number | null,
  e: number | null,
  v: number | null,
  c: number | null,
) {
  if ([h, e, v, c].some((x) => x === null)) return null;
  if ([h, e, v, c].some((x) => !Number.isFinite(x) || x! < 0 || x! > 1))
    throw new Error("Ratios fuera de [0,1]");
  return Math.round(100 * h! * e! * v! * (1 - 0.5 * c!) * 100) / 100;
}
export const priority = (score: number | null) =>
  score === null
    ? "UNKNOWN"
    : score >= 65
      ? "ALTA"
      : score >= 30
        ? "MEDIA"
        : "BAJA";
export type HazardSource = "synthetic" | "official";
export const SCENARIO_H = { leve: 0.4, moderado: 0.65, severo: 0.9 } as const;
export interface Evaluation {
  hazard_id: string;
  hazard_name: string;
  kind: "synthetic" | "susceptibility" | "district" | "alert";
  exposure: number | null;
  score: number | null;
  layer?: string;
  level?: number;
  intensity?: number | null;
  source_id?: string;
  district_level?: string;
}
export interface RiskItem extends Business {
  in_event?: boolean;
  score: number | null;
  priority: string;
  exposed: boolean;
  financial_ready: boolean;
  data_quality: string;
  evaluations: Evaluation[];
  reasons: string[];
  official_district?: string | null;
  district_risk?: { flood?: string; mass_movement?: string } | null;
  alerts?: number;
  location_issue?: string | null;
}
export interface Run {
  id: string;
  scenario_id: "leve" | "moderado" | "severo";
  hazard_source?: HazardSource;
  scenario_clock: string;
  assessed_at: string;
  model_version: string;
  summary: {
    total: number;
    exposed: number;
    high: number;
    unknown: number;
    partial: number;
    exposed_balance: string;
    elapsed_ms: number;
    hazard_source?: HazardSource;
    point_zone?: number;
    exposed_flood?: number;
    exposed_mass_movement?: number;
    under_alert?: number;
    location_issues?: number;
  };
  items: RiskItem[];
}
