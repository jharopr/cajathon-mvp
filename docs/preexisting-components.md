# Declaración de preexistentes

Integración del 27/11/2026: el merge de decisión v2 con el MVP preventivo conserva ambas implementaciones. Añade únicamente su acoplamiento: protocolos por versión de política, continuidad v2 y validación de alternativas antes de redactar. Esta integración, sus pruebas y documentación también son previas al presencial.

## Ampliación previa del 27/11/2026

Se añaden perfil y pagos sintéticos v2, regresión logística de doce variables con signos restringidos, artefacto `logistic-synthetic-2`, score operativo desglosado, DSCR bajo estrés, controles de viabilidad, costo de diferimiento, límite de liquidez, cola de revisión y agente de consulta por análisis/cliente. El frontend incorpora ficha de decisión y consulta contextual. Se añade migración 0006 sin reescribir las anteriores.

**Todo es previo al presencial.** Esta ampliación no debe atribuirse a las jornadas futuras. Las propuestas para esas jornadas son validar pesos y políticas con el responsable del reto, contrastar costos/eficacia, acordar criterios de viabilidad y documentar resultados observados con insumos autorizados. La migración y el recorrido con PostgreSQL de esta versión no se verificaron en el entorno de ampliación; ver el reporte vigente.

Corte original: **24/11/2026**. Ampliación: **26/11/2026, America/Lima**. No sustituye revisión de licencias ni acuerdos del equipo.

## Base preparada antes del presencial

Al inicio solo existía README y commit `37530ef` (`first commit`). En preparación se escribieron API NestJS, React, datos sintéticos, migraciones, cruce PostGIS, índice, simulador, optimizador, cliente Gemini, intervenciones, auditoría, pruebas y documentos. El 24/11/2026 se añadió además la integración de clima oficial: migración 0003, lector shapefile, ingesta CENEPRED, conector SENAMHI, modo de evaluación oficial, pestaña de fuentes y refresco opcional. **Todos se declaran previos a las jornadas presenciales.** Titularidad/contribuciones a formalizar por el equipo; no se añade licencia general de cesión.

No se ha hecho push ni inventado hash de cambios sin commit. Registrar un commit/etiqueta de corte antes de la fase presencial y conservar los cambios posteriores para evidenciar el avance.

## Terceros reutilizados

| Componente / procedencia | Condiciones de referencia |
| --- | --- |
| React, Meta y colaboradores | Licencia del paquete distribuido |
| NestJS, Vite, Zod, Decimal.js, pg, Lucide y TypeScript | Licencias/avisos en paquetes; versiones exactas en lockfile |
| PostgreSQL / PostGIS | Licencias PostgreSQL / GPL y condiciones de imagen |
| MapLibre / OpenStreetMap | Software y cartografía distintos; conservar atribución y revisar condiciones de teselas |
| Gemini / SDK Google | Términos/cuota de servicio y licencia SDK; claves fuera de entregables |
| Supabase | Condiciones del servicio/componentes; proyecto y credenciales propios |
| Docker Desktop | Revisar licencia aplicable al entorno y distribución |
| Habilidades .agents/skills | Agregadas por el usuario; conservar licencias y procedencia |
| Cartografía CENEPRED / SIGRID (SHAPE 102) | Datos públicos de la entidad; se versiona solo un recorte derivado con manifiesto y checksum del original. Conservar atribución y revisar condiciones de uso |
| Avisos SENAMHI (IDESEP WFS) | Servicio público; se guarda instantánea con hora de consulta. Conservar atribución y vigencia oficial |

Inventario de paquetes instalados: `artifacts/dependency-licenses.json`. Los textos distribuidos prevalecen sobre esta síntesis; no se reivindica autoría de componentes externos.

## Propuesta del 24/11: estado al 26/11

1. Evento operativo: agrupar avisos SENAMHI vigentes en un evento seleccionable, disparar reevaluación y plan por evento con trazabilidad del aviso que lo originó.
2. Política operativa versionada acordada con el Challenge Owner: catálogo, hipótesis de eficacia/costo, pesos de susceptibilidad y cobertura.
3. Comparación por evento entre plan, atenciones y resultados con tiempos/evidencias.
4. Importación validada de una cartera autorizada (o muestra anonimizada) con control de geocodificación contra límites oficiales.

Los eventos, las políticas sintéticas versionadas y el seguimiento por análisis se implementaron el 26/11 y ya son base previa. No están implementadas una política acordada institucionalmente, la comparación con resultados observados de piloto ni la importación de cartera autorizada. Los conectores, mapa, simulador de referencia, optimizador, bandeja, modelo y SDK tampoco son novedad presencial.

## Ampliación previa del 26/11/2026

Se añadieron historial ficticio mensual, regresión logística TypeScript, evaluación temporal/grupos, escenarios pareados, impacto institucional, nuevo objetivo del plan, propuestas financieras, eventos y jobs PostgreSQL, notificaciones internas e informe contextual. Se simplificó React a cinco vistas y se retiraron chat abierto, simulador libre, Open-Meteo y pantalla de arquitectura.

Se conservó `cd9303d` como referencia de código anterior y se archivaron concepto, arquitectura y propuesta originales en `docs/archive/`. Las migraciones 0004 y 0005 son nuevas; las tres anteriores no se reescribieron. Los resultados históricos del 24/11 se distinguen de las pruebas de esta refactorización.

**Toda esta implementación es anterior al presencial.** No atribuirla como avance de esas jornadas. Cualquier futura adaptación debe registrar corte inicial, commits y evidencia de lo desarrollado entonces. Informe de alcance: [refactor-implementation.md](refactor-implementation.md).

También se documentó el 26/11 la [propuesta de redacción preventiva reutilizable](propuesta-redaccion-preventiva.md). El documento es material previo; sus módulos de conocimientos, plantillas, excepciones y medición de consumo están propuestos y aún no implementados. No contarlos como funcionalidad disponible ni como avance presencial.

El **27/11/2026** se añadió el [MVP individual acotado](mvp-prevencion.md): protocolos JSON demo, solicitud autenticada para casos seleccionados, cinco reservas persistentes por análisis, Gemini con salida validada, respaldo sin IA, medición del uso reportado y ficha React. Es una adaptación nueva respecto del corte del 26/11, pero también es previa al presencial. La migración 0006 es aditiva; agrupación, plantillas compartidas, benchmark y revisión institucional permanecen pendientes. La mención anterior describe el estado al 26/11.

Referencia: [bases oficiales](https://cajathon.cajatrujillo.com.pe/bases/), secciones 3.3, 4 y 8.3. Condiciones jurídicas definitivas en bases y acuerdos suscritos.

