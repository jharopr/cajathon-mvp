# ClimaShield AI

## Decisión preventiva con evidencia climática y capacidad de pago

Concepto actualizado al 27 de noviembre de 2026. Prototipo local previo a la fase presencial.

ClimaShield ayuda a determinar qué clientes necesitan revisión ante un evento climático, por qué requieren atención y qué medidas pueden evaluarse. La ficha combina ubicación, actividad, capacidad de pago total, gastos esenciales, reserva e historia de pagos con un modelo experimental. El resultado conecta criticidad con una acción verificable o una derivación explícita.

### Evaluación individual

La ubicación se cruza con el evento y las capas de susceptibilidad en PostGIS. Sin ubicación, el resultado es UNKNOWN; las inconsistencias de geocodificación se derivan. Una alerta regional por sí sola no acredita pérdida individual. CENEPRED y SENAMHI conservan fuente, versión y vigencia; los eventos reproducidos se identifican como históricos.

La regresión logística logistic-synthetic-2 usa doce variables de presión financiera, pagos y clima para estimar entrada en atraso mayor a 30 días en 90 días. La versión anterior se conserva. La historia y la cartera son ficticias: las métricas sintéticas no acreditan precisión institucional.

La prioridad operativa se muestra en una escala separada de 0 a 100: 20% amenaza/exposición, 30% déficit de capacidad bajo estrés, 15% déficit de reserva, 15% comportamiento y 20% señal logística. Cada componente muestra puntos y fundamento. Baja <30, media 30–49.99, alta 50–69.99, crítica ≥70. Pesos y umbrales son una política experimental. El índice territorial anterior continúa como referencia explicativa.

### Acción y valor para la institución

El [MVP de acciones preventivas](docs/mvp-prevencion.md) prepara hasta cinco recomendaciones bajo solicitud por análisis, para clientes de prioridad alta/crítica seleccionados en el plan. Cuando el plan no incluye prioridad alta, admite selección manual de otro cliente del plan con motivo. Se conservan los tres protocolos JSON originales para las ejecuciones v1 y se añade una versión con continuidad para v2; una alternativa descartada por los controles v2 no habilita redacción. Gemini solo redacta instrucciones, con resultados guardados y respaldo identificado sin IA. Esta ampliación también es previa al presencial. Las plantillas por grupo y la generación masiva siguen propuestas.

Se calcula caja disponible después de gastos operativos y del hogar, cobertura de cuotas propias y externas, liquidez adversa y central y severidad sintética por cliente. Los efectos del evento se representan con 500 realizaciones pareadas. Saldo expuesto, pérdida modelada, cobros, costos y margen mantienen significados distintos.

Se comparan evaluar diferimiento de dos cuotas, diagnóstico de liquidez y continuidad con protección de mercadería. Una acción debe mejorar caja del cliente, no empeorar escenarios adversos y aportar beneficio neto después de costo operativo y financiero. El diferimiento exige capacidad base de recuperación y un límite relativo al saldo. El diagnóstico por sí solo no recibe una reducción financiera automática.

La selección respeta presupuesto, minutos, cobertura mínima y límite agregado de cuotas diferidas. Cuando una acción no es viable o faltan recursos, el cliente permanece visible en revisión. La criticidad y la insuficiencia de una medida deben conducir a verificación del asesor; el prototipo no garantiza eliminar el riesgo.

Cada propuesta conserva motivos, condiciones y pasos de revisión, con seguimiento a 7 y 30 días. La aprobación local registra un borrador autorizado; no cambia contratos ni contacta personas.

### Agente e interfaz

Cinco vistas: Eventos y alertas, Clientes, Impacto de cartera, Plan y seguimiento, Fuentes. La ficha individual muestra criticidad, capacidad y alternativas, y permite consultar al agente. El plan muestra valor neto, compromiso de liquidez, restricciones y cola de revisión. La tabla y el detalle funcionan sin WebGL.

Gemini opera desde NestJS con herramientas de lectura del evento, plan y ficha de cliente. Cada consulta fija análisis y cliente opcional; el agente explica factores, criticidad, alternativas descartadas, beneficio, riesgo residual y pasos. No modifica cálculos ni ejecuta aprobaciones, SQL libre, URLs arbitrarias o contactos. El modo calculado sin proveedor se identifica como informe sin IA.

### Implementación y validación

Se conservan NestJS/TypeScript, React/Vite y PostgreSQL/PostGIS local, con destino Supabase por variables. El modelo, cálculos y optimización usan TypeScript; dinero con Decimal/NUMERIC. La migración 0006 amplía los registros sin modificar las cinco anteriores.

La integración de la ampliación con `main` se verificó con unitarias, build, PostgreSQL/PostGIS local, e2e y navegador sobre fixture sintético a tres anchos. Se preservaron migraciones aplicadas, modelo/protocolos v1 y la recomendación histórica guardada. No se realizó una nueva llamada real a Gemini durante el merge ni un despliegue remoto; la llamada real del MVP anterior es evidencia histórica diferenciada. Resultados y límites actuales en el informe de validación.

Todos los componentes actuales y esta ampliación son previos al presencial. Las adaptaciones nuevas que se acuerden entonces deben registrar su propio corte, commits y evidencia. Quedan pendientes datos autorizados, calibración, eficacia observada de acciones, otros fenómenos y segmentos, cronogramas reales, seguridad institucional, core bancario y canales externos.

Metodología y referencias: [modelo y decisión v2](docs/decision-model-v2.md). Resultados reales y limitaciones: [validación](docs/validation-report.md). Origen de componentes: [preexistentes](docs/preexisting-components.md).
