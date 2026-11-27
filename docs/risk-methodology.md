# Metodología vigente y referencias históricas

**27/11/2026:** la metodología vigente es [Decisión y modelo v2](decision-model-v2.md). Añade capacidad total, score operativo, severidad por cliente, controles de acciones y agente contextual. Las fórmulas y umbrales siguientes documentan la versión 1 y las referencias territoriales conservadas; no determinan por sí solos la nueva criticidad.

Actualización del 26/11/2026: el índice territorial descrito abajo sigue como referencia. Su prioridad y el antiguo optimizador **no determinan el plan por evento actual**. La predicción de crédito es un motor distinto.

## Flujo actual por evento

- Población: clientes con ubicación/finanzas revisables, dentro del evento y con atraso ≤30 días al corte; incompletos, fuera del evento y ya deteriorados quedan separados.
- Entradas: historia anterior al corte, cuota/ventas, reserva/cuota, atrasos previos, entidades, señal climática puntual o contexto distrital y sensibilidad sectorial.
- Modelo: regresión logística regularizada TypeScript. Cortes 6/10 para entrenar, 14 para validar y 18/21 para probar, con ventanas de resultado separadas entre conjuntos; clientes no vistos como evaluación adicional. Métricas/errores/calibración por zona/segmento son sintéticos.
- Salida: P(atraso >30 días en 90 días), experimental. Prioridad ALTA ≥0.45, MEDIA ≥0.20, BAJA por debajo; umbrales de demo versionados, sin validación institucional.
- Clima: nivel puntual/5 multiplicado por intensidad; sin punto, contexto de población distrital expuesta ×0.25. No asignar a un local la certeza derivada de una tasa poblacional. El aviso delimita el evento y no se convierte en índice de mora.
- Incertidumbre: 500 realizaciones pareadas, semilla fija y componente regional compartido. Se varían interrupción/daño; se muestran percentiles de liquidez y frecuencia de brecha, distintos de la probabilidad del modelo.
- Pérdida modelada: saldo × probabilidad × severidad sintética condicional 0.25. No es LGD calibrada, pérdida observada ni provisión. El dato histórico del 10% del Word no se usa como constante.
- Acciones: evaluar reprogramación de dos cuotas o visita de liquidez. El efecto sobre recuperación es un supuesto del escenario, no resultado causal del modelo. La reprogramación difiere cuotas al final sin reducir daño físico ni condonar capital.
- Objetivo: reducción modelada de pérdida menos costo operativo de la Caja; alivio del cliente como desempate. Una propuesta por negocio, recursos y cobertura mínima. Referencias por mayor saldo y sector/zona con iguales restricciones; no prácticas internas confirmadas.
- Finanzas: calendario hipotético, principal e intereses separados, costo contabilizado una vez. Persistencia NUMERIC y Decimal; beneficios del solver comparados en centavos BigInt.

Fuente de verdad implementada: `analysis/model.ts`, `analysis/impact.ts`, `planning/policy.ts` y `planning/event-plan.ts`. Detalle de límites en [refactor-implementation.md](refactor-implementation.md) y resultados en [validation-report.md](validation-report.md).

## Referencia del 24/11 conservada


## Riesgo territorial

R = 100 × H × E × V × (1 − 0.5 × C). Ratios [0,1]. Alta ≥65, media ≥30, baja <30; UNKNOWN sin ubicación. Umbrales, pesos e índice son hipótesis operativas versionadas (experimental-0.2), no calibración crediticia. Intensidad del escenario s: leve/moderado/severo = .4/.65/.9.

### Modo oficial (predeterminado): CENEPRED + SENAMHI

| Evidencia | H | E | Origen |
| --- | --- | --- | --- |
| Punto dentro de zona de susceptibilidad (ST_Covers) | s × peso del nivel (muy baja .1, baja .25, media .5, alta .75, muy alta 1) | 1 | Suscep_Inund / Suscep_MMasa recortados |
| Sin zona puntual para ese peligro: respaldo distrital | s × peso de susceptibilidad distrital (bajo .25, medio .5, alto .75, muy alto 1) × 0.8 por menor resolución | población expuesta / población total del distrito | Dist_Riesgo_* (escenario nov 2026 – ene 2027) |
| Aviso SENAMHI vigente | No modifica R | — | WFS IDESEP, vigencia fecha + 24 h |

Se evalúa inundación y movimientos en masa por separado y se usa el máximo por negocio. **Expuesto** = zona puntual media o superior, o distrito con susceptibilidad alta/muy alta y ≥50 % de población expuesta. Estar bajo aviso vigente es una bandera de seguimiento distinta. Fuera de toda zona/distrito, R=0 con la advertencia de que no implica ausencia de riesgo.

Motivo de esta regla: la susceptibilidad puntual cubre ~82 km² de los 987 km² del recorte (cauces y quebradas), mientras el escenario distrital del mismo CENEPRED reporta, por ejemplo, 100 % de la población de Trujillo en zona susceptible a inundación. Son escalas distintas; se conservan ambas en la evidencia y el factor 0.8 marca la menor resolución. Caso CS-0001: El Porvenir, susceptibilidad distrital alta, 100 % expuesta → H = .9 × .75 × .8 = .54, E = 1, V = .9, C = .2 → **R = 43.74**, prioridad media.

Calidad de ubicación: si la coordenada cae fuera de los límites distritales oficiales o en un distrito distinto al declarado, el negocio queda con calidad PARCIAL y un motivo explícito. No se corrige automáticamente la coordenada.

### Modo sintético (referencia reproducible)

E=1 si ST_Covers sobre los tres rectángulos hipotéticos, 0 fuera, null sin ubicación; H = s. Reloj fijo 24/11/2026 13:00 Lima; vigencia 24–30/11/2026. Caso CS-0001: R = 72.9, prioridad alta.

En ambos modos: superposiciones usan máximo por negocio conservando evidencia; saldo deduplicado. Vulnerabilidad/adaptación son valores ficticios. Calidad financiera separada: su ausencia bloquea simulación y optimización, no borra exposición espacial.

## Caja de 30 días

S ventas, F costos fijos, v ratio variable, Q cuotas, d días interrumpidos, D daño, L liquidez, K costo, md/mD mitigación de días/daño.

```text
Normal = S × (1 − v) − F − Q
Estrés = S × (1 − d/30) × (1 − v) − F − Q − D
Mitigado antes de costo = S × (1 − d×(1−md)/30) × (1−v) − F − Q − D×(1−mD)
Mitigado = mitigado antes de costo − K
Beneficio bruto = mitigado antes de costo − estrés
Beneficio neto = beneficio bruto − K
Liquidez final = L + flujo
Brecha = máximo(0, −liquidez final mitigada)
```

K se descuenta una vez. No modela probabilidades, efectos macro, demanda indirecta, impuestos o recuperación dinámica. Validar horizonte y costos para uso real. Ejemplo CS-0001: 2500 / −2700 / −820; bruto 2080, neto 1880, brecha 820.

## Optimización

| Acción hipotética | Costo | Minutos | Mitigación días / daño |
| --- | --- | --- | --- |
| Llamada | S/20 | 10 | 10% / 5% |
| Verificación inventario | S/80 | 20 | 25% / 40% |
| Evaluación liquidez | S/120 | 30 | 40% / 20% |

Costos/eficacia son supuestos, no precios ni causalidad demostrada. Interrupción leve/moderada/severa: 3/6/10 días; daño=20% de inventario. Elegibles: expuestos con datos financieros y beneficio neto positivo.

Maximiza beneficio neto en céntimos, con una acción por negocio, presupuesto, minutos y cobertura alta mínima. El saldo de crédito no entra al objetivo. Referencia FIFO por código y catálogo; reserva primero cobertura mínima; conserva recursos/eligibilidad. Si no cumple mínimo, se señala y no se afirma comparación equivalente de planes factibles.

Hasta 6000 estados. Con poda no se certifica óptimo; UNKNOWN tampoco demuestra inviabilidad. Las restricciones nunca se relajan silenciosamente. Una mejor cifra modelada no acredita ahorro real.

