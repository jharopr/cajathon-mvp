import type { ClientAnalysis } from "../../../api/src/shared/contracts";
export interface Plan {
  constraints: {
    budget_pen: number;
    capacity_minutes: number;
    min_high_priority: number;
  };
  id: string;
  solver_status: string;
  pruned: boolean;
  metrics: {
    coverage: number;
    cost: string;
    minutes: number;
    portfolio_benefit: string;
  };
  selected: {
    business_id: string;
    code: string;
    name: string;
    action_code: string;
    action: string;
    cost: number;
    minutes: number;
    portfolio_benefit: string;
  }[];
  baselines: {
    strategy: string;
    feasible: boolean;
    metrics: {
      coverage: number;
      portfolio_benefit: string;
      cost: string;
      minutes: number;
    };
  }[];
  modeled_loss_without: string;
  modeled_loss_with: string;
  modeled_loss_avoided: string;
  client_liquidity_relief: string;
  objective: string;
  assumptions: string;
}
export type Client = ClientAnalysis;
export interface ClimateEvent {
  id: string;
  name: string;
  mode: "LIVE" | "REPLAY" | "SYNTHETIC";
  hazard_type: string;
  hazard_source: string;
  valid_from: string;
  valid_until: string;
  active: boolean;
  source_snapshot: Record<string, unknown>;
  analysis: {
    id: string;
    status: string;
    summary?: Record<string, number | string>;
  } | null;
}
export interface Analysis {
  policy: { severity_conditional_30d: number; note: string };
  id: string;
  event_id: string;
  event_name: string;
  status: string;
  mode: string;
  cutoff: string;
  created_at: string;
  completed_at: string | null;
  input_hash: string;
  model_id: string;
  policy_id: string;
  source_snapshot: Record<string, unknown>;
  clients: Client[];
  plan: Plan | null;
  result: {
    summary: {
      total: number;
      predicted: number;
      unknown: number;
      high: number;
      already_deteriorated: number;
      incomplete: number;
      outside_event: number;
      exposed: number;
      exposed_balance: string;
      modeled_loss: string;
      deterioration_weighted_balance: string;
    };
    bridge: ({
      month: number;
      cash_delta: string;
      margin_delta: string;
    } & Record<string, string | number>)[];
    breakdowns: Record<
      string,
      {
        name: string;
        n: number;
        predicted: number;
        mean_probability: number | null;
        selected: number;
        modeled_loss: string;
      }[]
    >;
    scenario_count: number;
    limitations: string[];
    methodology: Record<string, string>;
  } | null;
  report: {
    mode: string;
    provider: string;
    text: string;
    trace: { tool: string; status: string }[];
  } | null;
  model: {
    version: string;
    hash: string;
    metrics: Record<
      string,
      {
        n: number;
        positive: number;
        roc_auc: number | null;
        pr_auc: number | null;
        brier: number | null;
        precision: number | null;
        recall: number | null;
        threshold: number;
        calibration: {
          n: number;
          from: number;
          to: number;
          predicted: number | null;
          observed: number | null;
        }[];
      }
    >;
    climate_ablation: {
      roc_auc: number | null;
      pr_auc: number | null;
      brier: number | null;
    };
    group_metrics?: Record<
      string,
      {
        name: string;
        metrics: {
          n: number;
          brier: number | null;
          precision: number | null;
          recall: number | null;
        };
      }[]
    >;
  };
  job: { status: string; attempts: number; last_error: string | null } | null;
}
export interface Notification {
  id: string;
  analysis_id: string | null;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
}
export interface Intervention {
  id: string;
  name: string;
  code: string;
  business_id: string;
  action: string;
  status: string;
  estimated_cost: string;
  estimated_benefit: string;
  result_note: string;
}
export interface Source {
  id: string;
  name: string;
  url: string | null;
  data_kind: string;
  publisher: string | null;
  version: string | null;
  published_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
  retrieved_at: string | null;
  last_checked_at: string | null;
  status: string;
  freshness: string;
  active_features: number;
  license_note: string;
  assumptions: string[];
}
export interface Sources {
  items: Source[];
  policy: { source: string; policy: string; automated: boolean }[];
}
