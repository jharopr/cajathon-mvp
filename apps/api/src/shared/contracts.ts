export interface Projection {
  action_code: string;
  action: string;
  cost: number;
  minutes: number;
  modeled_loss: string;
  portfolio_benefit: string;
  client_benefit: string;
  deferred_principal: string;
  deferred_interest: string;
  p_cash_gap: number;
  cash_p10: string;
  cash_p50: string;
  cash_p90: string;
  collection_rate: number;
}
export interface ClientAnalysis {
  business_id: string;
  code: string;
  name: string;
  sector: string;
  district: string;
  segment: string;
  balance: string;
  location: [number, number] | null;
  climate_index: number | null;
  in_event: boolean;
  point_exposure: number;
  district_context: number;
  priority: string;
  status:
    | "PREDICTED"
    | "UNKNOWN"
    | "ALREADY_DETERIORATED"
    | "INCOMPLETE"
    | "OUTSIDE_EVENT";
  probability: number | null;
  explanation: { factor: string; value: number; raw: number }[];
  features: number[];
  modeled_loss: string | null;
  p_cash_gap: number | null;
  cash_p10: string | null;
  cash_p50: string | null;
  cash_p90: string | null;
  projections: Projection[];
  reasons: string[];
  current_dpd: number;
  entities: number;
}
