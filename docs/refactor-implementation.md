# Refactorización por eventos: alcance implementado

Implementación local del **26/11/2026, America/Lima**, a partir de `cd9303d`. Todo lo construido en esta fecha es previo al presencial. No hay push ni despliegue remoto.

## Resultado

El producto pasa de siete herramientas aisladas a cinco vistas en un mismo evento: **Eventos y alertas, Clientes, Impacto de cartera, Plan y seguimiento, Fuentes**.

El procesador detecta avisos nuevos/revisados, prepara una evaluación y plan en segundo plano y crea una notificación interna. Un coordinador revisa las propuestas. No se envían mensajes ni se ejecutan facilidades financieras. Gemini es opcional: genera un informe contextual con dos herramientas de evidencia; el plan y el aviso no dependen de su disponibilidad.

## Antes y después

| Antes, `cd9303d` | Ahora |
| --- | --- |
| Índice climático fijo como prioridad principal | Índice de referencia separado de regresión logística experimental de atraso >30 días en 90 días |
| Sin comportamiento de pago temporal | 24 meses ficticios por crédito, perfiles de deuda y segmentos micro/pequeña |
| Simulación libre con eficacia arbitraria | 500 escenarios pareados y propuestas del catálogo versionado |
| Beneficio del negocio como objetivo del plan | Reducción modelada de pérdida de cartera menos costo operativo; alivio del cliente como desempate |
| FIFO como comparación | Mayor saldo y sector/zona con recursos y elegibilidad equivalentes |
| Evaluación solicitada por el usuario | Aviso → evento inmutable → job con lease → análisis → plan → alerta interna |
| Asistente con preguntas abiertas | Informe del evento con herramientas de solo lectura |
| Un controlador, repositorio y dominio centrales | Módulos/carpeta por función; React por vistas y contexto de evento |

Arquitectura real y responsabilidades: [architecture.md](architecture.md). Propuesta original: [archivo del plan](archive/plan-refactorizacion-20261126-propuesta.md).

## Funcionalidad retirada

- Pantallas independientes de Asistente IA, Arquitectura y Simulador financiero.
- Ruta `/agent/run`, `/climate/live`, simulación libre y optimización sin evento.
- Open-Meteo y su consulta/registro/política. Los registros históricos de la fuente permanecen en la base.
- Catálogo `CALL/INVENTORY/LIQUIDITY` con reducción fija de daños. El catálogo nuevo propone evaluar reprogramación de dos cuotas o visita de liquidez; no altera físicamente la lluvia o el inventario.
- Archivos centrales antiguos `controller.ts`, `domain.ts`, `repository.ts`, `agent.ts` y tipos de vistas retiradas. Sus responsabilidades útiles están trasladadas a carpetas del dominio.

El simulador anterior permanece como función de referencia histórica y prueba de regresión en `analysis/reference-cash.ts`, sin una ruta ni pantalla del producto. Se conserva la base de datos histórica, la georreferenciación y el motor de opciones múltiples.

## Datos, modelo y finanzas

La cartera conserva sus 1,000 negocios y 1,001 créditos. `portfolio_snapshots` añade cortes inmutables; `loan_payment_history` contiene 24 períodos por crédito. El generador puede extender mensualmente la historia sintética sin cambiar pagos ya generados. La inferencia por evento usa el último corte completo anterior a ese evento; una reproducción histórica no usa datos posteriores.

El entrenamiento usa cortes 6/10; validación 14; prueba 18/21, con ventanas de etiqueta purgadas entre entrenamiento, validación y prueba. Un grupo de clientes no participa en entrenamiento y se evalúa por separado. El artefacto contiene normalización, coeficientes, hash del dataset, métricas, calibración, grupos y comparación sin clima/tasa base. No se reentrena automáticamente al arrancar.

Las contribuciones del modelo se explican en escala logit; no son SHAP ni efectos causales. La ubicación ausente produce `UNKNOWN`. Datos financieros o geocodificación cuestionables se separan como incompletos; clientes ya deteriorados se derivan y no reciben una nueva predicción de entrada en deterioro.

La pérdida es una aproximación de escenario `saldo × p_atraso_30d_90d × severidad_condicional`. La severidad 25% es un supuesto sintético explícito, no LGD calibrada ni el 10% histórico citado en el Word. No se estiman provisiones regulatorias. Se conserva la distinción entre saldo expuesto, saldo ponderado por deterioro y pérdida modelada.

La Caja tiene un calendario hipotético de principal e intereses por período, cobros esperados, costos, variación de caja y de margen. Diferir cuotas conserva el capital y desplaza vencimientos. El calendario supone principal del 88% e interés del 12% de la cuota por período; no es una tasa o condición contractual de Caja Trujillo. No suma el principal como ingreso o gasto contable.

El efecto de las acciones procede de hipótesis de escenario: la reprogramación alivia presión inicial de cuotas y la visita supone apoyo a recuperación. No demuestra eficacia causal. La frecuencia de brecha de caja del simulador se muestra separada de la probabilidad de atraso del modelo.

## Ejecución y trazabilidad

La migración `202611260004_event_analysis.sql` añade nueve tablas y referencias, con RLS, índices, checks, unicidad y protección de versiones inmutables. La migración 0005 añade períodos financieros y totales de planes en NUMERIC, además de los snapshots JSON. No se modifican las migraciones 0001–0003. El runner verifica sus checksums y aplica transacciones.

Una ejecución queda ligada a evento/revisión, snapshot de cartera, evaluación espacial, modelo, política, versión del motor, semilla y restricciones. Cambiar recursos crea otra ejecución; repetir las mismas entradas recupera la existente. La finalización guarda predicciones, plan y aviso en una sola transacción. Los reintentos usan lease y token de propiedad; no duplican la salida. Al tercer intento fallido se conserva el error visible.

El trabajo usa PostgreSQL; no incorpora Redis ni un servicio ML. Los cálculos corren en el mismo proceso Node y pueden bloquearlo brevemente; la integración local mide el flujo, sin acreditar latencia ni concurrencia productivas.

SENAMHI consulta cada 30 minutos por defecto, configurable. La revisión horaria del procesador asegura el corte sintético mensual y una tarea mensual CENEPRED. CENEPRED conserva revisión humana con evidencia hasta disponer de un mecanismo de detección verificable. No hay descarga automática de un paquete nuevo ni confirmación automática de que una publicación cambió.

## Cobertura de los puntos de mejora

| Punto del Word | Estado |
| --- | --- |
| 1. Predicción | Implementada y evaluada solo con datos sintéticos |
| 2. Impacto financiero | Pérdida de escenario y puente financiero implementados; provisiones reales fuera del alcance |
| 3. Alertas | Detección y preparación automáticas; notificación interna. Informe Gemini opcional bajo solicitud del coordinador |
| 4. Objetivo del optimizador | Reemplazado; incluye comparadores y desempate por alivio del cliente |
| 5. Facilidades | Dos propuestas sujetas a evaluación; derivación de ya deteriorados. No se preaprueban créditos |
| 6. Incertidumbre | 500 realizaciones pareadas por cliente, con componente regional compartido y percentiles |
| 7. Cartera enriquecida | Pagos, endeudamiento, sensibilidad y dos segmentos sintéticos |
| 8. Clima en la prioridad | Variables puntuales/distritales separadas, comparación sin clima e informe de factores |
| 9. Sesgos | Métricas de error/calibración por zona/segmento y cobertura de acciones; no certifica equidad real |
| 10. Otro evento | Pendiente: sequía, friaje y temperaturas extremas no se presentan como operativos |
| 11. Actualización | SENAMHI programado, cortes sintéticos mensuales y tarea/revisión CENEPRED; detección automática CENEPRED pendiente |
| 12. Demo y relato | Caso calculado con catálogo real, comparadores, tabla alternativa, límites, capturas y grabación de respaldo |

## Límites que siguen abiertos

No hay importador CSV/Parquet, cartera real, modelo institucional, Auth por usuario, fondeo de contingencia, core bancario, correo/WhatsApp, Supabase remoto verificado ni despliegue productivo. Los demás segmentos y eventos requieren datos y evaluación específicos. No se aplicó Saaty: los pesos del índice histórico siguen como hipótesis de referencia; no se atribuye una calibración que no se hizo.

Los avisos guardados mantienen la vigencia asumida por el conector (fecha +24 h), y la interpretación GRIDCODE sigue pendiente de confirmar. Un replay se marca expresamente. La pérdida histórica del 10% del Word no se utilizó como parámetro universal ni se afirmó haber verificado el expediente completo.

Validación ejecutada, cifras y limitaciones: [validation-report.md](validation-report.md). El protocolo del informe se prueba con un cliente Gemini controlado; no consume cuota ni acredita una llamada real al proveedor en esta refactorización.
