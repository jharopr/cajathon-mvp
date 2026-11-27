# Arquitectura actual de ClimaShield AI

Ampliación del 27/11: [redacción preventiva acotada del MVP](mvp-prevencion.md), implementada bajo solicitud con protocolos JSON y cinco reservas por análisis. La [arquitectura de plantillas por grupo](propuesta-redaccion-preventiva.md) sigue propuesta. La evaluación y la selección permanecen individuales.
## Ampliación de decisión del 27/11/2026

`portfolio/capacity.ts` genera el perfil sintético v2 y calcula capacidad. `analysis/model.ts` entrena/infiere doce variables y conserva lectura del artefacto v1. `analysis/decision.ts` desglosa el score operativo. `impact.ts` evalúa escenarios y controles por acción; `event-plan.ts` y el optimizador limitan costo, minutos, cobertura y cuotas diferidas. `agent/report.ts` atiende consultas con contexto fijo y herramientas de lectura. React añade `DecisionSummary` y `ConsultationPanel`; la selección de cliente se comparte para navegar desde el plan a la ficha.

`202611260006_decision_context.sql` añade métricas NUMERIC y `consultation_reports` con RLS. Se integró y verificó con PostgreSQL/PostGIS junto a la migración independiente `202611270006_preventive_recommendations.sql`; ambas mantienen su nombre y checksum. Los protocolos se eligen por política: v1 conserva su contenido y v2 añade continuidad. [Metodología vigente](decision-model-v2.md) y [validación](validation-report.md). El resto del documento describe la arquitectura base conservada.

Refactorización por eventos del 26/11/2026. Monolito modular **NestJS + TypeScript**, **React + Vite** y **PostgreSQL/PostGIS** en Docker. Supabase sigue siendo destino PostgreSQL configurable; no se verificó un despliegue remoto. Gemini se llama exclusivamente desde NestJS.

La [propuesta y comparación antes/actual](plan-refactorizacion-puntos-mejora.md) y el [informe de implementación](refactor-implementation.md) explican las eliminaciones y límites. La [arquitectura anterior](archive/architecture-20261124.md) y su [SVG histórico](architecture.svg) se conservan como evidencia previa.

```mermaid
flowchart TB
  WEB[React: EventProvider y cinco vistas] <--> HTTP[Controladores NestJS]
  HTTP --> PORT[PortfolioModule: cortes e historia]
  HTTP --> CLIM[ClimateModule: fuentes y eventos]
  HTTP --> ANALYSIS[AnalysisModule: predicción e impacto]
  HTTP --> PLAN[PlanningModule: revisión y seguimiento]
  TIMER[RuntimeService: scheduler] --> CLIM
  CLIM --> JOBS[Jobs con lease y reintentos]
  JOBS --> ANALYSIS
  PORT --> ANALYSIS
  EXP[Exposure Repository: ST_Covers y snapshots] --> ANALYSIS
  MODEL[Artefacto logístico TS versionado] --> ANALYSIS
  POLICY[Catálogo y política versionados] --> ANALYSIS
  ANALYSIS --> OPT[Optimizador de beneficio de cartera]
  OPT --> ATOMIC[Plan y notificación atómicos]
  ATOMIC --> WEB
  HTTP --> REPORT[agent/report.ts: dos herramientas de lectura]
  REPORT <--> GEMINI[Gemini opcional con store:false]
  HTTP --> PREV[RecommendationsModule: solicitud, elegibilidad y cinco reservas]
  KNOWLEDGE[Protocolos JSON de demostración] --> PREV
  PREV <--> GEMINI
  PREV --- DB
  DB[(PostgreSQL/PostGIS)] --- PORT
  DB --- CLIM
  DB --- ANALYSIS
  DB --- PLAN
  DB --- JOBS
```

## Responsabilidades y contratos

| Ubicación | Responsabilidad |
| --- | --- |
| `apps/api/src/main.ts` | Composición de módulos, errores, CORS y salud |
| `portfolio/` | Corte inmutable, perfiles sintéticos y 24 períodos por crédito |
| `climate/exposure.repository.ts` | SQL espacial, índice de referencia, fuentes y evaluaciones reproducibles |
| `climate/events.service.ts` | Identidad del aviso/revisión, snapshot, vigencia y replay rotulado |
| `analysis/model.ts` | Entrenamiento logístico, variables al corte, explicación, métricas y grupos |
| `analysis/impact.ts` | Escenarios pareados y calendarios financieros con Decimal |
| `analysis/analysis.service.ts` | Encolado, inferencia, finalización transaccional y consulta de evidencia |
| `analysis/runtime.service.ts` | Detección periódica, actualización del corte sintético y consumo de trabajos |
| `planning/` | Política inmutable, candidatos, optimización, comparadores, autorización y estados |
| `agent/report.ts` | Informe contextual; herramientas validadas, sin aprobaciones ni contactos |
| `shared/` | Contratos sin runtime, importes, autorización y estados |
| `apps/web/src/app/` | Montaje, navegación y contexto de evento; credencial en memoria |
| `apps/web/src/features/` | Eventos, cartera, impacto, planes y fuentes; vistas cargadas de forma diferida |

El repositorio espacial sigue concentrando las consultas geográficas y el índice histórico; ya no coordina los cálculos de crédito ni los planes. El simulador de caja antiguo permanece solo como referencia de regresión.

## Persistencia

Migraciones SQL versionadas, checksum y transacciones. Se conservan `0001–0003`; `202611260004_event_analysis.sql` añade:

- `portfolio_snapshots`, `loan_payment_history`, `model_versions`, `policy_versions`.
- `climate_events`, `analysis_runs`, `client_predictions`, `event_jobs`, `notifications`.
- `202611260005_financial_periods.sql` agrega `financial_projection_periods` con importes NUMERIC y totales NUMERIC en planes.
- Referencias `analysis_id` en planes y escenarios financieros anteriores.

```mermaid
erDiagram
  PORTFOLIO_SNAPSHOTS ||--o{ LOAN_PAYMENT_HISTORY : contiene
  PORTFOLIO_SNAPSHOTS ||--o{ ANALYSIS_RUNS : congela
  CLIMATE_EVENTS ||--o{ ANALYSIS_RUNS : origina
  MODEL_VERSIONS ||--o{ ANALYSIS_RUNS : predice
  POLICY_VERSIONS ||--o{ ANALYSIS_RUNS : configura
  EVALUATION_RUNS ||--o{ ANALYSIS_RUNS : aporta_geografia
  ANALYSIS_RUNS ||--o{ CLIENT_PREDICTIONS : guarda
  ANALYSIS_RUNS ||--|| EVENT_JOBS : procesa
  ANALYSIS_RUNS ||--o| OPTIMIZATION_PLANS : prepara
  ANALYSIS_RUNS ||--o{ NOTIFICATIONS : avisa
  OPTIMIZATION_PLANS ||--o{ INTERVENTIONS : propone
```

Con ambas ampliaciones hay 25 tablas en el esquema, incluida `schema_migrations` y la nueva `consultation_reports`. `preventive_recommendations` relaciona análisis, plan y cliente, congela protocolos/contexto y protege cinco reservas y resultados finales. Los triggers también protegen versiones/snapshots/eventos inmutables y las transiciones de intervención. RLS sigue habilitado sin acceso anónimo. El rol propietario de la demo requiere sustitución por privilegios mínimos y Auth antes de un piloto.

## Invariantes de cálculo y ejecución

- Ubicación ausente → `UNKNOWN`. Geocodificación cuestionable o datos insuficientes → revisión, sin predicción nueva.
- Índice climático ≠ probabilidad de atraso; exposición ≠ pérdida; beneficio modelado ≠ ahorro observado.
- `ST_Covers` incluye bordes. Préstamos agregados antes del cruce y resultados únicos por negocio; no se suman varias veces por capas.
- Decimal y NUMERIC para importes; el solver utiliza centavos enteros y BigInt para comparar beneficios sin perder precisión.
- Un modelo activo explícito, política, corte, evento y versión de motor identifican cada ejecución. El evento nunca se modifica para fingir una nueva versión.
- Un job se reclama con bloqueo breve y lease. El análisis se ejecuta fuera de transacciones largas; su salida y la notificación se confirman juntas y comprueban el token del lease.
- Un aviso actualizado produce otro evento; cambiar solo la hora de consulta no lo duplica. Repetir entradas no duplica ejecución, plan ni notificación.
- El cálculo y la alerta funcionan sin Gemini. El informe con IA requiere la solicitud autenticada del coordinador; fallos no cambian el informe previo por una respuesta falsamente atribuida a IA.

## Límites de despliegue

La cola está en PostgreSQL y el procesador comparte el proceso Node; un análisis puede bloquear temporalmente HTTP durante los cálculos. No se introduce infraestructura de concurrencia productiva. El mapa carga MapLibre solo al abrirse; tabla y detalle funcionan sin WebGL o teselas. El chunk de MapLibre conserva un aviso de tamaño del bundler.

La revisión mensual CENEPRED crea una tarea y permite registrar evidencia humana; no descubre automáticamente publicaciones nuevas. La actualización de historia produce nuevos datos sintéticos, no pagos reales. Sequía, otros segmentos, importación, canales externos, integración bancaria y Auth institucional siguen fuera del MVP.
