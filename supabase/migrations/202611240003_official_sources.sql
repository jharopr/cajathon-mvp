-- Fuentes oficiales públicas (CENEPRED, SENAMHI) con procedencia, vigencia y estado.
-- La cartera sigue siendo sintética: businesses.synthetic conserva CHECK(synthetic).
ALTER TABLE climashield.data_sources DROP CONSTRAINT IF EXISTS data_sources_data_kind_check;
ALTER TABLE climashield.data_sources ADD CONSTRAINT data_sources_data_kind_check
  CHECK (data_kind IN ('synthetic','forecast','observed','official_static','official_alert'));
ALTER TABLE climashield.data_sources
  ADD COLUMN publisher text,
  ADD COLUMN version text,
  ADD COLUMN published_at timestamptz,
  ADD COLUMN valid_from timestamptz,
  ADD COLUMN valid_until timestamptz,
  ADD COLUMN last_checked_at timestamptz,
  ADD COLUMN status text NOT NULL DEFAULT 'current' CHECK (status IN ('current','stale','empty','unavailable')),
  ADD COLUMN checksum text,
  ADD COLUMN feature_count integer CHECK (feature_count IS NULL OR feature_count >= 0),
  ADD CONSTRAINT data_sources_validity CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from);

-- Zonas oficiales: susceptibilidad CENEPRED (estática) y avisos SENAMHI (con vigencia).
CREATE TABLE climashield.official_hazard_zones (
  id uuid PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES climashield.data_sources(id),
  layer text NOT NULL CHECK (layer IN ('cenepred_suscep_inundacion','cenepred_suscep_mmasa','senamhi_aviso_lluvia','senamhi_activacion_quebrada')),
  hazard_type text NOT NULL CHECK (hazard_type IN ('flood','mass_movement','rain')),
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 5),
  level_label text NOT NULL,
  external_id text NOT NULL,
  region text,
  geometry geometry(MultiPolygon,4326) NOT NULL,
  issued_at timestamptz,
  valid_from timestamptz,
  valid_until timestamptz,
  properties jsonb NOT NULL DEFAULT '{}',
  synthetic boolean NOT NULL DEFAULT false CHECK (NOT synthetic),
  UNIQUE (source_id, external_id),
  CHECK (ST_IsValid(geometry)),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);
CREATE INDEX official_zones_geometry_gist ON climashield.official_hazard_zones USING gist(geometry);
CREATE INDEX official_zones_layer ON climashield.official_hazard_zones(layer, level);

-- Escenario de riesgo distrital CENEPRED (nivel de riesgo, susceptibilidad, población expuesta).
CREATE TABLE climashield.district_risk_scenarios (
  id uuid PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES climashield.data_sources(id),
  ubigeo text NOT NULL CHECK (ubigeo ~ '^[0-9]{6}$'),
  department text NOT NULL, province text NOT NULL, district text NOT NULL,
  hazard_type text NOT NULL CHECK (hazard_type IN ('flood','mass_movement')),
  risk_level text NOT NULL CHECK (risk_level IN ('Muy Alto','Alto','Medio','Bajo')),
  risk_value numeric(4,2),
  susceptibility_level text, vulnerability_level text,
  population_total integer CHECK (population_total IS NULL OR population_total >= 0),
  population_exposed integer CHECK (population_exposed IS NULL OR population_exposed >= 0),
  dwellings_exposed integer CHECK (dwellings_exposed IS NULL OR dwellings_exposed >= 0),
  geometry geometry(MultiPolygon,4326) NOT NULL,
  valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL,
  UNIQUE (source_id, ubigeo, hazard_type),
  CHECK (ST_IsValid(geometry)), CHECK (valid_until > valid_from)
);
CREATE INDEX district_risk_geometry_gist ON climashield.district_risk_scenarios USING gist(geometry);

-- Cada evaluación declara si cruzó cartografía oficial o el escenario sintético.
ALTER TABLE climashield.evaluation_runs
  ADD COLUMN hazard_source text NOT NULL DEFAULT 'synthetic' CHECK (hazard_source IN ('synthetic','official')),
  ADD COLUMN source_versions jsonb NOT NULL DEFAULT '[]';

ALTER TABLE climashield.official_hazard_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE climashield.district_risk_scenarios ENABLE ROW LEVEL SECURITY;
