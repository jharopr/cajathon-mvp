-- Los snapshots JSON conservan evidencia; los importes de los nuevos motores
-- también se persisten en columnas NUMERIC para conciliación financiera.
CREATE TABLE climashield.financial_projection_periods (
  analysis_id uuid NOT NULL REFERENCES climashield.analysis_runs(id),
  month integer NOT NULL CHECK(month>0),
  principal_without numeric(18,2) NOT NULL CHECK(principal_without>=0),
  interest_without numeric(18,2) NOT NULL CHECK(interest_without>=0),
  principal_with numeric(18,2) NOT NULL CHECK(principal_with>=0),
  interest_with numeric(18,2) NOT NULL CHECK(interest_with>=0),
  operating_cost numeric(18,2) NOT NULL CHECK(operating_cost>=0),
  cash_delta numeric(18,2) NOT NULL,
  margin_delta numeric(18,2) NOT NULL,
  PRIMARY KEY(analysis_id,month)
);
ALTER TABLE climashield.financial_projection_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE climashield.optimization_plans
  ADD COLUMN modeled_loss_without numeric(18,2),
  ADD COLUMN modeled_loss_with numeric(18,2),
  ADD COLUMN operating_cost numeric(18,2),
  ADD COLUMN portfolio_benefit numeric(18,2);
