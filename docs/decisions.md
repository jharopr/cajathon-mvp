# Decisiones

| Fecha Lima | Decisión y consecuencia |
| --- | --- |
| 24/11/2026 | NestJS + React + PostgreSQL/PostGIS y Supabase destino por instrucción del usuario. Se retiró scaffold API Python; no hay SQLite. |
| 24/11/2026 | pg + SQL versionado: tipos espaciales explícitos, checksums, bloqueo y transacciones. Sin ORM sincronizando/reset. |
| 24/11/2026 | Esquema privado con RLS. Supabase Auth/Storage quedan fuera del MVP actual. |
| 24/11/2026 | Optimizador TypeScript sustituye OR-Tools de la especificación inicial. Se informa poda y estado sin falsear optimalidad. |
| 24/11/2026 | Polígonos hipotéticos y reloj fijo como primer alcance. Se conservan como modo Sintética para reproducir cifras de referencia. |
| 24/11/2026 | Gemini SDK oficial, Interactions y store:false conforme a habilidad del usuario/documentación actual. Sin herramientas de escritura. |
| 24/11/2026 | Puertos 5180/8081/54322: 5173 y 8000 pertenecían a otros contenedores, que no se detuvieron. |
| 24/11/2026 | Todo el MVP es base previa al presencial; adaptación nueva por evento propuesta. |
| 24/11/2026 | Entrega local: no push ni remisión automática a la organización. |
| 24/11/2026 | Clima real, cartera ficticia: se integran CENEPRED (SHAPE 102) y avisos SENAMHI (WFS) por instrucción del usuario; la cartera de la Caja sigue siendo sintética y rotulada. |
| 24/11/2026 | Lector shapefile propio en TypeScript con acceso por .shx: evita GDAL/Python y no carga 1.8 GB en memoria. Recorte y simplificación en PostGIS; solo el recorte (≈2.5 MB) se versiona. |
| 24/11/2026 | Regla punto + respaldo distrital (factor 0.8, E = población expuesta/total) porque la susceptibilidad puntual no cubre el casco urbano y el escenario distrital sí. El aviso SENAMHI no altera el índice ni define exposición. |
| 24/11/2026 | Puntos ficticios fuera de límites oficiales se reportan como calidad de ubicación en lugar de regenerar la cartera, para no cambiar cifras de referencia ni ocultar el control. |
| 24/11/2026 | Refresco SENAMHI con credencial de coordinador y límite de 1/min; programado solo si SENAMHI_REFRESH_MINUTES ≥ 5. CENEPRED se reprocesa manualmente al cambiar el checksum. |

Pendientes: KPI/línea base, acciones permitidas, costos/eficacia, confirmación de leyenda GRIDCODE y condiciones de uso CENEPRED/SENAMHI, proveedores IA, acceso Supabase, formato/hora de entrega y titularidad del código del equipo. No bloquean una demo sintética.


## Decisiones del 26/11/2026

- Aplicar el plan solicitado sobre su alcance recortado y conservar evidencia previa en Git/documentos archivados; sin push/despliegue.
- Mantener monolito NestJS, React y PostGIS. Regresión logística nativa TypeScript; sin API Python ni otro runtime ML.
- Evento, snapshot, política y modelo versionados; trabajos PostgreSQL con lease/reintentos; plan y alerta interna transaccionales. Reintento manual autenticado después de fallo terminal.
- Pérdida de escenario separada de deterioro/exposición y provisión. No aplicar el 10% agregado del Word como severidad universal.
- Propuestas de reprogramación/visita sujetas a revisión; no contacto real, preaprobación ni ejecución crediticia. Efecto hipotético, no causal.
- Retirar Open-Meteo, chat abierto y pantallas de arquitectura/simulador. Mantener referencia histórica de caja y georreferenciación.
- Comparadores mayor saldo/sector-zona; BigInt en beneficios del solver, NUMERIC en proyecciones y totales de planes.
- SENAMHI con variable nueva EVENT_SOURCE_REFRESH_MINUTES, por defecto 30; actualización mensual sintética y tarea/revisión humana CENEPRED.
- Segundo evento, otros segmentos, importador, fondeo, Auth y Supabase remoto continúan pendientes. Todo lo implementado aquí es previo al presencial.
