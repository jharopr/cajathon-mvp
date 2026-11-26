-- Ampliación aditiva: se conservan resultados y migraciones anteriores.
CREATE TABLE climashield.portfolio_snapshots (
  id uuid PRIMARY KEY, input_hash text NOT NULL UNIQUE, cutoff date NOT NULL,
  generator_version text NOT NULL, synthetic boolean NOT NULL DEFAULT true CHECK(synthetic),
  records jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE climashield.loan_payment_history (
  snapshot_id uuid NOT NULL REFERENCES climashield.portfolio_snapshots(id),
  loan_id uuid NOT NULL REFERENCES climashield.loans(id), period date NOT NULL,
  amount_due numeric(16,2) NOT NULL CHECK(amount_due>=0), amount_paid numeric(16,2) NOT NULL CHECK(amount_paid>=0),
  principal numeric(16,2) NOT NULL CHECK(principal>=0), interest numeric(16,2) NOT NULL CHECK(interest>=0),
  balance numeric(16,2) NOT NULL CHECK(balance>=0), days_past_due integer NOT NULL CHECK(days_past_due>=0),
  PRIMARY KEY(snapshot_id,loan_id,period)
);
CREATE TABLE climashield.model_versions (
  id text PRIMARY KEY, artifact_hash text NOT NULL UNIQUE, dataset_hash text NOT NULL,
  artifact jsonb NOT NULL, synthetic boolean NOT NULL DEFAULT true CHECK(synthetic),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE climashield.policy_versions (
  id text PRIMARY KEY, input_hash text NOT NULL UNIQUE, policy jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE climashield.climate_events (
  id uuid PRIMARY KEY, event_key text NOT NULL UNIQUE, name text NOT NULL,
  hazard_type text NOT NULL CHECK(hazard_type IN ('rain_flood','drought')),
  mode text NOT NULL CHECK(mode IN ('LIVE','REPLAY','SYNTHETIC')),
  hazard_source text NOT NULL CHECK(hazard_source IN ('official','synthetic')),
  valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL CHECK(valid_until>valid_from),
  intensity numeric(5,4) NOT NULL CHECK(intensity BETWEEN 0 AND 1),
  geometry geometry(MultiPolygon,4326) NOT NULL CHECK(ST_IsValid(geometry)),
  source_snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_geometry_gist ON climashield.climate_events USING gist(geometry);
CREATE TABLE climashield.analysis_runs (
  id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES climashield.climate_events(id),
  snapshot_id uuid NOT NULL REFERENCES climashield.portfolio_snapshots(id),
  model_id text NOT NULL REFERENCES climashield.model_versions(id),policy_id text NOT NULL REFERENCES climashield.policy_versions(id),
  evaluation_id uuid NOT NULL REFERENCES climashield.evaluation_runs(id),
  input_hash text NOT NULL UNIQUE, seed integer NOT NULL, constraints jsonb NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','COMPLETED','FAILED')),
  result jsonb, report jsonb, created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz
);
CREATE TABLE climashield.client_predictions (
  analysis_id uuid NOT NULL REFERENCES climashield.analysis_runs(id),business_id uuid NOT NULL REFERENCES climashield.businesses(id),
  probability numeric(9,8) CHECK(probability BETWEEN 0 AND 1),modeled_loss numeric(16,2) CHECK(modeled_loss>=0),
  result jsonb NOT NULL, PRIMARY KEY(analysis_id,business_id)
);
CREATE TABLE climashield.event_jobs (
  id uuid PRIMARY KEY,analysis_id uuid NOT NULL UNIQUE REFERENCES climashield.analysis_runs(id),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RUNNING','COMPLETED','FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,lease_token uuid,last_error text,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_jobs_pending ON climashield.event_jobs(status,next_attempt_at);
CREATE TABLE climashield.notifications (
  id uuid PRIMARY KEY,analysis_id uuid REFERENCES climashield.analysis_runs(id),
  notification_key text NOT NULL UNIQUE,title text NOT NULL,message text NOT NULL,
  recipient text NOT NULL DEFAULT 'demo-coordinator',read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE climashield.optimization_plans ADD COLUMN analysis_id uuid REFERENCES climashield.analysis_runs(id);
CREATE UNIQUE INDEX one_default_plan ON climashield.optimization_plans(analysis_id) WHERE analysis_id IS NOT NULL;
ALTER TABLE climashield.financial_scenarios ADD COLUMN analysis_id uuid REFERENCES climashield.analysis_runs(id);
-- Mantener versiones/snapshots y eventos inmutables, incluso ante errores de la aplicación.
CREATE FUNCTION climashield.reject_snapshot_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Registro versionado inmutable'; END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['portfolio_snapshots','model_versions','policy_versions','climate_events'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_version BEFORE UPDATE OR DELETE ON climashield.%I FOR EACH ROW EXECUTE FUNCTION climashield.reject_snapshot_mutation()',t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['portfolio_snapshots','loan_payment_history','model_versions','policy_versions','climate_events','analysis_runs','client_predictions','event_jobs','notifications'] LOOP
    EXECUTE format('ALTER TABLE climashield.%I ENABLE ROW LEVEL SECURITY',t);
  END LOOP;
END $$;
