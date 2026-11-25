# Diccionario

Cartera ficticia en PEN. Amenazas oficiales (CENEPRED, SENAMHI) o sintéticas, siempre con fuente. IDs de seed y capas oficiales deterministas; operaciones con UUID aleatorios. Montos NUMERIC(16,2), ratios NUMERIC(5,4), fechas timestamptz, geometrías SRID 4326 y JSONB para evidencia/snapshots.

| Tabla | Campos y reglas principales |
| --- | --- |
| data_sources | id/name/url, data_kind (synthetic, forecast, observed, official_static, official_alert), publisher, version, published_at, valid_from/valid_until, retrieved_at, last_checked_at, status (current, stale, empty, unavailable), checksum, feature_count, license_note, metadata |
| businesses | id/code únicos; name/sector/district declarado; location Point 4326 nullable; ventas/costos/inventario/caja; ratios; synthetic=true obligatorio |
| loans | business_id FK, balance, monthly_installment, status ACTIVE/CLOSED, currency PEN; relación 1:N |
| climate_hazards | Escenario sintético: Polygon 4326 válida, intensidad, fuente FK, emisión/vigencia; synthetic=true |
| official_hazard_zones | Fuente FK, layer (cenepred_suscep_inundacion, cenepred_suscep_mmasa, senamhi_aviso_lluvia, senamhi_activacion_quebrada), hazard_type, level 1–5, level_label, external_id único por fuente, MultiPolygon 4326 válida, emisión/vigencia (null en cartografía estática), properties; synthetic=false |
| district_risk_scenarios | Fuente FK, UBIGEO, departamento/provincia/distrito, peligro (flood, mass_movement), riesgo, valor, susceptibilidad, vulnerabilidad, población total/expuesta, viviendas expuestas, MultiPolygon, vigencia del escenario |
| evaluation_runs | escenario, reloj, hazard_source (synthetic/official), source_versions, versión de modelo, fuente, input_hash, summary |
| risk_assessments | run/business FK, score nullable, prioridad/exposición/calidad, evidence con evaluaciones y snapshot; único run/negocio |
| financial_scenarios | negocio, supuestos, flujos/beneficios, result, versión, fecha |
| optimization_plans | run FK, estado solver, restricciones, resultado y fecha |
| interventions | plan/business FK, acción, costo, beneficio, minutos, estado, asesor, aprobación, resultado; único plan/negocio |
| audit_events | actor, entidad, acción (incluye SOURCE_REFRESHED), timestamp, metadata; sin secretos |
| schema_migrations | versión, checksum, fecha; no editar SQL aplicado |

Evidencia por negocio en modo oficial: `evaluations[]` con kind `susceptibility` (zona que contiene el punto, E=1), `district` (respaldo distrital, E=población expuesta/total) o `alert` (aviso SENAMHI, sin score); además `official_district`, `district_risk`, `alerts` y `location_issue`.

CSV es exportación, no contrato de importación operativo. location en CSV es `lon lat`; JSON `[lon,lat]`. CS-0006 exporta saldo/cuota de dos créditos. Seed: 1000 negocios, 1001 créditos, tres amenazas sintéticas, 3,484 zonas CENEPRED y 12 distritos × 2 peligros.

El distrito de cada negocio ficticio es una etiqueta de clúster. En modo oficial se compara con el distrito que contiene la coordenada (PostGIS); las diferencias se reportan, no se corrigen. CS-0002 en borde sintético, CS-0003 sin ubicación, CS-0004 sin ingresos, CS-0005 fuera de amenaza sintética. No se usan personas o domicilios de clientes reales.
