-- Esquema privado: NestJS es la única entrada de la demo, no la Data API.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS climashield;
-- El runner añade a search_path el esquema real de PostGIS si ya estaba instalado.
CREATE TABLE climashield.data_sources (
  id uuid PRIMARY KEY, name text NOT NULL, url text, data_kind text NOT NULL CHECK(data_kind IN ('synthetic','forecast','observed')),
  retrieved_at timestamptz NOT NULL DEFAULT now(), license_note text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE climashield.businesses (
  id uuid PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL, sector text NOT NULL, district text NOT NULL,
  location geometry(Point,4326), monthly_revenue numeric(16,2) CHECK(monthly_revenue>=0),
  monthly_fixed_cost numeric(16,2) CHECK(monthly_fixed_cost>=0), variable_cost_ratio numeric(5,4) CHECK(variable_cost_ratio BETWEEN 0 AND 1),
  inventory_value numeric(16,2) CHECK(inventory_value>=0), cash_reserve numeric(16,2) CHECK(cash_reserve>=0),
  vulnerability numeric(5,4) CHECK(vulnerability BETWEEN 0 AND 1), adaptation numeric(5,4) CHECK(adaptation BETWEEN 0 AND 1),
  synthetic boolean NOT NULL DEFAULT true CHECK(synthetic), created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(location IS NULL OR (ST_X(location) BETWEEN -180 AND 180 AND ST_Y(location) BETWEEN -90 AND 90))
);
CREATE INDEX businesses_location_gist ON climashield.businesses USING gist(location);
CREATE INDEX businesses_sector_district ON climashield.businesses(sector,district);
CREATE TABLE climashield.loans (
  id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES climashield.businesses(id),
  balance numeric(16,2) NOT NULL CHECK(balance>=0), monthly_installment numeric(16,2) NOT NULL CHECK(monthly_installment>=0),
  status text NOT NULL CHECK(status IN ('ACTIVE','CLOSED')), currency text NOT NULL DEFAULT 'PEN' CHECK(currency='PEN')
);
CREATE INDEX loans_business_id ON climashield.loans(business_id);
CREATE TABLE climashield.climate_hazards (
  id uuid PRIMARY KEY, name text NOT NULL, type text NOT NULL DEFAULT 'rain_flood', geometry geometry(Polygon,4326) NOT NULL,
  source_id uuid NOT NULL REFERENCES climashield.data_sources(id), intensity numeric(5,4) NOT NULL CHECK(intensity BETWEEN 0 AND 1),
  valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL, issued_at timestamptz NOT NULL,
  synthetic boolean NOT NULL DEFAULT true CHECK(synthetic), CHECK(valid_until>valid_from), CHECK(ST_IsValid(geometry))
);
CREATE INDEX hazards_geometry_gist ON climashield.climate_hazards USING gist(geometry);
CREATE TABLE climashield.evaluation_runs (
  id uuid PRIMARY KEY, scenario_id text NOT NULL CHECK(scenario_id IN ('leve','moderado','severo')), scenario_clock timestamptz NOT NULL,
  model_version text NOT NULL, source_id uuid REFERENCES climashield.data_sources(id), input_hash text NOT NULL,
  summary jsonb NOT NULL, assessed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE climashield.risk_assessments (
  id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES climashield.evaluation_runs(id), business_id uuid NOT NULL REFERENCES climashield.businesses(id),
  score numeric(5,2) CHECK(score BETWEEN 0 AND 100), priority text NOT NULL CHECK(priority IN ('ALTA','MEDIA','BAJA','UNKNOWN')),
  exposed boolean NOT NULL, data_quality text NOT NULL CHECK(data_quality IN ('COMPLETA','PARCIAL','DESCONOCIDA')),
  evidence jsonb NOT NULL, UNIQUE(run_id,business_id)
);
CREATE INDEX assessments_run_priority ON climashield.risk_assessments(run_id,priority);
CREATE TABLE climashield.financial_scenarios (
  id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES climashield.businesses(id), assumptions jsonb NOT NULL,
  baseline_cash numeric(16,2) NOT NULL, stressed_cash numeric(16,2) NOT NULL, mitigated_cash numeric(16,2) NOT NULL,
  gross_avoided_loss numeric(16,2) NOT NULL, intervention_cost numeric(16,2) NOT NULL CHECK(intervention_cost>=0), net_benefit numeric(16,2) NOT NULL,
  result jsonb NOT NULL, model_version text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE climashield.optimization_plans (
  id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES climashield.evaluation_runs(id), solver_status text NOT NULL,
  constraints jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE climashield.interventions (
  id uuid PRIMARY KEY, plan_id uuid NOT NULL REFERENCES climashield.optimization_plans(id), business_id uuid NOT NULL REFERENCES climashield.businesses(id),
  action_code text NOT NULL, action text NOT NULL, estimated_cost numeric(16,2) NOT NULL CHECK(estimated_cost>=0),
  duration_minutes integer NOT NULL CHECK(duration_minutes>0), estimated_benefit numeric(16,2) NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','ASSIGNED','CONTACTED','COMPLETED','CANCELLED')),
  assigned_advisor text, approved_at timestamptz, result_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(plan_id,business_id),
  CHECK(status NOT IN ('APPROVED','ASSIGNED','CONTACTED','COMPLETED') OR approved_at IS NOT NULL)
);
CREATE TABLE climashield.audit_events (
  id uuid PRIMARY KEY, actor_id text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL,
  action text NOT NULL, timestamp timestamptz NOT NULL DEFAULT now(), metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_entity_timestamp ON climashield.audit_events(entity_id,timestamp);
-- Defensa adicional si el esquema se expone por error en Supabase. Sin acceso anónimo.
ALTER TABLE climashield.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE climashield.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE climashield.climate_hazards ENABLE ROW LEVEL SECURITY;
ALTER TABLE climashield.data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE climashield.evaluation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE climashield.risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE climashield.financial_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE climashield.optimization_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE climashield.interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE climashield.audit_events ENABLE ROW LEVEL SECURITY;

