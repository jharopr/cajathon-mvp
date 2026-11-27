# ClimaShield AI orientado a decisiones

Implementación local del 27 de noviembre de 2026. Todo este desarrollo es previo a la fase presencial. Las adaptaciones que se acuerden durante esa fase deberán registrarse por separado. No se presume una política crediticia institucional.

## Problema y resultado operativo

La exposición territorial identifica dónde revisar. Para decidir cómo ayudar se necesita conocer la caja del negocio, el sostenimiento del hogar, las obligaciones totales y la capacidad de recuperación. El resultado es una ficha individual con puntuación desglosada, evidencia, alternativas admitidas o descartadas y un responsable humano. Los casos sin alternativa viable permanecen en una cola de revisión con plazo.

El flujo funcional es evento versionado → cruce espacial → capacidad de pago → modelo logístico → escenarios → criticidad operativa → controles de acción → optimización con recursos → revisión y seguimiento. El agente contextual explica la ficha y el plan mediante consultas de lectura.

## Datos y cobertura

La demostración cubre micro y pequeña empresa y lluvia/inundación. Ubicaciones, finanzas, pagos y perfiles son ficticios; las fuentes territoriales conservan procedencia y vigencia. CENEPRED requiere comprobación humana mensual y SENAMHI consulta periódica. Una reproducción histórica se identifica como tal.

| Parámetro | Uso actual | Procedencia |
| --- | --- | --- |
| Coordenadas, zona, peligro y nivel | Pertenencia al evento y susceptibilidad | Punto ficticio sobre capas oficiales o polígonos ficticios |
| Intensidad del evento | Estrés climático normalizado entre 0 y 1 | Instantánea de evento y supuesto de normalización |
| Ventas, costos fijos y ratio variable | Caja antes de obligaciones | Cartera sintética |
| Gastos del hogar | Capacidad disponible sin sacrificar sostenimiento | Perfil sintético v2, entre 6% y 14% de ventas; no estimación de hogares reales |
| Cuotas propias y obligaciones externas | Servicio total de deuda | Créditos ficticios agregados y obligaciones externas sintéticas |
| Reserva | Meses cubiertos de gastos esenciales | Cartera sintética |
| Pagos, cuotas vencidas y días de atraso | Historial y objetivo a 90 días | Generador v2, 24 períodos, sin pagos futuros en las variables |
| Entidades acreedoras y sector | Contexto y sensibilidad de actividad | Perfil sintético; cantidad de entidades no acredita sobreendeudamiento |
| Saldo e inventario | Impacto financiero e interrupción | Cartera sintética; saldo excluido del score operativo |

En un piloto futuro se necesitarían obligaciones externas declaradas/verificadas, gastos reales de hogar, estacionalidad, tendencia de ventas, dependencia de abastecimiento, seguros, garantías y cronogramas contractuales completos. No se inventan como campos observados. La dependencia de abastecimiento se genera como metadato exploratorio, pero **no entra todavía al modelo ni a las acciones**. No se afirma cubrir consumo, hipotecario o mediana empresa.

## Reglas espaciales

PostGIS usa `ST_Covers`: los bordes están incluidos. Sin coordenadas, el resultado es `UNKNOWN`. Los distritos y la coincidencia de coordenadas se verifican antes de inferir. El saldo se agrega una vez por negocio, aunque haya varios créditos o peligros.

El índice territorial anterior `100 × H × E × V × (1 − 0.5 × C)` se conserva como referencia histórica y explicativa. La puntuación operativa nueva utiliza amenaza puntual normalizada por nivel o contexto distrital de menor resolución, multiplicados por intensidad. Un aviso regional activa el evento; por sí solo no acredita afectación individual. No se interpreta una tasa poblacional como certeza de daño del local.

## Modelo de aprendizaje automático

Se entrena una regresión logística regularizada en TypeScript, versión `logistic-synthetic-2`, con artefacto independiente en `data/models/deterioration-v2.json`. La versión 1 se conserva intacta. La inferencia sigue:

`z = intercepto + Σ peso[j] × (variable[j] − media[j]) / escala[j]`

`p = 1 / (1 + exp(−z))`

Las doce variables son cuota/ventas, reserva/cuota, frecuencia de atrasos de doce meses, entidades, intensidad por amenaza puntual, intensidad por contexto distrital, sensibilidad sectorial, déficit de cobertura de deuda total, obligaciones totales/ventas, déficit de reserva mensual, fracción de cuota no pagada y máximo atraso reciente/30. Se limita el signo de los coeficientes para que aumentar presión climática/financiera no reduzca la señal, y más reserva no la aumente. No se incluye el nombre del distrito, atributos protegidos ni el saldo para asignar criticidad.

El objetivo es entrada en atraso mayor a 30 días dentro de los 90 días siguientes para clientes con atraso al corte ≤30 días. Los ya deteriorados se derivan; los datos incompletos no reciben una falsa certeza. Los cortes 6/10 entrenan, el 14 valida y 18/21 prueban; las ventanas se separan entre conjuntos. Hay evaluación adicional de clientes no vistos, calibración por intervalos y métricas por zona y segmento. Los cortes de un mismo cliente siguen relacionados; no se afirma independencia de todas las filas.

Las etiquetas se generan artificialmente. El generador incorpora presión de caja y pagos, pero no reproduce todas las vías de impacto real. Entrenamiento e inferencia usan contextos territoriales sintéticos/oficiales diferentes y requieren validación de traslado. Más variables no acreditan mayor precisión; las métricas ejecutadas se registran en el reporte de validación. No se reutilizan las métricas de la versión anterior para justificar la nueva.

## Capacidad y nueva puntuación

`Caja base antes de deuda = ventas × (1 − costo variable) − costo fijo − gasto del hogar`

`Servicio total = cuota propia agregada + obligaciones externas`

`DSCR base = caja base antes de deuda / servicio total`

`DSCR estrés = caja central en estrés antes de deuda y sin consumir reserva / servicio total`

`Reserva en meses = reserva / (costos fijos + gastos del hogar + servicio total)`

Los denominadores se protegen con un mínimo técnico de S/1; las cuotas no positivas y los datos incompletos se derivan. Los gastos y obligaciones adicionales son supuestos explícitos, no verificación de endeudamiento.

La prioridad operativa combina cinco componentes acotados entre 0 y 1:

| Componente | Peso | Normalización |
| --- | --- | --- |
| Amenaza y exposición | 20% | Intensidad × máximo entre susceptibilidad puntual y contexto distrital |
| Déficit de capacidad | 30% | acotar((1.30 − DSCR estrés) / 1.30) |
| Déficit de reserva | 15% | acotar(1 − meses de reserva) |
| Comportamiento | 15% | acotar(0.5 × frecuencia de atrasos + 0.5 × fracción de cuota no pagada) |
| Señal logística | 20% | Probabilidad experimental del modelo |

`Puntuación = 100 × suma de componentes ponderados`

Baja <30, media de 30 a <50, alta de 50 a <70 y crítica ≥70. Son umbrales de demo. La interfaz muestra puntos, pesos y fundamentos. Un flujo central negativo deriva a revisión urgente aunque la suma no alcance 70. Revisiones: 24 horas para ruta urgente/crítica, 48 para alta, 72 para media y 168 para baja. Son plazos propuestos, sin compromiso de atención real.

Este score **no es probabilidad de mora**. Sus componentes están correlacionados; los pesos son una política operativa transparente sin calibración estadística independiente. Sirve para ordenar revisión; no autoriza exclusión por zona, aprobación o denegación de crédito.

## Escenarios e impacto

Se conservan 500 realizaciones pareadas, semilla reproducible y un factor regional compartido. Se varían días de interrupción y daños. La liquidez incluye ventas bajo interrupción, margen variable, costos fijos, gastos del hogar, deuda total, daño y reserva. Se reportan percentiles 10/50/90 y frecuencia de brechas, sin denominarlos intervalos de confianza.

La severidad condicional v2 es `mínimo(0.65, 0.15 + 0.20 × señal territorial + 0.10 × máximo(0, 1 − meses de reserva))`. Es una hipótesis heterogénea de escenario, sin estimación de recuperaciones reales.

`Pérdida modelada = saldo × p experimental × severidad condicional`

Saldo expuesto, saldo ponderado por deterioro y pérdida modelada se presentan por separado. La pérdida no es provisión regulatoria ni estado financiero certificado. El calendario conserva la separación hipotética de 88% principal y 12% intereses; aún no sustituye cronogramas contractuales.

## Decisiones y protección del negocio

Se comparan evaluar dos cuotas diferidas, diagnóstico de liquidez y un plan de continuidad con protección de mercadería y revisión de abastecimiento. El diagnóstico solo no recibe un supuesto ahorro atribuible y queda fuera de la selección económica si no hay beneficio demostrable en el escenario. No se ofrecen nuevos desembolsos.

Una propuesta solo entra al optimizador si mejora la caja central del cliente, no empeora el percentil adverso ni la frecuencia de brechas y deja beneficio institucional neto positivo. El diferimiento exige DSCR base ≥1.10 y cuotas diferidas ≤20% del saldo. Los pagos se trasladan al final y se conserva el capital; esto no resuelve falta estructural de capacidad.

Se reduce a la mitad la eficacia hipotética del diferimiento y de las medidas de continuidad. La mejora de continuidad supone reducir 10% los días y 12.5% los daños (mitad de 20%/25%); el alivio de severidad es también un supuesto conservador y **no acredita causalidad**. Es necesario revisar eficacia con resultados observados antes de decidir económicamente.

`Valor neto = pérdida sin acción − pérdida con acción − costo operativo − costo financiero`

El costo financiero aproxima el valor temporal de las dos cuotas diferidas, con descuento mensual sintético de 1.5% y duración restante del calendario. No es una tasa contractual ni incorpora fondeo real, impuestos, capital, costo de oportunidad completo o impacto de depósitos. Se resta en el objetivo; no se vuelve a restar en el calendario nominal de cobros.

Se maximiza valor neto sujeto a una acción por negocio, presupuesto operativo, minutos, cobertura mínima alta y límite agregado de cuotas diferidas (S/5,000 por defecto). Los comparadores respetan la misma elegibilidad y restricciones. El límite de estados del optimizador permanece visible: con poda se informa factibilidad, sin certificar óptimo. Los clientes críticos, incompletos o ya deteriorados sin acción asignada conservan una cola de revisión; una falta de presupuesto no equivale a riesgo bajo.

El plan propone verificación del asesor, aprobación del coordinador, acuerdo del cliente y controles a 7/30 días. No ejecuta reprogramaciones, contactos ni operaciones financieras. El prototipo reduce decisiones inconsistentes con sus propios supuestos; no puede garantizar ausencia de riesgo o rentabilidad real.

## Agente Gemini contextual

Se elige un agente con llamadas a funciones desde NestJS. No hace falta un agente remoto con navegador, ejecución de código o SQL. Cada consulta recibe `analysis_id` y opcionalmente `client_id`, validados por el backend. Herramientas: evento, plan, hasta 20 clientes por prioridad y ficha de un cliente por código. El cliente fijado no puede cambiarse mediante una llamada de herramienta.

Gemini debe leer evento y plan; si hay cliente fijado también su ficha. Redacta situación, zona, puntuación con factores, alternativas admitidas/descartadas, beneficio, riesgo residual, responsable, plazo y seguimiento. No recalcula importes, aprueba, contacta o modifica parámetros. Se acotan preguntas, llamadas, iteraciones, tiempo y tamaño de evidencia. Se conservan las firmas/pasos del proveedor y se utiliza `store:false`.

`POST /api/v1/analyses/:id/consultations` exige credencial local, pregunta de 5–1200 caracteres y modo explícito `gemini` o `deterministic`. Cada respuesta se guarda con análisis, cliente, proveedor y traza. Una falla del proveedor es un error visible; no se presenta un resumen fijo como IA. Sin proveedor puede consultarse la ficha determinista, identificada como informe sin IA. La autenticación local sigue siendo de demo.

## Cambios de interfaz

Se conserva la paleta petróleo, verde y fondo frío del producto, tipografía del sistema y navegación por evento. La ficha usa puntuación y motivos como foco; el mapa queda bajo demanda. Filtros por criticidad, ratios de pago, alternativas y controles permiten decidir sin abrir el mapa. La consulta contextual está en la ficha y en el plan. La cola de revisión hace visibles los casos sin propuesta viable. En móvil se apilan las secciones y las tablas conservan un contenedor desplazable.

## Fundamento y límites de las referencias

Las referencias sustentan el enfoque de capacidad, escenarios y control; **no** respaldan los pesos, tasas o umbrales concretos de esta demo:

- [BIS sobre gestión de riesgo crediticio](https://www.bis.org/committees/bcbs/basel-consolidated-guidelines/module/cri/10): historia de pagos, capacidad actual y proyecciones bajo escenarios.
- [BIS sobre riesgo climático](https://www.bis.org/committees/bcbs/basel-consolidated-guidelines/module/rma/60): traducción del clima a crédito y liquidez, escenarios e incertidumbre metodológica.
- [CGAP sobre regulación y supervisión de microfinanzas](https://www.cgap.org/sites/default/files/researches/documents/Consensus-Guideline-A-Guide-to-Regulation-and-Supervision-of-Microfinance-Oct-2012_0.pdf): capacidad de pago y deuda total; varios préstamos no acreditan por sí solos sobreendeudamiento.
- [Gemini function calling](https://aistudio.google.com/docs/function-calling.md) e [Interactions](https://aistudio.google.com/docs/interactions-overview.md): herramientas ejecutadas por la aplicación y contexto sin almacenamiento del proveedor.

La validación institucional, cronogramas reales, eficacia de acciones, seguridad productiva, otros eventos/segmentos y Supabase remoto permanecen pendientes. Se registran las pruebas ejecutadas y las limitaciones del entorno en `docs/validation-report.md`.
