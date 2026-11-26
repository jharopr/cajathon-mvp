# Demo por evento · ClimaShield AI

Versión local del 26/11/2026. Cartera/historia ficticias; predicción e impacto experimentales. No ejecutar sobre cartera real.

1. Arrancar PostgreSQL, migrar, cargar seed e iniciar API/web según README. El modelo ya está versionado. Abrir `http://127.0.0.1:5180`.
2. Esperar el análisis del evento. Si se usa el aviso del 24/11, señalar **Reproducción de aviso** y fechas vencidas: no es alerta actual. El procesador prepara el análisis sin pregunta al chat.
3. En Eventos y alertas, distinguir clientes con predicción, saldo expuesto, pérdida modelada y propuestas. Mostrar los casos derivados, incompletos y sin ubicación.
4. En Clientes, buscar `CS-0001`. Mostrar probabilidad experimental, índice climático separado, factores en logit y percentiles de liquidez. Las cifras se leen de la ejecución, no del ejemplo del Word.
5. Comparar las dos propuestas del catálogo y sus costos. La reprogramación desplaza cuotas; no reduce la lluvia ni condona capital. La visita tiene un efecto de recuperación hipotético declarado.
6. Abrir el mapa solo si sirve. Si falla WebGL o las teselas, continuar con tabla y detalle.
7. En Impacto de cartera, mostrar pérdida sin/con plan, concentración, calendario de principal/intereses/costos, ficha del modelo, comparación sin clima y métricas por grupo. No llamar provisión a la pérdida de escenario.
8. En Plan y seguimiento, comparar mayor saldo y sector/zona. Explicar que son referencias propuestas, no prácticas de la institución confirmadas. El beneficio neto descuenta el costo operativo de la Caja.
9. Abrir Coordinador, ingresar la credencial local y crear borradores. Aprobar una propuesta; asignar, registrar contacto y completar con resultado. Estos pasos no envían mensajes ni ejecutan créditos.
10. Mostrar el informe sin IA. Con clave/cuota, el botón Gemini genera otro informe contextual con evidencia. No es necesario para completar el recorrido ni se usa en las pruebas automáticas.
11. En Fuentes, mostrar versión, última revisión y vigencia. La revisión CENEPRED exige comprobación humana real y un comentario; no marcarla como realizada solo para decorar la demo.
12. Exportar evidencia JSON del evento y análisis. Para repetir sin red, usar datos precargados y `EVENT_SOURCE_REFRESH_MINUTES=0` en el entorno de arranque; no mostrar un replay como aviso vigente.

## Respaldo y límites

La grabación de respaldo está en `artifacts/ClimaShield_event_demo.webm`; las capturas verificadas están en `docs/mockup-events.png` y `docs/mockup-event-mobile.png`. La grabación es una ejecución reproducida, no conexión en vivo. Las cifras verificadas están en `artifacts/event-results.json` y el reporte de validación.

Todos estos componentes y la preparación de esta demo son anteriores al presencial. La demo no demuestra calibración real, ahorro observado, eficacia causal, cobertura de sequía u otros segmentos ni despliegue productivo.
