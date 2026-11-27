# ClimaShield AI

Prototipo de prevención por evento climático para microfinanzas. Une **aviso → exposición → predicción experimental → impacto modelado → plan → alerta interna → revisión humana**.

**Cartera y pagos exclusivamente ficticios.** CENEPRED y SENAMHI aportan cartografía/avisos oficiales con procedencia y vigencia. El índice climático no es probabilidad de mora. El modelo separado estima atraso >30 días en 90 días usando historia sintética; no está calibrado para clientes reales. Saldo expuesto no es pérdida y la pérdida modelada no es una provisión regulatoria.

## Cambio del 26/11/2026

Se implementó el alcance recortado del [plan de refactorización](docs/plan-refactorizacion-puntos-mejora.md). [Cambios y pendientes](docs/refactor-implementation.md), [arquitectura actual](docs/architecture.md), [validación ejecutada](docs/validation-report.md) y [guion de demo](docs/demo-script.md).

La aplicación tiene cinco vistas: Eventos y alertas, Clientes, Impacto de cartera, Plan y seguimiento, Fuentes. Se retiraron el chat abierto, la pantalla de arquitectura, el simulador libre y Open-Meteo. Gemini genera opcionalmente el informe de un evento con herramientas de lectura y, desde el 27/11, una secuencia preventiva bajo solicitud para casos seleccionados. No aprueba, contacta, envía mensajes ni calcula importes.

## Stack

Implementación acotada: [acciones preventivas del MVP y caso de uso](docs/mvp-prevencion.md). En Clientes, filtrar seleccionados del plan, abrir una ficha y preparar acciones: hasta cinco reservas por análisis, protocolos demo, Gemini opcional y respaldo identificado sin IA. La [arquitectura de plantillas por grupo](docs/propuesta-redaccion-preventiva.md) sigue siendo una ampliación propuesta.

| Capa | Implementación |
| --- | --- |
| Aplicación | React 19 + TypeScript + Vite; vistas y MapLibre diferidos |
| Backend | NestJS 11, Zod y SQL parametrizado con pg |
| Datos | PostgreSQL 16 + PostGIS local en Docker; destino Supabase por variables |
| Dinero y planes | Decimal.js, NUMERIC y optimizador TS con centavos/BigInt |
| Modelo | Regresión logística TS, artefacto y datos sintéticos reproducibles |
| Automatización | Jobs PostgreSQL con lease/reintentos y alertas dentro de la aplicación |
| IA | SDK oficial `@google/genai`, Interactions, `store:false`, herramientas limitadas |

```text
apps/api/src/portfolio/  cortes e historia por crédito
apps/api/src/climate/    fuentes, exposición y eventos
apps/api/src/analysis/   modelo, escenarios, impacto y procesador
apps/api/src/planning/   catálogo, optimizador y seguimiento
apps/api/src/agent/      informe con evidencia
apps/web/src/app/        navegación y contexto del evento
apps/web/src/features/   cinco vistas operativas
supabase/migrations/    migraciones SQL versionadas
scripts/                setup, ingesta, generación y entrenamiento TS
data/models/            modelo de demo versionado
data/official/          recorte y snapshot oficiales con manifiesto
docs/archive/           concepto, arquitectura y propuesta previos
```

No hay API Python ni SQLite. Los scripts Python existentes se conservan solo para documentación histórica.

## Arranque local en Windows

Node.js 24, npm y Docker Desktop con motor Linux activo. Puertos: **5180 web, 8081 API, 54322 PostgreSQL**.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
npm run dev
```

Abrir **http://127.0.0.1:5180**. Salud: http://127.0.0.1:8081/api/v1/health.

Arranque manual, conservando `.env` si ya existe:

```powershell
npm ci
# Solo si .env todavía no existe:
Copy-Item .env.example .env
# Configurar una credencial local propia en DEMO_COORDINATOR_TOKEN.
docker compose up -d --wait db
npm run db:migrate
npm run db:seed
npm run dev
```

El modelo entrenado ya está en `data/models/deterioration-v1.json`. El procesador prepara el corte y la historia ficticia, crea una reproducción rotulada si no hay un aviso para demostrar y genera análisis/plan/alerta sin una consulta de chat. No necesita red ni Gemini para ese recorrido precargado.

El seed conserva negocios y créditos existentes. Las migraciones 0001–0003 permanecen intactas; 0004 agrega nueve tablas; 0005 agrega períodos financieros NUMERIC y totales en planes para versiones, historia, eventos, análisis, jobs y notificaciones. El runner verifica SHA-256 y usa bloqueo/transacciones. No utiliza sincronización, reset ni reversión destructiva.

La migración 0006 añade recomendaciones preventivas con snapshots, cinco reservas por análisis, uso reportado y protección de resultados guardados. No modifica las cinco migraciones anteriores.

También puede ejecutarse todo en Docker:

```powershell
docker compose --profile full up -d --build --wait
```

Usar los mismos puertos; no mantener servidores npm ocupándolos. `docker compose stop` detiene los contenedores sin borrar el volumen.

## Configuración

`.env` está excluido de Git. No usar variables `VITE_` para secretos ni exponer claves de Gemini en React.

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | PostgreSQL de la API |
| `DIRECT_URL` | Migraciones: conexión directa o session pooler |
| `DATABASE_SSL` | `false` local; `true` con validación de certificado en remoto |
| `POSTGRES_PASSWORD` | Credencial del contenedor local |
| `DEMO_COORDINATOR_TOKEN` | Revisión y acciones operativas locales; solo en memoria de la página |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Informe opcional desde backend; modelo por defecto `gemini-3.5-flash-lite` |
| `PREVENTION_DAILY_LIMIT` | Máximo diario local de intentos de redacción preventiva, hora de Lima; 20 por defecto. No representa la cuota del proveedor |
| `EVENT_WORKER_ENABLED` | `true` por defecto; `false` detiene scheduler/procesador |
| `EVENT_SOURCE_REFRESH_MINUTES` | `30` por defecto; mínimo 5 para consultar; `0` desactiva red para pruebas/demo sin conexión |
| `DEMO_EVENTS_ENABLED` | `true` por defecto; crea un replay/ficticio explícito de respaldo |
| `CORS_ORIGINS`, `PORT` | Orígenes permitidos y puerto NestJS |

La variable antigua `SENAMHI_REFRESH_MINUTES` fue reemplazada por `EVENT_SOURCE_REFRESH_MINUTES`. No se sobrescribieron claves del `.env` existente.

Sin Gemini, el informe muestra **Informe sin IA**. Una solicitud de informe con proveedor fallido devuelve 503 y conserva el informe anterior y el plan. El protocolo limita iteraciones, llamadas y tiempo; las herramientas solo leen evidencia del análisis seleccionado.

## Datos, modelo y actualización

```powershell
npm run history:generate   # corte/historia ficticios, versionados e idempotentes
npm run model:train        # entrenamiento reproducible; no consume Gemini
npm run data:senamhi       # consulta y guarda snapshot oficial
npm run data:cenepred -- --dir data/raw/cenepred-102 --zip "$HOME/Downloads/102_shape.zip"
```

El entrenamiento no se ejecuta al arrancar. Si cambian generador, variables o parámetros del modelo, crear una nueva versión y archivo, ajustar el cargador y conservar la anterior. No sobrescribir un artefacto ya registrado con el mismo ID. La política tiene la misma protección.

Los cortes nuevos usan el último mes completo en Lima, con 24 meses de pagos inventados; los replays toman el corte anterior al evento. SENAMHI se consulta periódicamente. CENEPRED requiere una revisión mensual humana registrada en Fuentes: una tarea interna recuerda la comprobación, pero no afirma haber descubierto o descargado una publicación nueva.

## API actual

Prefijo `/api/v1`, validación Zod y errores `{code,message,details}`. Las escrituras operativas requieren `X-Coordinator-Token`.

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/health`, `/businesses`, `/businesses/:id` | Salud y cartera ficticia |
| GET | `/sources`, `/climate/alerts`, `/climate/hazards.geojson`, `/climate/districts.geojson` | Procedencia y cartografía |
| POST | `/sources/senamhi/refresh`, `/sources/cenepred/review` | Consulta o registro de revisión |
| GET | `/events`, `/events/:id`, `/events/:id/geometry` | Eventos y alcance geográfico |
| POST | `/events/:id/analyses` | Encolar análisis con recursos; devuelve ID/estado |
| POST | `/analyses/:id/retry` | Reintento manual autenticado de una ejecución fallida |
| GET | `/analyses/:id`, `/analyses/:id/clients/:clientId` | Estado, cifras, escenarios y evidencia |
| GET / POST | `/analyses/:id/report` | Leer informe / generar con Gemini |
| GET / POST | `/analyses/:id/clients/:clientId/prevention` | Consultar / preparar una secuencia preventiva guardada, hasta cinco por análisis |
| GET | `/notifications` | Alertas internas |
| PATCH | `/notifications/:id/read` | Marcar como leída |
| POST | `/interventions/drafts` | Crear borradores idempotentes desde un plan |
| GET / PATCH | `/interventions`, `/interventions/:id` | Revisión y seguimiento |
| POST | `/demo/events` | Preparar replay o evento ficticio de respaldo |
| GET | `/audit` | Últimos eventos de auditoría |

La aprobación registra una propuesta local; no ejecuta contratos de crédito. Estados DRAFT → APPROVED → ASSIGNED → CONTACTED → COMPLETED; cancelación y cierre requieren motivo/resultado. El trigger y las transacciones siguen protegiendo el flujo.

## Verificación

```powershell
npm test
npm run build
npm run test:integration
npx playwright install chromium
npm run test:e2e
```

Integración y navegador usan PostgreSQL de demo con migraciones y seed; generan datos sintéticos adicionales. Las pruebas no hacen llamadas reales a Gemini. El reporte contiene resultados reales, métricas y límites; el workflow CI se conserva, pero no se presupone ejecutado en GitHub.

## Supabase y límites

Cambiar `DATABASE_URL`, `DIRECT_URL` y `DATABASE_SSL=true` manteniendo validación TLS, habilitar PostGIS y aplicar las mismas migraciones. No usar transaction pooler para migraciones. React sigue detrás de NestJS, sin claves privilegiadas. Supabase remoto, Auth y Storage no están verificados/integrados.

La demo cubre lluvias/inundación, micro y pequeña empresa. No cubre todavía sequía/friaje/temperaturas extremas, otros segmentos validados, importador CSV/Parquet, cartera real, fondeo de contingencia, core bancario o canales de contacto externos. El cálculo comparte el proceso Node y no acredita concurrencia productiva. Las leyendas GRIDCODE y la vigencia de 24 h SENAMHI siguen como hipótesis por confirmar.

Todo el código actual, incluida esta refactorización, es **previo al presencial**. [Declaración de preexistentes](docs/preexisting-components.md). El [concepto actualizado](SOLUTION_CONCEPT.md) describe el alcance real. El [PDF del 24/11](artifacts/ClimaShield_AI_Solution_Concept.pdf), las capturas anteriores y el SVG previo se conservan como evidencia histórica y no representan esta versión.
