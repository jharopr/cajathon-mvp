-- New v2 columns; preserve applied migration checksums and historical runs.
ALTER TABLE climashield.client_predictions
  ADD COLUMN decision_score numeric(6,2) CHECK(decision_score BETWEEN 0 AND 100),
  ADD COLUMN dscr_base numeric(18,8),
  ADD COLUMN dscr_stress numeric(18,8),
  ADD COLUMN household_expenses numeric(16,2),
  ADD COLUMN other_debt_service numeric(16,2),
  ADD COLUMN conditional_severity numeric(9,8);
ALTER TABLE climashield.optimization_plans
  ADD COLUMN liquidity_commitment numeric(16,2),
  ADD COLUMN funding_cost numeric(16,2);
CREATE TABLE climashield.consultation_reports (
  id uuid PRIMARY KEY,
  analysis_id uuid NOT NULL REFERENCES climashield.analysis_runs(id),
  business_id uuid REFERENCES climashield.businesses(id),
  mode text NOT NULL CHECK(mode IN ('deterministic','gemini')),
  question text NOT NULL CHECK(length(question) BETWEEN 5 AND 1200),
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consultation_analysis ON climashield.consultation_reports(analysis_id,created_at DESC);
ALTER TABLE climashield.consultation_reports ENABLE ROW LEVEL SECURITY;
