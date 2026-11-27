# ClimaShield AI

## Prevención climática por evento con revisión humana

**Concepto actualizado · 26 de noviembre de 2026 · prototipo local previo al presencial**

ClimaShield transforma avisos de SENAMHI y cartografía CENEPRED en una evaluación de cartera ficticia, un escenario financiero para la institución y un plan de propuestas revisables. La preparación repetitiva se automatiza; las decisiones permanecen en el coordinador y los analistas.

### Qué resuelve

Una alerta regional no identifica por sí sola quién podría deteriorarse, cuánto representa para la cartera ni qué acciones atender con presupuesto y minutos limitados. El flujo integra evento, resolución espacial, comportamiento de pagos, escenarios de caja y recursos operativos.

### Recorrido implementado

Aviso nuevo/revisado → evento con snapshot → job persistido → exposición → modelo experimental → impacto → plan → notificación interna → revisión → seguimiento registrado.

Se reutilizan NestJS/TypeScript, React/Vite y PostgreSQL/PostGIS. El modelo logístico entrena e infiere en TypeScript. Gemini explica evidencia del evento mediante herramientas limitadas; es opcional, no calcula ni aprueba. Un informe determinista está identificado como “sin IA”.

El 27/11 se implementó además el [MVP de acciones preventivas](docs/mvp-prevencion.md): hasta cinco recomendaciones bajo solicitud por análisis, para clientes de prioridad alta seleccionados en el plan. Cuando el plan no incluye prioridad alta, admite selección manual de otro cliente del plan con motivo. Tres protocolos JSON de demostración acotan los pasos; Gemini solo redacta instrucciones, con resultados guardados y respaldo identificado sin IA. Esta ampliación también es previa al presencial. Las plantillas por grupo y la generación masiva siguen propuestas.

### Demostración y datos

Cartera de 1,000 negocios y 1,001 créditos, completamente inventados. Se añaden 24 meses ficticios de pagos, perfiles de endeudamiento, segmentos micro/pequeña y sensibilidad sectorial. Los cortes son versionados y anteriores al evento. CENEPRED/SENAMHI son fuentes oficiales; una reproducción histórica se rotula y no se presenta como alerta actual.

El índice climático continúa siendo una referencia explicativa. Un modelo distinto estima entrada en atraso >30 días en 90 días para quienes no estaban ya deteriorados al corte. La evaluación temporal, los clientes no vistos, la calibración y los errores por grupo usan solo datos sintéticos. No acreditan rendimiento institucional.

### Impacto y decisión

Se distinguen saldo expuesto, saldo ponderado por deterioro, pérdida modelada y cobros de la institución. El calendario hipotético separa principal, intereses, costos, caja y margen; diferir cuotas no condona el capital. No se calculan provisiones regulatorias ni se utiliza como severidad universal el dato del 10% histórico citado en el documento de mejoras.

El optimizador busca reducción modelada de pérdida de cartera menos costo operativo, con presupuesto, minutos y cobertura mínima. Compara mayor saldo y sector/zona bajo recursos equivalentes. Propone evaluar reprogramación de cuotas o realizar una visita de liquidez; los casos ya deteriorados se derivan. Los efectos son supuestos, no eficacia causal ni facilidades preaprobadas.

Se simulan 500 realizaciones pareadas por cliente, con componente regional compartido. Percentiles y frecuencia de brecha de caja no son intervalos de confianza ni probabilidad de mora. La ficha del modelo y los supuestos quedan disponibles junto a la evidencia.

### Interfaz y control

Cinco vistas por evento: Eventos y alertas, Clientes, Impacto de cartera, Plan y seguimiento, Fuentes. La tabla y el detalle funcionan sin WebGL. Se retiran el chat abierto, la pantalla de arquitectura, el simulador libre y Open-Meteo.

Los eventos y versiones son inmutables. Un job admite recuperación mediante lease y reintentos; predicciones, plan y aviso se confirman de forma transaccional. Las intervenciones exigen revisión autenticada con la credencial local y guardan auditoría. No hay contactos externos ni ejecución de operaciones financieras.

### Alcance pendiente y condiciones de piloto

Faltan otros eventos/segmentos, validación con datos autorizados, eficacia de acciones, importación, Auth institucional, privilegios mínimos, core bancario, fondeo y conectores de comunicación. CENEPRED requiere revisión humana registrada; no se prometen actualizaciones automáticas de publicaciones sin un feed confirmado. Deben confirmarse leyenda GRIDCODE, vigencia SENAMHI y condiciones de uso. Supabase remoto no fue verificado.

No se atribuye como avance presencial nada ya construido: toda la base y esta refactorización del 26/11 son preexistentes. El alcance presencial se acordará con el Challenge Owner y se registrará con commits y evidencia nuevos. No se afirma haber recibido cartera, ejecutado un piloto, logrado ahorros reales o enviado la propuesta.

### Evidencia

[Arquitectura](docs/architecture.md), [cambios y cobertura](docs/refactor-implementation.md), [validación](docs/validation-report.md), [modelo versionado](data/models/deterioration-v1.json), [guion de demo](docs/demo-script.md) y [preexistentes](docs/preexisting-components.md).

El [concepto del 24/11](docs/archive/solution-concept-20261124.md) y su PDF son evidencia histórica. Las propuestas del documento de mejoras se tomaron como insumo: no se presentan sus ejemplos ilustrativos como resultados reales ni sus atribuciones al expediente como verificación primaria independiente.
