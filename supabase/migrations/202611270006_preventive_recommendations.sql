-- Recomendaciones bajo solicitud: cinco reservas persistentes por análisis.
CREATE TABLE climashield.preventive_recommendations (
  id uuid PRIMARY KEY,
  analysis_id uuid NOT NULL REFERENCES climashield.analysis_runs(id),
  plan_id uuid NOT NULL REFERENCES climashield.optimization_plans(id),
  business_id uuid NOT NULL,
  context_hash text NOT NULL,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 5),
  protocol_version text NOT NULL,
  protocol_hash text NOT NULL,
  protocol_snapshot jsonb NOT NULL,
  context jsonb NOT NULL,
  selection_mode text NOT NULL CHECK (selection_mode IN ('HIGH','MANUAL')),
  selection_reason text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('GENERATING','READY')),
  mode text CHECK (mode IN ('gemini','deterministic')),
  provider text,
  provider_attempted boolean NOT NULL DEFAULT false,
  fallback_reason text,
  usage jsonb,
  content jsonb,
  lease_token uuid NOT NULL,
  lease_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  FOREIGN KEY (analysis_id,business_id) REFERENCES climashield.client_predictions(analysis_id,business_id),
  UNIQUE (analysis_id,slot),
  UNIQUE (analysis_id,business_id,context_hash),
  CHECK ((status='GENERATING' AND content IS NULL AND mode IS NULL AND completed_at IS NULL)
      OR (status='READY' AND content IS NOT NULL AND mode IS NOT NULL AND completed_at IS NOT NULL)),
  CHECK (mode IS DISTINCT FROM 'gemini' OR provider_attempted),
  CHECK (selection_mode<>'MANUAL' OR length(trim(selection_reason))>=10)
);
CREATE INDEX prevention_provider_attempts ON climashield.preventive_recommendations(created_at) WHERE provider_attempted;
ALTER TABLE climashield.preventive_recommendations ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION climashield.protect_prevention_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Recomendación de demostración inmutable'; END IF;
  IF OLD.status='READY' OR
     (to_jsonb(NEW)-ARRAY['status','mode','provider','fallback_reason','usage','content','completed_at']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['status','mode','provider','fallback_reason','usage','content','completed_at'])
  THEN RAISE EXCEPTION 'Contexto o recomendación final inmutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER prevention_immutable BEFORE UPDATE OR DELETE ON climashield.preventive_recommendations
FOR EACH ROW EXECUTE FUNCTION climashield.protect_prevention_record();
