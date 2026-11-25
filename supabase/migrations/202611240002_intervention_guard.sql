CREATE OR REPLACE FUNCTION climashield.guard_intervention_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status='DRAFT' AND NEW.status IN ('APPROVED','CANCELLED')) OR
    (OLD.status='APPROVED' AND NEW.status IN ('ASSIGNED','CANCELLED')) OR
    (OLD.status='ASSIGNED' AND NEW.status IN ('CONTACTED','CANCELLED')) OR
    (OLD.status='CONTACTED' AND NEW.status IN ('COMPLETED','CANCELLED'))
  ) THEN RAISE EXCEPTION 'Transición de intervención inválida'; END IF;
  IF NEW.status IN ('CANCELLED','COMPLETED') AND length(trim(NEW.result_note))=0 THEN
    RAISE EXCEPTION 'Se requiere motivo o resultado';
  END IF;
  NEW.updated_at=now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER intervention_transition BEFORE UPDATE ON climashield.interventions
FOR EACH ROW EXECUTE FUNCTION climashield.guard_intervention_transition();

