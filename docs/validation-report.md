# Reporte de validación

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
