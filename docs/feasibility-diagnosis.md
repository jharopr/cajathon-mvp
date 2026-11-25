# Diagnóstico: ampliación con clima oficial y Gemini real

> **Actualización 24/11/2026, 21:30 Lima.** El paquete SHAPE de CENEPRED se descargó manualmente (102_shape.zip, 1.25 GB) y se integró junto con los avisos SENAMHI vía WFS. Ver [fuentes](../data/sources.md) y [validación](validation-report.md). El texto siguiente conserva el diagnóstico previo a esa integración.

Fecha de comprobación: **24/11/2026, America/Lima**. Se realizaron consultas externas y comprobaciones de solo lectura sobre el sistema. No se cambiaron las migraciones aplicadas ni se sustituyó el escenario sintético de la aplicación.

## Dictamen

**Viable:** construir una versión operativa con ingesta climática oficial, geometrías reales, evaluación territorial, escenarios financieros, optimización, asistente Gemini y seguimiento humano. NestJS, React y PostgreSQL/PostGIS permiten esta ampliación; no se requiere cambiar de stack.

**Dependencias de negocio:** una evaluación financiera real de clientes de Caja Trujillo requiere cartera autorizada, ubicación y variables financieras proporcionadas por la institución o por cada negocio. Los portales climáticos no contienen esas variables. Sin ellas, el sistema puede evaluar exposición real y ejecutar escenarios declarados, pero no afirmar pérdidas reales ni predecir mora validada.

Una aplicación completa para demostrar operaciones con fuentes públicas es viable. Su uso productivo requiere además autenticación/roles, operación, acuerdos de fuentes, controles institucionales y validación del modelo con datos reales; la clave Gemini no resuelve esas dependencias.

## Evidencia de fuentes comprobadas

| Fuente / prueba | Resultado observado | Interpretación |
| --- | --- | --- |
| SENAMHI, página de avisos | HTTP 200; publicaciones con fechas del 24/11/2026 y vigencias posteriores | Se puede consultar contenido oficial; parser y procedencia deben preservarse |
| IDESEP SENAMHI WFS GetCapabilities | HTTP 200; catálogo de nombres de capas descargado | Hay acceso técnico público a geometrías, no solo imágenes WMS |
| g_acti_quebrada:view_av_activ_qdra | GeoJSON HTTP 200; totalFeatures=1029; se descargó muestra de 3; fecha 2026-11-24Z | Polígonos oficiales de esa capa; no significa 1029 eventos distintos |
| g_prono_pp_24h:view_aviso24h | GeoJSON HTTP 200; 7 geometrías descargadas, fecha 2026-11-24Z | Capa diaria candidata; requiere validación semántica indicada abajo |
| g_dbphisis:aviso_hidro_pub | GeoJSON HTTP 200; puntos con estación, río, nivel y fecha | Los avisos puntuales no equivalen a extensión de inundación |
| g_100_01:aviso001 | GeoJSON con fechas de enero de 2020 | Demuestra que “descargable” no implica vigente; excluir de alertas actuales |
| Otras vistas de avisos | Algunas devolvieron FeatureCollection vacía | No rellenar silenciosamente con datos ficticios ni interpretar vacío como certeza de ausencia de riesgo |
| SIGRID/CENEPRED | Catálogo REST accesible y documento oficial de escenario nov 2026–ene 2027 localizado | Su descarga SHAPE no se verificó: 403 en herramienta web y timeout en consulta directa |
| OpenStreetMap / Overpass | Pruebas de consulta de negocios no concluyentes; una respondió 406 | Opción futura de referencias públicas, no fuente garantizada ni cartera de Caja Trujillo |

En la muestra diaria de 7 MultiPolygon se comprobó validez y SRID 4326 con PostGIS. Una geometría intersectó el rectángulo geográfico de la demo de Trujillo y traía “Nivel 1”. Esto es exposición a esa geometría, no prueba de inundación ni de daño a un negocio.

El servicio de corto plazo devolvió descripciones de activación de quebradas pese a estar identificado como aviso 24h. Es una inconsistencia semántica que debe contrastarse con el boletín y catálogo oficial antes de asignarle un tipo de amenaza o intensidad. La IA no debe resolverla inventando una interpretación.

El filtro exacto nombdep='LA LIBERTAD' sobre la capa de quebradas devolvió 0. Esto solo describe esa consulta/capa, no confirma ausencia de todos los avisos o peligros en La Libertad. La prueba de intersección territorial es independiente y usa otra capa.

## Gemini comprobado

La clave existe en .env y se mantuvo fuera de salida/logs/archivos de diagnóstico. El proveedor listó modelos y gemini-3.5-flash-lite respondió OK a una consulta mínima. Se ejecutó después el código real runAgent con una evaluación sintética: modo gemini, herramienta get_exposed_businesses completada y 12 evidencias devueltas. Resultado sin credenciales: artifacts/diagnostics/gemini-agent.json.

La prueba leyó .env desde el proceso Node. Si el contenedor fue creado antes de agregar la clave, habrá que recrear la API para cargar el nuevo entorno. Tener la clave en disco no actualiza un contenedor en ejecución.

## Qué necesita IA

| Función | Mecanismo adecuado |
| --- | --- |
| Consultar con lenguaje natural y elegir herramientas | Gemini con tool calling |
| Resumir boletines, explicar riesgos/resultados y redactar borradores | Gemini con citas, campos validados y revisión humana |
| Extraer variables de un PDF no estructurado | IA opcional; conservar original y verificar fechas/cifras |
| Descargar WFS/API, validar geometría y vigencia | Código determinista y validaciones |
| Cruzar negocio con amenaza | PostGIS |
| Calcular caja, cuotas, costos y beneficios | Decimal y fórmulas de negocio |
| Elegir plan bajo restricciones | Optimizador matemático |
| Autorizar, aprobar y auditar | Reglas backend, permisos y decisión humana |
| Pronosticar pérdidas o mora calibradas | Modelo estadístico/ML con históricos reales; no se obtiene de un LLM ni de sintéticos |

Gemini agrega comprensión y explicación. La detección espacial, la aritmética y las restricciones deben funcionar aun si Gemini no está disponible.

## Cambios técnicos necesarios

1. **Procedencia y geometrías.** Una nueva migración debe permitir datos de clima reales, geometrías MultiPolygon, IDs externos únicos, emisión/vigencia, extracción y calidad. La tabla actual fuerza synthetic=true y Polygon; no puede recibir directamente las muestras oficiales. Mantener observaciones puntuales separadas de polígonos de amenaza.
2. **Separación de datasets.** Distinguir clima oficial vigente, histórico oficial, contexto meteorológico y escenario sintético; cada resultado conserva su procedencia. La cartera sintética debe seguir rotulada. No mezclar “clima real” con “cliente real”.
3. **Motor por evento.** Retirar reloj fijo, intensidad manual global y source_id fijo del flujo oficial. Seleccionar evento/capa, revisar nivel/fechas y conservar versión de reglas. El índice seguirá siendo una hipótesis hasta calibración, aunque use clima real.
4. **Ingesta robusta.** Conectores permitidos, paginación, límites, caché/snapshots, hashes, reintentos acotados, antigüedad y controles de cambios de esquema. Registrar vacío, fuente caída y dato vencido como estados distintos. Mantener última descarga válida sin presentarla como actual.
5. **Cartera y finanzas.** Importación validada de archivos autorizados; variables ausentes como desconocidas. Permitir escenarios manuales identificados; nunca rellenar ventas, saldos o daños con cifras inventadas para presentarlos como observados.
6. **Operación y UI.** Pantalla de fuentes/eventos, leyenda de origen/vigencia, selección histórica, detalle de evidencia, roles reales, seguimiento y reporte de validación. Gemini consulta solo esos datos controlados.

La regla local anterior de datos exclusivamente sintéticos corresponde al alcance inicial. La nueva instrucción del usuario permite clima oficial público; no autoriza inventar ni obtener cartera privada no proporcionada.

## Orden de implementación viable

| Etapa | Resultado comprobable |
| --- | --- |
| Fuentes y nuevas migraciones | Descargar y persistir SENAMHI real con procedencia, geometría válida y actualización visible |
| Evaluación por evento | Mostrar polígonos reales, seleccionar fecha/evento y cruzar cartera sin reloj ficticio oculto |
| Operación financiera | Importar cartera autorizada o mantener demo sintética; escenarios explícitos y restricciones comprobadas |
| Gemini y seguimiento | Consultas con evidencia oficial, explicación de escenarios, aprobación y registro humano |
| Endurecimiento/validación | Roles, fallos de fuente, auditoría, pruebas integrales y revisión de negocio antes de piloto |

Se puede avanzar en las primeras etapas con las fuentes verificadas. SIGRID no debe bloquearlas; queda como conector adicional condicionado a descarga/acceso comprobado. No se garantiza una alerta vigente sobre cada zona o día. Un sistema correcto debe poder mostrar “sin registros vigentes en esta fuente/zona” sin fabricar exposición.

## Referencias y evidencias

- [SENAMHI, avisos meteorológicos](https://www.senamhi.gob.pe/?p=aviso-meteorologico).
- [IDESEP, catálogo oficial de servicios](https://idesep.senamhi.gob.pe/portalidesep/wms.do).
- [WFS GetCapabilities](https://idesep.senamhi.gob.pe/geoserver/ows?service=WFS&request=GetCapabilities&version=2.0.0).
- [SIGRID, escenario nov 2026–ene 2027](https://sigrid.cenepred.gob.pe/sigridv3/documento/23277).
- [Gemini function calling](https://aistudio.google.com/docs/function-calling.md).
- Evidencias locales: artifacts/diagnostics/current-rain.geojson, wfs-current-2.json, postgis-official-check.json y gemini-agent.json.

Las consultas prueban accesibilidad en este momento, no SLA ni autorización universal de redistribución. Preservar atribución, condiciones de uso y contexto técnico de cada capa al integrarla.
