# ClimaShield AI

## Inteligencia climática que se convierte en prevención

**Solution Concept · Cajathon 2026 · 24 de noviembre de 2026**

**Propuesta para Caja Trujillo.** ClimaShield AI conecta la exposición territorial de los negocios financiados con su vulnerabilidad, su capacidad de sostener caja y las acciones preventivas que un equipo de asesores puede atender. El resultado es una cartera priorizada y un plan revisable, respaldado por evidencias.

### Problema abordado

Una alerta de lluvias no identifica por sí sola qué microempresarios podrían interrumpir ventas, perder inventario o enfrentar una brecha de liquidez. Cuando el presupuesto y las horas de atención son limitados, una lista de clientes expuestos tampoco indica cómo distribuir la prevención. La hipótesis de negocio es que unir información territorial, financiera y operativa permite actuar con mayor oportunidad y consistencia.

Los usuarios son el analista de riesgos, que examina la cartera; el coordinador, que revisa y aprueba el plan; y el asesor, que registra atención y resultado. El beneficiario final es el microempresario. Los flujos deberán validarse con Caja Trujillo: no se atribuyen procesos o deficiencias internas no confirmadas.

### Concepto de solución y diferenciador

El recorrido integra seis pasos: amenaza oficial → negocios expuestos → índice explicable → escenario de caja → asignación de recursos → aprobación y seguimiento. El mapa localiza; el simulador cuantifica escenarios; el optimizador ayuda a escoger acciones; Gemini consulta herramientas y explica la evidencia.

El diferencial está en vincular una señal climática con el impacto económico hipotético y una decisión operativa limitada por recursos. La IA no sustituye al motor financiero ni toma decisiones crediticias. Cada evaluación conserva fuentes, supuestos, versión, fecha y un snapshot reproducible.

### Alcance de esta entrega

MVP ejecutable con **clima real y cartera ficticia**: cartografía CENEPRED del escenario de lluvias nov 2026 – ene 2027 (susceptibilidad a inundación y movimientos en masa, riesgo de 12 distritos de Trujillo) y avisos SENAMHI vigentes, cruzados con 1,000 negocios inventados que simulan una Caja. Cada fuente muestra publicación, vigencia y última consulta. No utiliza cartera real, no acredita predicción de mora y no está preparada para producción. El PDF, la maqueta funcional y el diagrama son complementos; el formato de presentación deberá confirmarse con la organización.

<!-- pagebreak -->

## Funcionamiento y arquitectura tecnológica

### Arquitectura de seis capas

| Capa | Componentes y responsabilidad |
| --- | --- |
| Fuentes | CENEPRED/SIGRID (SHAPE 102, recorte versionado con checksum) y avisos SENAMHI vía WFS. Open-Meteo como contexto. Cartera ficticia y escenario sintético de referencia. |
| Integración y datos | NestJS, Zod, lector shapefile propio, PostgreSQL/PostGIS en Docker; destino Supabase por .env. Migraciones SQL versionadas. |
| Inteligencia climática | ST_Covers contra zonas y distritos oficiales, vulnerabilidad individual, control de ubicación e índice experimental explicable. |
| Inteligencia financiera | Simulación mensual con Decimal y optimización bajo presupuesto, minutos y cobertura mínima. |
| Asistente IA | Gemini con herramientas, evidencias y límites; fallback determinista identificado. |
| Aplicaciones | React, MapLibre y API REST: riesgo, negocios, simulador, intervenciones y asistente. |

La supervisión humana, la auditoría y la trazabilidad atraviesan las capas. El backend guarda montos NUMERIC, geometrías WGS84 y fechas con zona horaria. El esquema privado climashield evita acceso directo desde React. La demo usa credencial de coordinador; la autenticación institucional es futura.

### Detección explicable

**R = 100 × H × E × V × (1 − 0.5 × C)**. H combina la intensidad del escenario con el nivel de susceptibilidad CENEPRED; E vale 1 si el punto está dentro de la zona o, si no hay zona puntual, la proporción oficial de población expuesta del distrito (con factor 0.8 por menor resolución). V y C son vulnerabilidad y adaptación. Hipótesis versionadas, no calibradas. Alta ≥ 65; media 30–64.99; baja < 30. Sin ubicación, UNKNOWN. Un aviso SENAMHI vigente activa seguimiento, pero no altera el índice.

Se incluyen puntos en borde. En superposiciones se conserva evidencia y se usa el máximo índice por negocio; el saldo se suma una sola vez. **Exposición, pérdida y probabilidad de incumplimiento son conceptos distintos.**

### Asistencia con evidencia

Gemini consulta fuentes y vigencias, avisos, expuestos, riesgo, simulación y optimización. NestJS calcula; el modelo explica. Las herramientas no aprueban ni contactan. Ejecución real verificada el 24/11 con evaluación oficial; sin clave se muestra un resumen local rotulado sin IA.

<!-- pagebreak -->

## Caso representativo e impacto esperado

### Bodega Horizonte: del mapa a la prevención

Negocio ficticio CS-0001. PostGIS confirma que su coordenada está en el distrito oficial El Porvenir, con riesgo de inundación alto y 100 % de población expuesta según CENEPRED, y dentro del aviso SENAMHI vigente. H = 0.9 × 0.75 × 0.8 = 0.54, E = 1, V = 0.9 y C = 0.2 producen **R = 43.74**, prioridad media; en el escenario sintético de estrés, R = 72.9. Saldo S/24,000; no se interpreta como pérdida.

Supuestos mensuales: ventas S/12,000; costos fijos S/8,000; costo variable 0%; cuota S/1,500; liquidez inicial cero; interrupción 10 días; daño S/1,200. Una intervención hipotética de S/200 reduce 40% de días y daño.

| Resultado del escenario | Importe |
| --- | --- |
| Flujo normal | S/2,500 |
| Flujo con evento | −S/2,700 |
| Flujo con prevención, incluido su costo | −S/820 |
| Beneficio bruto hipotético | S/2,080 |
| Beneficio neto hipotético | S/1,880 |

Queda una brecha de S/820 que requiere revisión. No se concluye que una llamada genere este beneficio: la eficacia es un supuesto por validar.

### Valor para Caja Trujillo y sus clientes

Para la Caja: priorización trazable sobre fuentes oficiales, detección de coordenadas mal geocodificadas (158 en la cartera ficticia), comparación de acciones y mejor uso de capacidad preventiva. Para el microempresario: atención oportuna, escenarios de caja y acompañamiento para continuidad, sujeto a medidas seguras y autorizadas.

### Medición del impacto

| Indicador propuesto | Medición / validación |
| --- | --- |
| Cobertura preventiva | Prioritarios atendidos / prioritarios expuestos. Separar borradores, aprobados y completados. |
| Oportunidad | Tiempo de aviso a aprobación y primera atención. Línea base pendiente con la Caja. |
| Eficiencia | Beneficio modelado por minuto/sol frente a FIFO con recursos y elegibilidad equivalentes. |
| Calidad y trazabilidad | Datos completos y evaluaciones con fuente, versión y supuestos. |
| Resultado de piloto | Continuidad y liquidez observadas; establecer comparación antes de atribuir causalidad. |

KPI institucional y línea base por acordar. No se promete reducción de mora ni ahorro real a partir de una cartera ficticia.

<!-- pagebreak -->

## Viabilidad y tecnología preexistente

### Base técnica y recursos

Monolito modular con Node.js y PostgreSQL/PostGIS. Un equipo de hasta cuatro integrantes puede dividir interfaz, datos, motores y validación. La demo funciona sin IA ni pronóstico externo; mantiene vectores si fallan las teselas del mapa.

Supabase usa las mismas migraciones cambiando conexión y TLS en .env. Requiere credenciales propias y permisos PostGIS. La integración remota está preparada, pero no verificada contra un proyecto del equipo.

CENEPRED y SENAMHI ya están integrados y probados; falta confirmar la leyenda GRIDCODE, las condiciones de uso y la vigencia oficial de los avisos (hoy se asume 24 h). El paquete de 1.25 GB no se descarga a diario: se compara checksum y se reprocesa solo si cambia. No hay entrega de datos de Caja Trujillo confirmada. Gemini depende de clave, cuota y proveedor autorizado.

### Preexistentes al 24/11/2026

| Componente | Titularidad / condición |
| --- | --- |
| Código actual ClimaShield | Preparado en este repositorio antes del presencial. Base previa, no avance presencial. Titularidad a formalizar por el equipo. |
| React, NestJS, Vite, Zod, Decimal.js y pg | Software de terceros con licencias distribuidas y versiones en lockfile; se reutiliza sin reivindicar autoría. |
| PostgreSQL, PostGIS, MapLibre y mapa base | Software/cartografía de terceros; conservar condiciones y atribuciones. Revisar distribución y licencia Docker Desktop. |
| Gemini / SDK Google | Servicio y SDK de terceros; acceso, cuota y términos. La clave no integra los entregables. |
| CENEPRED, SENAMHI, Supabase | Datos públicos y plataformas de terceros; se versiona solo un recorte derivado con manifiesto. Atribución, condiciones y costos por confirmar para piloto. |
| Habilidades de desarrollo | Instrucciones .agents/skills agregadas por el usuario; apoyo al desarrollo, no agentes autónomos del producto. |

Declaración ampliada en docs/preexisting-components.md. Conservar un commit/etiqueta de corte y registrar cambios del presencial. Al inicio el repositorio tenía solo README; todo el MVP actual, incluida la integración CENEPRED/SENAMHI, se preparó antes de esas jornadas. No se atribuye como novedad futura lo ya implementado.

<!-- pagebreak -->

## Funcionalidad crítica nueva y plan presencial

### Adaptación sustantiva propuesta

**Pasar de la evaluación con fuentes oficiales a la prevención por evento validada con el Challenge Owner.** Convertir un aviso SENAMHI vigente en un evento operativo, aplicar políticas acordadas y comparar el plan con las atenciones y sus resultados.

Nuevo alcance: evento seleccionable con el aviso que lo originó; reevaluación y plan por evento; pesos, catálogo y costos versionados con la Caja; reporte de cobertura y tiempos; importación validada de una cartera autorizada o anonimizada. Hoy existen los conectores y el modo oficial, pero no el evento operativo, esas políticas ni ese reporte.

### Dos jornadas

| Momento | Desarrollo nuevo / evidencia |
| --- | --- |
| Día 1, inicio | Acordar KPI, acciones seguras, datos y criterios. Registrar baseline y commit inicial. |
| Día 1, construcción | Evento operativo desde avisos vigentes; recálculo con política versionada; importación validada de cartera de prueba. |
| Día 2, construcción | Plan por evento, seguimiento y comparación de cobertura/tiempos. Con credenciales/autorización, probar Supabase remoto y Gemini con cuota institucional. |
| Día 2, validación | Caso integral con Challenge Owner; pruebas y evidencias de commits, resultados y límites. |

Si no hay aviso vigente en Trujillo durante el presencial, se reproducirá la última instantánea SENAMHI rotulada como vencida. Ratificar prioridades con mentor y Challenge Owner.

### Resultado esperado

Aviso oficial → evento → evaluación → simulación → plan limitado por recursos → aprobación → atención registrada → comparación operativa. Fuentes, supuestos y versiones visibles. Seguirá requiriendo calibración y cartera autorizada antes de un piloto real.

### Dependencias y cierre de propuesta

Confirmar formato/canal de entrega, datos permitidos, KPI y línea base, capacidad, costos/eficacia de acciones, proveedor IA y propiedad intelectual. La entrega conceptual no depende de una integración productiva.

Referencia: [bases oficiales](https://cajathon.cajatrujillo.com.pe/bases/), consultadas el 24/11/2026. Conceptos hasta 24/11; evaluación 25–29/11; presencial 3–4/12. Hora exacta y cambios por verificar en canales oficiales.

Evidencias: README, migraciones, arquitectura, metodología, dataset, aplicación y reporte de pruebas. Esta preparación no acredita envío ni aceptación por la organización.
