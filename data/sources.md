# Fuentes y procedencia

Corte: **24/11/2026, America/Lima**. Regla del proyecto: **clima real, cartera ficticia**. Ninguna fuente climática contiene clientes, ventas ni saldos; esos datos siguen siendo sintéticos.

| Fuente | Tipo | Cómo entra al MVP | Estado / limitación |
| --- | --- | --- | --- |
| [CENEPRED · SIGRID, escenario de riesgo por lluvias nov 2026 – ene 2027](https://sigrid.cenepred.gob.pe/sigridv3/documento/23277) | Oficial, cartografía estática | Paquete `102_shape.zip` (1.25 GB, SHA-256 `24995312…41dee3`) descargado manualmente; `npm run data:cenepred` lo recorta a Trujillo y genera [GeoJSON versionado](official/) | Susceptibilidad a inundación (Suscep_Inund) y movimientos en masa (Suscep_MMasa), 4/11/2026; riesgo distrital (Dist_Riesgo_*), 19/11/2026. GRIDCODE 1–5 interpretado como muy baja–muy alta: la leyenda no viene en el XML y debe confirmarse |
| [SENAMHI · IDESEP WFS](https://idesep.senamhi.gob.pe/geoserver/ows?service=WFS&request=GetCapabilities&version=2.0.0) | Oficial, avisos con vigencia | `g_prono_pp_24h:view_aviso24h` y `g_acti_quebrada:view_av_activ_qdra` filtradas por recuadro; `npm run data:senamhi`, botón en la pestaña Fuentes o refresco opcional | Consulta del 24/11/2026 21:32: 1 aviso Nivel 1 cubre el área; activación de quebradas sin registros. Vigencia asumida: fecha + 24 h desde 00:00 Lima. La capa de 24 h trae texto de activación de quebradas; se muestra sin reinterpretar |
| [Open-Meteo](https://open-meteo.com/en/docs) | Pronóstico puntual | Consulta bajo demanda; se registra hora y estado | Contexto; no alimenta el índice. Revisar términos para uso comercial |
| Generador ClimaShield, seed 42 | Ficticio | `npm run db:seed` / `data:export` | 1000 negocios y 1001 créditos inventados que simulan una Caja. Sin representatividad. Coordenadas aproximadas: 27 caen fuera de límites distritales oficiales y ~130 en distrito distinto al declarado; el modo oficial lo reporta como calidad de ubicación |
| Polígonos ClimaShield | Ficticio | Seed | Tres rectángulos hipotéticos, disponibles en modo "Sintética" para reproducir las cifras de referencia |
| Caja Trujillo | — | No integrada | No se recibió cartera ni integración. Un piloto requiere datos autorizados |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Mapa base | Teselas | Atribución obligatoria; origen distinto de las amenazas |

## Archivos versionados en `data/official/`

| Archivo | Contenido |
| --- | --- |
| cenepred-manifest.json | Procedencia: documento, paquete, checksum, fechas de archivo, área, tolerancias, supuestos y nota de uso |
| cenepred-susceptibilidad-trujillo.geojson | 3,484 polígonos (inundación 1,074; movimientos en masa 2,410) recortados a −79.20, −8.25, −78.90, −7.98 y simplificados ≈5.5 m |
| cenepred-riesgo-distrital-trujillo.geojson | 12 distritos de la provincia de Trujillo con nivel de riesgo, susceptibilidad, vulnerabilidad y población/viviendas expuestas |
| senamhi-avisos-snapshot.json | Respuesta validada del WFS para el área, para operar sin red. Sus avisos vencen y se muestran como vencidos |

El paquete original no se versiona (`data/raw/` está en .gitignore). Para regenerar: extraer el zip en `data/raw/cenepred-102/` y ejecutar `npm run data:cenepred -- --dir data/raw/cenepred-102 --zip <ruta>/102_shape.zip`.

## Política de actualización propuesta

| Fuente | Manejo | Automatizado |
| --- | --- | --- |
| Paquete CENEPRED | Revisar mensualmente si hay nueva versión; descargar solo si cambia (checksum). El horizonte trimestral no garantiza publicaciones cada tres meses | No |
| Susceptibilidad CENEPRED | Reemplazar cuando la entidad publique revisión; sin frecuencia anual asumida | No |
| Avisos SENAMHI | Según emisión y vigencia; comprobar cada 30 minutos como frecuencia del sistema | Opcional: `SENAMHI_REFRESH_MINUTES=30` |
| Open-Meteo | Consulta horaria guardando hora y pronóstico | No |

La aplicación muestra fuente, publicación, vigencia, última consulta y estado (vigente, vencida, sin avisos vigentes, no disponible). Si un proveedor falla se conservan los últimos datos válidos y la fuente se marca como no disponible; nunca se rellena con datos ficticios.
