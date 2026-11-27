# Reporte de validación

La validación vigente es la **integración de decisión v2 con el MVP preventivo del 27/11/2026**, documentada al final, con PostgreSQL/PostGIS real. Las ejecuciones previas se conservan como evidencia histórica; sus limitaciones de entorno corresponden a cada ejecución, no al merge ya verificado.

Ejecutado **24/11/2026, America/Lima** (21:00–22:00) en Windows, Node 24.13.0 y Docker Desktop. PostgreSQL 16/PostGIS 3.4 local, imágenes reconstruidas para API NestJS y frontend React/Nginx. Cartera ficticia seed 42: 1000 negocios y 1001 créditos. Amenazas: cartografía CENEPRED (SHAPE 102) y avisos SENAMHI reales, más el escenario sintético de referencia. No se usó cartera real.

## Comandos y resultados observados

| Comando / comprobación | Resultado |
| --- | --- |
| npm run db:migrate | 202611240003_official_sources.sql aplicada sobre la base existente; 0001/0002 verificadas por checksum, sin cambios |
| npm run data:cenepred (zip 1.25 GB) | 5.2 s. Leídos 6 registros de inundación y 8 de movimientos en masa de La Libertad que cruzan el área, y 12 distritos de Trujillo. Salida: 3,484 polígonos válidos (1.56 MB) y 12 distritos (46 KB) |
| npm run data:senamhi | WFS HTTP 200, 21:32 Lima. view_aviso24h: 2 avisos cruzan el recuadro, 1 interseca el área real (Nivel 1, 24/11); activación de quebradas: vacío |
| npm run db:seed (dos veces) | Primera: CENEPRED cargado. Segunda: "sin cambios (checksum igual)"; cartera existente no se sobrescribe |
| npm test | 12 pruebas unitarias aprobadas (3 nuevas: lector shapefile, vigencia/frescura SENAMHI, validación y estados del conector) |
| npm run build | NestJS y React compilan |
| npm run test:integration | 10 subpruebas aprobadas (11 tests con el contenedor padre), incluidas 3 nuevas de cartografía oficial |
| docker compose --profile full up -d --build --wait | db, api y web reconstruidos y saludables; la imagen API incluye data/official |
| npm run test:e2e sobre los contenedores | 2 aprobadas: recorrido completo con franja de procedencia, pestaña Fuentes y cambio a modo Sintética; móvil sin teselas |
| Gemini real, evaluación oficial | Modo gemini, gemini-3.5-flash-lite; herramientas get_data_sources, get_climate_alerts y get_exposed_businesses; cifras y vigencias coincidentes. Evidencia sin secretos: artifacts/diagnostics/gemini-agent-official.json |
| npm audit --omit=dev | 0 vulnerabilidades |
| git check-ignore | .env y data/raw/ excluidos |

Las pruebas de integración crean evaluaciones, planes e intervenciones en la base local y revierten las escrituras SENAMHI de prueba. El workflow CI no se ejecutó en GitHub en esta sesión; no requiere red porque el seed usa data/official.

## Evidencia numérica

Salida en [demo-results.json](../artifacts/demo-results.json) (timestamp UTC).

| Evaluación severa | Oficial (CENEPRED + SENAMHI) | Sintética (referencia) |
| --- | --- | --- |
| Total / sin ubicación | 1000 / 1 | 1000 / 1 |
| Expuestos únicos | 719 (713 inundación, 73 mov. en masa) | 591 |
| Dentro de zona de susceptibilidad media+ | 86 | — |
| Prioridad alta | 22 | 145 |
| Bajo aviso SENAMHI vigente | 978 (bandera, no exposición) | — |
| Ubicación a revisar | 158 (27 fuera de límites oficiales, resto distrito distinto) | — |
| Saldo expuesto deduplicado | S/20,070,200.00 | S/16,740,600.00 |
| Tiempo del motor | ≈230–265 ms | ≈180–230 ms |

CS-0001 oficial: distrito El Porvenir (coincide con el declarado), riesgo distrital de inundación alto con 100 % de población expuesta → R = 43.74, media. CS-0001 sintético: R = 72.9, alta. Simulación sin cambios: 2500 / −2700 / −820; bruto 2080, neto 1880.

Plan con S/1500, 480 minutos y alta mínima 2: sintético OPTIMAL, 33 negocios, S/1500, 470 min, beneficio modelado S/60,596.02 vs FIFO S/25,444.76; oficial OPTIMAL, 33 negocios, S/1500, 470 min, S/60,970.76 vs FIFO S/26,583.81, 2,154 candidatos.

Estas cifras no acreditan ahorro real, eficacia causal, predicción de mora ni desempeño productivo. El índice usa clima real sobre una cartera inventada.

## Casos comprobados

- Lector shapefile: índice .shx, DBF UTF-8, filtro de anillos por recuadro, registros nulos y archivos inválidos.
- Ingesta: reconstrucción de huecos (ST_BuildArea), recorte, simplificación y descarte de fragmentos < 50 m²; todas las geometrías ST_IsValid; 12 UBIGEO únicos.
- Carga idempotente por checksum; versión `cenepred-102@<sha>` visible en Fuentes y en cada evaluación.
- SENAMHI: esquema validado con Zod; geometrías fuera del área y entradas inválidas descartadas; vacío distinto de caída; ante caída se conservan avisos previos y la fuente queda "no disponible"; recorte al área verificado.
- Refresco SENAMHI sin credencial rechazado (403); límite de 1 consulta/minuto.
- Evaluación oficial: E=1 en zona puntual, E∈[0,1] en respaldo distrital, avisos sin score, UNKNOWN sin coordenadas, saldo deduplicado, hazard_source y versiones guardadas, parámetros inválidos 422.
- Se mantienen todos los casos previos: borde incluido, geometría inválida rechazada, simulación exacta, optimizador, borradores idempotentes, autorización, auditoría y fallback sin IA.

## Hallazgos durante la integración

- La susceptibilidad puntual cubre ~82 km² de 987 km² del recorte; sin respaldo distrital casi toda la cartera urbana quedaba en 0. Se añadió la regla distrital documentada en la metodología.
- El aviso SENAMHI Nivel 1 es regional y cubre 978 negocios: tratarlo como exposición inflaba el indicador; se separó como bandera.
- El primer conteo por peligro contaba cualquier evaluación del tipo (719/719); se corrigió con una única función de exposición y se cubrió en pruebas.
- La primera persistencia SENAMHI fallaba por clave foránea (zona antes que fuente); se reordenó.
- La capa view_aviso24h describe activación de quebradas: se muestra el texto oficial sin reinterpretarlo.

## Límites y pendientes

- Leyenda GRIDCODE 1–5 asumida; confirmar con CENEPRED. Condiciones de uso y redistribución de ambas fuentes por revisar.
- La vigencia SENAMHI (fecha + 24 h) es un supuesto; la instantánea versionada vence y entonces se muestra como vencida.
- Pesos de susceptibilidad, factor distrital 0.8 y umbrales son hipótesis sin calibración. La cartera y su vulnerabilidad son ficticias.
- La versión CENEPRED no se comprueba automáticamente; el refresco SENAMHI programado existe pero está desactivado por defecto.
- Sin proyecto Supabase remoto; migraciones probadas solo en PostGIS local.
- Bundle MapLibre ~1.1 MB con carga diferida; la capa oficial pesa ~2.2 MB JSON en la primera evaluación.
- La credencial de coordinador es un control local; faltan autenticación institucional y permisos por usuario.
- No se hizo push, despliegue público ni envío a la organización.

Capturas: [escritorio](mockup-desktop.png), [fuentes](mockup-sources.png), [móvil sin teselas](mockup-mobile.png).

## Anexo: revisión documental del 26/11/2026

Se añadió [el plan de refactorización según los puntos de mejora](plan-refactorizacion-puntos-mejora.md), contrastando el Word del usuario con el concepto, la arquitectura, el historial Git y el código actual. Es una propuesta; no se implementaron predicción, eventos, alertas ni eliminaciones de funcionalidad. Todos los componentes actuales siguen declarados previos al presencial.

| Comando / comprobación | Resultado observado en esta sesión |
| --- | --- |
| `npm test` | 12 pruebas aprobadas; 0 fallos |
| `npm run build` | API NestJS y frontend React/Vite compilan; Vite advierte sobre el chunk de MapLibre de aproximadamente 1.10 MB antes de gzip |
| `docker compose ps --format json` | No pudo conectar al motor Linux de Docker Desktop; named pipe no disponible |
| Conexión a PostgreSQL configurado, `SELECT` de disponibilidad | Conexión rechazada: `ECONNREFUSED`; no se imprimieron credenciales ni se cambió la configuración |
| `npm run test:integration` | No ejecutado: PostgreSQL no disponible |
| `npm run test:e2e` | No ejecutado: requiere API con PostgreSQL disponible |

Los resultados del 24/11 de las secciones anteriores se conservan como evidencia histórica, no como ejecuciones repetidas hoy. Las pruebas y el build de este anexo validan la base existente; no validan capacidades descritas como futuras en el plan. No se ejecutaron migraciones, seed, reset, llamadas reales a Gemini ni despliegues.

## Refactorización implementada y validada: 26/11/2026

Base previa: `cd9303d`. Trabajo local del 26/11, antes del presencial. El Word de mejoras se usó como insumo y se implementó el alcance recortado del [plan](plan-refactorizacion-puntos-mejora.md). Se preservan los documentos previos en `docs/archive/` y las evidencias del 24/11; no se reinterpretan como resultados del nuevo motor.

Docker Desktop se inició de forma local y PostgreSQL/PostGIS quedó disponible. La limitación de conexión descrita en el anexo documental anterior quedó resuelta para estas pruebas. No se modificaron secretos ni las migraciones ya aplicadas; no hubo reset ni borrado de cartera.

| Comando / comprobación | Resultado observado |
| --- | --- |
| `npm run db:migrate` | 0001–0003 verificadas por checksum; 0004 y 0005 aplicadas como migraciones nuevas; reejecución idempotente |
| `npm run db:seed` | Conserva 1,000 negocios y 1,001 créditos; CENEPRED sin cambios por checksum; snapshot SENAMHI anterior conservado |
| `npm run model:train` | Modelo logístico TS reproducible, artefacto versionado; sin Python ni cuota de IA |
| `npm test` | **23 aprobadas, 0 fallos**: incluye temporalidad, corte mensual Lima, centavos BigInt, escenarios pareados, objetivo de cartera, identidad de aviso, activación automática y protocolo Gemini controlado |
| `npm run build` | API NestJS y frontend React/Vite compilan. Se repitió `build:web` tras los últimos ajustes de etiquetas y métricas |
| `npm run test:integration` | **11 aprobadas, 0 fallos** (10 subpruebas + contenedor padre), PostgreSQL/PostGIS reales; aproximadamente 27 s |
| `npm run test:e2e` | **3 aprobadas, 0 fallos**, ejecución final ≈17 s: recorrido completo y apertura de plan desde alerta, reutilización de análisis con restricciones, móvil sin WebGL y mapa sin teselas |
| `git diff --check` | Sin errores de whitespace; avisos de normalización LF/CRLF de Git en Windows |
| Migraciones antiguas / `.env` | Sin diff en 0001–0003; `.env` continúa excluido de Git |

### Casos comprobados en integración

- Inmutabilidad de eventos/modelos, evento de replay identificado y geometría recuperable. Las rutas del chat abierto y Open-Meteo ya no existen.
- 24 períodos por cada uno de 1,001 créditos: **24,024 filas por snapshot**. El seed no reescribe la cartera.
- Un análisis/job para las mismas entradas; validación de restricciones y rechazo sin credencial.
- Predicciones, plan y notificación guardados en una transacción, con unicidad e importes financieros NUMERIC conciliados contra la evidencia JSON.
- Recuperación de un lease vencido y finalización sin duplicar plan/notificación. Tras el tercer intento interrumpido, estado FAILED; reintento explícito autenticado y recuperación comprobados.
- Borradores idempotentes, aprobación autorizada, transición inválida rechazada y auditoría registrada. Ninguna aprobación automática o contacto externo.
- Se conserva la referencia espacial de 591 expuestos sintéticos, punto en borde incluido, UNKNOWN sin ubicación y saldo sin duplicación con varios créditos/peligros.

### Ejecución del nuevo motor

Salida: [event-results.json](../artifacts/event-results.json). Evento reproducido de SENAMHI del 24/11, intensidad de demo 0.45, cartera ficticia y corte anterior al evento. No es aviso vigente ni cartera real.

| Magnitud | Resultado de referencia |
| --- | --- |
| Cartera total | 1,000 negocios, 1,001 créditos |
| Clientes con predicción experimental | 777 |
| Datos/geocodificación por revisar | 159 |
| Ya deteriorados, derivados | 63 |
| Sin ubicación | 1 |
| Expuestos espaciales únicos | 719 |
| Saldo expuesto deduplicado | S/20,070,200.00; no es pérdida |
| Saldo ponderado por deterioro | S/3,424,559.05; no es pérdida |
| Pérdida modelada sin plan | S/856,139.86 |
| Pérdida modelada con plan | S/844,906.79 |
| Reducción bruta / neta modelada | S/11,233.07 / S/9,753.07 |
| Plan | 13 propuestas: 1 evaluación de reprogramación, 12 visitas de liquidez |
| Recursos usados | S/1,480.00 de S/1,500 y 375 de 480 minutos; mínimo de alta 0 |
| Comparación mayor saldo / sector-zona | Beneficio neto de escenario S/3,630.12 / S/4,972.07, mismos recursos y elegibilidad |
| Estado del solver | OPTIMAL para esta ejecución; otras restricciones pueden activar poda y perder certificación |

Bodega Horizonte: índice territorial de referencia **21.87**, distinto del 43.74 del escenario severo histórico; se usó la intensidad del aviso reproducido. Probabilidad experimental **16.46%**, pérdida de escenario **S/987.76**. No se reutilizaron las cifras ilustrativas 68% o S/480,000 del Word.

### Modelo: métricas sintéticas reales

Artefacto: [deterioration-v1.json](../data/models/deterioration-v1.json). Regresión logística regularizada y normalización exportada. Hash `d055e7bb83775206925213bcb7d8b38b976ed10510f139194ede74c3451c4c60`.

| Evaluación | N | ROC-AUC | PR-AUC | Brier |
| --- | --- | --- | --- | --- |
| Entrenamiento | 1,464 | 0.6963 | 0.5388 | 0.1556 |
| Validación temporal | 693 | 0.7432 | 0.5423 | 0.1312 |
| Prueba temporal | 1,398 | 0.6065 | 0.3853 | 0.1533 |
| Clientes no vistos | 191 | 0.6164 | 0.4258 | 0.1324 |
| Tasa base, misma prueba | 1,398 | 0.5000 | 0.2017 | 0.1620 |
| Sin variables climáticas, misma prueba | 1,398 | 0.5963 | 0.2949 | 0.1596 |

Con umbral 0.35 en prueba: precisión 0.4167 y recall 0.2837. El umbral de prioridad operativa alta de demo es 0.45 y se declara por separado. Se publican bins de calibración y métricas por zona/segmento con sus tamaños. Estos resultados muestran discriminación modesta y calibración imperfecta incluso en datos ficticios; no acreditan predicción institucional ni ausencia de sesgos reales. Las ventanas de prueba de un mismo cliente están relacionadas; se incluye evaluación adicional con clientes no vistos y no se afirma independencia de todas las filas.

### Limitaciones vigentes

- Modelo, historia, política, costos, severidad 25% y efecto de facilidades son sintéticos. El 10% histórico citado en el Word no se usa como severidad universal.
- Calendario financiero hipotético con principal 88% e interés 12% de cuota por período; no representa un contrato o tasa real. Pérdida de escenario no es provisión regulatoria ni estados financieros certificados.
- El simulador reporta percentiles y frecuencia de brecha; no intervalos de confianza del modelo ni efecto causal de una acción.
- No se validó una nueva emisión SENAMHI en vivo en estas pruebas; usan snapshot y cliente WFS controlado. CENEPRED requiere revisión humana registrada; falta confirmar GRIDCODE, vigencia SENAMHI y condiciones de uso.
- El procesador comparte el proceso Node: los cálculos completos observados tardaron aproximadamente 7–8 s y pueden bloquear temporalmente HTTP. No se acredita capacidad productiva.
- MapLibre conserva chunk de aproximadamente 1.10 MB antes de gzip; se carga al abrir el mapa. El JS principal bajó aproximadamente de 266.69 KB a 234.76 KB antes de gzip, sin medir rendimiento de usuario final.
- Sin segundo evento, otros segmentos validados, importador, cartera real, fondeo de contingencia, Auth institucional, core, contactos externos ni Supabase remoto comprobado.
- Gemini se probó con un cliente controlado y límites/herramientas; no se realizó una nueva llamada real al proveedor, ni consumo de cuota, durante esta refactorización.
- El workflow de GitHub se conserva pero no se ejecutó remotamente. No hubo push, despliegue, envío al organizador ni aprobación crediticia real.

Todos los componentes añadidos el 26/11 son **previos al presencial**, como se registra en [preexisting-components.md](preexisting-components.md).

### Evidencias visuales y respaldo

Se inspeccionaron las capturas de escritorio, impacto, revisión del plan y móvil de la última ejecución. El recorrido verifica la ausencia de errores de página, la apertura del análisis correcto desde una alerta y la conservación de la restricción elegida al reutilizar una ejecución anterior. Móvil probado a 375 px, escritorio a 1440 px e intermedio a 768 px; la tabla y el detalle siguen disponibles sin WebGL/teselas y no hay desbordamiento horizontal del documento en esos casos.

Capturas de esta versión: [eventos](mockup-events.png), [impacto](mockup-event-impact.png) y [móvil sin WebGL](mockup-event-mobile.png). Grabación del recorrido: [demo reproducida](../artifacts/ClimaShield_event_demo.webm). El video contiene una demo con cartera ficticia, sin contacto externo ni llamada real a Gemini. No sustituye la validación de un aviso en vivo o de un piloto institucional.

### Arranque de desarrollo comprobado posteriormente, 26/11/2026

Se corrigió `dev:api` a `tsx watch --tsconfig tsconfig.api.json apps/api/src/main.ts`: el orden anterior interpretaba `watch` como archivo e impedía iniciar `npm run dev`. Web y API quedaron activos localmente; ambos respondieron HTTP 200 en `http://127.0.0.1:5180` y `http://127.0.0.1:8081/api/v1/health`. PostgreSQL sigue en Docker, puerto local 54322.

Se repitieron unitarias (23 aprobadas), build (correcto), integración (11 aprobadas, aproximadamente 20 s) y navegador reutilizando los servidores de desarrollo (3 aprobadas, aproximadamente 11 s). La primera repetición de integración detectó una suposición incorrecta del fixture de fallo: exigía cero notificaciones incluso para un análisis ya ejecutado anteriormente. Se corrigió para comprobar que no aumente el conteo y para esperar la recuperación del job cuando hay otro procesador activo. La ejecución posterior pasó; no se cambiaron resultados financieros ni reglas del producto por ese ajuste de pruebas.

### Propuesta documental de redacción preventiva, 26/11/2026

Se añadió [la propuesta de protocolos y plantillas reutilizables](propuesta-redaccion-preventiva.md), enlazada desde README y arquitectura. Este cambio solo documenta la ampliación: no añade módulos, tablas, endpoints, generación por cliente ni consumo real de Gemini. La propuesta distingue la base ya implementada de los componentes nuevos pendientes y define un benchmark futuro con casos sintéticos.

Comprobaciones repetidas sobre la aplicación actual: `npm test`, **23 aprobadas**; `npm run build`, **correcto**, con el aviso existente de tamaño del chunk MapLibre; `npm run test:integration`, **11 aprobadas** con PostgreSQL/PostGIS local, aproximadamente 28 s incluyendo arranque; `npm run test:e2e`, **3 aprobadas**, aproximadamente 13 s. No se realizaron llamadas reales a Gemini. Estos resultados verifican la aplicación existente, no la implementación ni el rendimiento de la arquitectura propuesta. No se midieron costos de generación o capacidad para cientos de miles de clientes.

## MVP de acciones preventivas implementado, 27/11/2026

Alcance: [descripción y caso de uso](mvp-prevencion.md). Tres protocolos demo, preparación autenticada desde Clientes, selección individual conservada, máximo de cinco reservas por análisis, uso mínimo de Gemini y resultados guardados. Adaptación posterior al corte del 26/11, también previa al presencial. Migración 0006 aplicada localmente; las cinco anteriores conservaron checksum y contenido. `.env` sigue excluido y sin cambios.

| Comprobación final | Resultado observado |
| --- | --- |
| `npm test` | 28 aprobadas, 0 fallidas |
| `npm run build` | API y web correctos; persiste el aviso previo del chunk MapLibre de aproximadamente 1.10 MB |
| `npm run test:integration` | 15 aprobadas, 0 fallidas, aproximadamente 17 s con PostgreSQL/PostGIS real |
| `npm run test:e2e` | 4 aprobadas, 0 fallidas, aproximadamente 29 s |
| Migraciones y credenciales | 0006 aditiva aplicada; 0001–0005 sin diff; `.env` ignorado; ningún secreto en los artefactos nuevos |
| Arranque local | `npm run dev`; web 5180 y API 8081 disponibles; PostgreSQL Docker healthy |

Se probaron selección por prioridad/plan, excepción manual con motivo, rechazo por datos/ubicación/derivación, vigencia LIVE, catálogo por acción, cambios de hash y validación estructural de redacción. La integración comprueba seis solicitudes concurrentes con solo cinco reservas, reutilización aun con el límite alcanzado, resultado final inmutable, auditoría y ausencia de intervenciones/contactos automáticos. También verifica respaldo sin clave, uso del cliente controlado, límite diario e intervalo local persistentes y recuperación de solicitud interrumpida sin repetir llamada.

El nuevo e2e usa una copia sintética del análisis con fecha de fixture y selección de ese análisis solo dentro del navegador de prueba. Prepara expresamente un protocolo sin IA; comprueba cuatro pasos, revisión pendiente, persistencia al recargar y ausencia de POST adicional, además de ancho móvil de 375 px. No consume cupos del plan activo. Se inspeccionaron las capturas de escritorio y móvil. La primera ejecución del nuevo caso falló porque el selector apuntaba a la sección «Evento seleccionado» en vez de a su select; se corrigió el localizador. El caso aislado y la suite completa posterior pasaron.

### Una llamada real al proveedor

Con el servidor ya iniciado se solicitó una sola recomendación para **CS-0810, Agricultura demo 0810**, cliente sintético seleccionado con prioridad alta. El endpoint devolvió modo **gemini**, cuatro pasos validados y una de cinco reservas utilizadas. Modelo reportado: `gemini-3.5-flash-lite`; uso reportado: **495 tokens de entrada, 178 de salida, 673 totales**, sin tokens de pensamiento reportados. No se realizaron reintentos. [Evidencia guardada](../artifacts/prevention-smoke.json).

La ficha se volvió a consultar en un navegador real: mostró Gemini y los cuatro pasos guardados con **cero POST** durante esa consulta. [Captura Gemini](mockup-prevention-gemini.png), [protocolo sin IA en escritorio](mockup-prevention.png) y [móvil](mockup-prevention-mobile.png). Estas últimas dos son del fixture de pruebas.

Esta llamada confirma el funcionamiento observado con la clave/configuración existente; no confirma una cuota garantizada, factura cero, calidad general ni beneficio frente al texto determinista. En esta muestra el proveedor conservó las instrucciones del protocolo. Los protocolos, la cartera, prioridades y cálculos son sintéticos. No se incorporaron plantillas por grupos, lotes masivos, worker nuevo, edición/aprobación textual ni el benchmark de 100 casos. La revisión humana se señala en la guía; las aprobaciones financieras conservan su flujo independiente. Supabase remoto, Docker full y escala productiva no se verificaron en esta entrega. El artefacto financiero de referencia anterior se conserva como evidencia histórica, sin reemplazarlo por la salida variable de estas pruebas.
## Decisión v2 implementada y verificada el 27/11/2026

Esta ampliación es previa al presencial. La [metodología vigente](decision-model-v2.md) documenta los pesos y parámetros como hipótesis sintéticas. Las cifras de cartera y planes del 24/11 y 26/11 anteriores no son resultados de este motor.

Se incorporaron perfil financiero v2, modelo logístico de doce variables, puntuación desglosada, capacidad bajo estrés, severidad por cliente, controles de alternativas, costo financiero, límite de cuotas diferidas, cola de revisión y consultas Gemini con análisis/cliente fijados. La migración 0006 amplía tipos NUMERIC y guarda consultas con RLS. No se reescribieron migraciones anteriores ni el artefacto v1.

### Comandos y resultados reales

| Verificación | Resultado |
| --- | --- |
| npm ci | 273 dependencias instaladas. Se requirió ejecutar fuera del sandbox por restricciones de red y acceso a caché; no se cambiaron las versiones del lockfile. |
| npm run model:train | Generó logistic-synthetic-2 y deterioration-v2.json sin alterar v1. El script rechaza sobrescribir un artefacto distinto con el mismo nombre. |
| npm test | **31 aprobadas, 0 fallos**, ejecución final aproximadamente 1.05 s. |
| npm run build | **Correcto**, NestJS y React/Vite. Compilación web final aproximadamente 3.98 s. Persiste advertencia de MapLibre de aproximadamente 1.10 MB, cargado bajo demanda. |
| npm run test:ui | **3 aprobadas, 0 fallos**, aproximadamente 7.7 s. Chrome sin interfaz, anchos 1440/768/375 px. |
| npm run test:integration | **Intentado, bloqueado por entorno:** ECONNREFUSED en 127.0.0.1:54322; ningún caso de integración aprobado en esta ampliación. |
| npm run test:e2e | **Intentado, bloqueado por entorno:** la API indica PostgreSQL no disponible y Playwright alcanza el límite de espera de 30 s del servidor. No se ejecutó el recorrido con base real. |
| Disponibilidad local | Sin .env; Docker/psql no localizados y puerto 54322 cerrado. No se instalaron servicios de base de datos ni se inventaron credenciales operativas. |
| git diff --check | Sin errores de whitespace. Las migraciones 0001–0005 y el artefacto v1 no tienen cambios. |

El sandbox también bloqueó inicialmente tsx al consultar el perfil de Windows y Vite al leer la configuración; las verificaciones aprobadas se ejecutaron con autorización fuera del sandbox. Estos fallos del entorno se distinguen de los resultados funcionales.

### Qué verifican las pruebas

Las unitarias comprueban forma de las doce variables, lectura del modelo v1, reproducibilidad y separación temporal, sentido monotónico de la señal climática, suma del score sin dependencia directa del saldo/nombre distrital, descarte de diferimientos sin recuperación, visitas sin beneficio atribuible, conciliación del beneficio después de costos y respeto al límite de liquidez.

También comprueban que sin evidencia territorial no se añada daño climático de respaldo ni se ofrezcan medidas climáticas, que las herramientas rechacen operaciones no permitidas, argumentos adicionales y clientes fuera del contexto, y que Gemini deba consultar evento, plan y ficha fijada antes de finalizar. Se usa un proveedor controlado para éxito y falta de evidencia; no una llamada nueva a Gemini real.

Las tres pruebas de interfaz usan un fixture de **20 negocios ficticios**, calculado por el motor v2, con un caso de criticidad controlado. Interceptan HTTP y comprueban desglose, capacidad, consulta contextual identificada sin IA, ausencia de errores de página y desbordamiento del documento, controles de liquidez, cola de revisión y apertura del cliente correcto desde el plan. **No verifican persistencia PostgreSQL, migraciones, cartografía oficial ni integración con Gemini real.** Las capturas se guardan en artifacts/qa/decision-v2-{ancho}.png y plan-v2-{ancho}.png; la revisión visual motivó ampliar la ficha y hacer visible la brecha residual.

Se ampliaron las pruebas de integración para reconciliar NUMERIC, elegibilidad y consulta autenticada/persistida sin crear intervenciones. Esas comprobaciones quedan pendientes de ejecución con PostgreSQL.

### Métricas sintéticas del modelo nuevo

Artefacto: data/models/deterioration-v2.json. Hash SHA-256: 5cc992e7d4c8b4a1c93d1059d2303a2e568dd4039e3a1d52b4a688b2d235ff3f.

| Conjunto | N | ROC-AUC | PR-AUC | Brier |
| --- | --- | --- | --- | --- |
| Entrenamiento | 1393 | 0.6701 | 0.5604 | 0.2037 |
| Validación temporal | 669 | 0.6726 | 0.5490 | 0.1900 |
| Prueba temporal | 1344 | 0.6077 | 0.4381 | 0.2049 |
| Clientes no vistos | 182 | 0.6056 | 0.4346 | 0.1929 |
| Tasa base sobre la misma prueba | 1344 | 0.5000 | 0.3043 | 0.2132 |
| Sin variables climáticas, misma prueba | 1344 | 0.5953 | 0.3874 | 0.2105 |

Con umbral predictivo de evaluación 0.35, precisión 0.3963 y recall 0.4670 en prueba. Ese umbral no determina la criticidad operativa: esta usa 30/50/70 puntos. Persisten errores y calibración imperfecta. Los datos y etiquetas cambiaron respecto de v1; no corresponde comparar ambos AUC como si fueran la misma muestra. La discriminación sigue siendo modesta. La mejora verificada es del flujo y sus controles; no se acredita superioridad estadística sobre clientes reales.

### Pendientes y límites de esta entrega

- Aplicar 0006 y repetir integración y E2E con PostgreSQL/PostGIS local configurado. No se marca la migración como aplicada ni como probada.
- Configurar Gemini solo en backend y comprobar una consulta real con cuota autorizada. Sin proveedor está disponible el resumen calculado, expresamente sin IA.
- Validar fuentes, leyendas, vigencias y condiciones de uso; no se consultó una emisión climática nueva para esta ampliación.
- Validar pesos, umbrales, obligaciones externas, gastos del hogar, tasas de fondeo, severidad y efectos de medidas con datos autorizados. Son supuestos de demo.
- El calendario conserva la aproximación 88/12; no representa cronogramas reales. Ni pérdida modelada ni beneficio de escenario constituyen provisiones, resultados contables o ahorro observado.
- La cola conserva revisión de capacidad y casos sin asignación; una medida con beneficio positivo puede dejar brecha residual y no garantiza continuidad del negocio.
- No hay cartera real, piloto institucional, cronogramas contractuales, Auth institucional, concurrencia productiva validada, otros fenómenos/segmentos, Supabase remoto, contactos externos, despliegue ni push.

Toda la ampliación y las pruebas anteriores son previas a la fase presencial. Las adaptaciones futuras deberán conservar corte y evidencia propios.

## Integración de feat/decision-model-v2 con main, 27/11/2026

Base de `main`: `ef26317`. Rama integrada: `d4082d7` (`feat/decision-model-v2`). Se resolvieron los conflictos conservando el modelo de decisión, la consulta contextual y las recomendaciones preventivas. Los filtros por criticidad y por selección del plan pueden combinarse; navegar desde el plan mantiene el cliente correcto. El script unitario ejecuta ambas suites y el workflow de CI incorpora también `test:ui`, usando Chromium disponible en Playwright.

Se añadió `prevention-demo-2.json` para cubrir CONTINUITY con cuatro pasos y fuentes explícitamente sintéticas. La política v1 conserva `prevention-demo-1`, su hash y el contexto de sus recomendaciones guardadas. La redacción de v2 exige una alternativa elegible; no convierte una acción descartada en una propuesta autorizada. Límites de cinco reservas por análisis, autorización y respaldo sin IA permanecen activos.

| Verificación local final | Resultado real |
| --- | --- |
| `npm run db:migrate` | Siete migraciones reconocidas/aplicadas por nombre completo y checksum; ninguna migración existente reescrita |
| `npm test` | **37 aprobadas**, 0 fallidas |
| `npm run build` | **Correcto**: NestJS y React/Vite; persiste el aviso previo del chunk MapLibre de aproximadamente 1.10 MB |
| `npm run test:integration` | **16 aprobadas**, 0 fallidas; aproximadamente 15 s con PostgreSQL/PostGIS real |
| `npm run test:e2e` | **4 aprobadas**, 0 fallidas; aproximadamente 25 s con API y base reales |
| `npm run test:ui` | **3 aprobadas**, 0 fallidas; aproximadamente 13 s; Chromium a 1440, 768 y 375 px |
| Compatibilidad histórica | La recomendación de CS-0810 sigue disponible, modo gemini, protocolo v1 y una reserva utilizada; consulta sin generación nueva |

Las migraciones `202611260006_decision_context.sql` y `202611270006_preventive_recommendations.sql` son distintas por su identificador completo. Se mantienen ambas; la base local conserva las tablas, datos, modelo v1 y recomendaciones anteriores. La integración verifica ahora la persistencia NUMERIC del score y la deuda, la elegibilidad de las acciones seleccionadas y las consultas autenticadas/persistidas que estaban pendientes en el entorno original de la rama.

La primera repetición encontró un conteo de migraciones de seis en vez de siete y un análisis v2 existente en FAILED, que impedía completar el fixture principal. Se actualizó el conteo, se reintentó explícitamente esa ejecución tras verificar las migraciones y se comprobó su finalización con 19 propuestas. Se adaptaron los fixtures preventivos para usar acciones realmente elegibles en v2 y el catálogo correspondiente. La repetición completa pasó. El localizador e2e se ajustó al detalle plegable de factores; no se eliminaron comprobaciones del flujo.

Se inspeccionó la captura móvil del recorrido de decisión, capacidad, alternativas y consulta contextual. Las pruebas de interfaz con HTTP interceptado se distinguen de las pruebas con base real. Los clientes y cifras siguen siendo sintéticos; no se atribuyen resultados institucionales. Durante este merge no se hicieron nuevas llamadas reales a Gemini, ni se validó Supabase remoto o un despliegue productivo. La llamada real del MVP anterior se conserva como evidencia histórica independiente.

Los artefactos financieros y capturas históricos versionados se conservan; las salidas temporales de prueba permanecen bajo `artifacts/qa`. La integración y sus cambios son previos al presencial. La publicación Git y el estado de CI remoto se informan separadamente al finalizar, sin atribuirlos a las pruebas locales.
