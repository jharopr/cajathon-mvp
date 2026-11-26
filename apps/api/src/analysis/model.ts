import { createHash } from "node:crypto";
import { generate, type Business } from "../data.js";
import {
  generateHistory,
  profile,
  forecast,
  historyFeatures,
  HISTORY_VERSION,
  HISTORY_CUTOFF,
} from "../portfolio/history.js";

export const FEATURES = [
  "Cuota / ventas",
  "Reserva / cuota",
  "Pagos con atraso previos",
  "Entidades acreedoras",
  "Amenaza puntual",
  "Contexto distrital",
  "Sensibilidad sectorial",
];
export interface Sample {
  client: string;
  cut: number;
  label_end: number;
  heldout: boolean;
  x: number[];
  y: number;
  zone: string;
  segment: string;
}
export interface Model {
  version: string;
  hash: string;
  dataset_hash: string;
  synthetic: true;
  cutoff: string;
  features: string[];
  mean: number[];
  scale: number[];
  weights: number[];
  intercept: number;
  metrics: Record<string, ReturnType<typeof evaluate>>;
  climate_ablation: ReturnType<typeof evaluate>;
  group_metrics: Record<
    string,
    { name: string; metrics: ReturnType<typeof evaluate> }[]
  >;
}
const sigmoid = (z: number) =>
  1 / (1 + Math.exp(-Math.max(-35, Math.min(35, z))));
export function trainingSamples(businesses: Business[] = generate()): Sample[] {
  return businesses
    .filter((b) => b.monthly_revenue !== null)
    .flatMap((b) => {
      const rows = generateHistory(b),
        p = profile(b);
      return [6, 10, 14, 18, 21]
        .filter((cut) => rows[cut - 1].dpd <= 30)
        .map((cut) => ({
          client: b.id,
          cut,
          label_end: cut + 3,
          heldout: p.heldout,
          x: historyFeatures(
            b,
            rows.slice(0, cut),
            forecast(cut + 1, b.district),
            p.point_exposure,
            p.point_exposure ? 0 : 0.25,
          ),
          y: Number(rows.slice(cut, cut + 3).some((x) => x.dpd > 30)),
          zone: b.district,
          segment: p.segment,
        }));
    });
}
export function predict(
  model: Pick<Model, "weights" | "intercept" | "mean" | "scale">,
  x: number[],
) {
  if (x.length !== model.weights.length || x.some((v) => !Number.isFinite(v)))
    throw new Error("Variables del modelo inválidas");
  const contributions = x.map(
    (v, i) => ((v - model.mean[i]) / model.scale[i]) * model.weights[i],
  );
  return {
    probability: sigmoid(
      model.intercept + contributions.reduce((s, v) => s + v, 0),
    ),
    explanation: contributions
      .map((value, i) => ({ factor: FEATURES[i], value, raw: x[i] }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
    explanation_scale:
      "Contribución al logit, no puntos porcentuales ni causalidad",
  };
}
export function evaluate(
  rows: Sample[],
  model: Pick<Model, "weights" | "intercept" | "mean" | "scale">,
) {
  const scored = rows
    .map((r) => ({ p: predict(model, r.x).probability, y: r.y }))
    .sort((a, b) => b.p - a.p);
  const positive = rows.reduce((s, r) => s + r.y, 0),
    negative = rows.length - positive;
  let tp = 0,
    fp = 0,
    auc = 0,
    ap = 0;
  for (let i = 0; i < scored.length; ) {
    let j = i,
      yes = 0,
      no = 0;
    while (j < scored.length && scored[j].p === scored[i].p) {
      yes += scored[j].y;
      no += 1 - scored[j].y;
      j++;
    }
    auc += no * (tp + yes / 2);
    tp += yes;
    fp += no;
    ap += positive ? ((yes / positive) * tp) / (tp + fp) : 0;
    i = j;
  }
  const at = scored.filter((r) => r.p >= 0.35),
    hits = at.reduce((s, r) => s + r.y, 0);
  const calibration = Array.from({ length: 5 }, (_, i) => {
    const group = scored.filter(
      (r) => r.p >= i / 5 && (i === 4 ? r.p <= 1 : r.p < (i + 1) / 5),
    );
    return {
      from: i / 5,
      to: (i + 1) / 5,
      n: group.length,
      predicted: group.length
        ? group.reduce((s, r) => s + r.p, 0) / group.length
        : null,
      observed: group.length
        ? group.reduce((s, r) => s + r.y, 0) / group.length
        : null,
    };
  });
  return {
    n: rows.length,
    positive,
    prevalence: rows.length ? positive / rows.length : 0,
    roc_auc: positive && negative ? auc / (positive * negative) : null,
    pr_auc: positive ? ap : null,
    brier: rows.length
      ? scored.reduce((s, r) => s + (r.p - r.y) ** 2, 0) / rows.length
      : null,
    threshold: 0.35,
    precision: at.length ? hits / at.length : null,
    recall: positive ? hits / positive : null,
    calibration,
  };
}
function fit(rows: Sample[], withoutClimate = false) {
  const mean = FEATURES.map(
    (_, i) => rows.reduce((s, r) => s + r.x[i], 0) / rows.length,
  );
  const scale = mean.map(
    (m, i) =>
      Math.sqrt(
        rows.reduce((s, r) => s + (r.x[i] - m) ** 2, 0) / rows.length,
      ) || 1,
  );
  const weights = mean.map(() => 0);
  let intercept = 0;
  const prepared = rows.map((r) => ({
    y: r.y,
    x: r.x.map((v, i) =>
      withoutClimate && [4, 5].includes(i) ? 0 : (v - mean[i]) / scale[i],
    ),
  }));
  for (let epoch = 0; epoch < 350; epoch++) {
    const grad = weights.map(() => 0);
    let bias = 0;
    for (const r of prepared) {
      const error =
        sigmoid(intercept + r.x.reduce((s, v, i) => s + v * weights[i], 0)) -
        r.y;
      bias += error;
      r.x.forEach((v, i) => (grad[i] += error * v));
    }
    intercept -= (0.12 * bias) / rows.length;
    weights.forEach(
      (w, i) => (weights[i] -= 0.12 * (grad[i] / rows.length + 0.015 * w)),
    );
  }
  return { weights, intercept, mean, scale };
}
export function trainModel(rows = trainingSamples()): Model {
  const train = rows.filter((r) => !r.heldout && r.cut <= 10),
    validation = rows.filter((r) => !r.heldout && r.cut === 14),
    test = rows.filter((r) => !r.heldout && r.cut >= 18),
    unseen = rows.filter((r) => r.heldout && r.cut === 21);
  if (!train.length || !validation.length || !test.length)
    throw new Error("División temporal incompleta");
  const fitted = fit(train),
    noClimate = fit(train, true);
  const dataset_hash = createHash("sha256")
    .update(JSON.stringify({ version: HISTORY_VERSION, rows }))
    .digest("hex");
  const prevalence = train.reduce((s, r) => s + r.y, 0) / train.length;
  const base = {
    ...fitted,
    weights: fitted.weights.map(() => 0),
    intercept: Math.log(prevalence / (1 - prevalence)),
  };
  const group_metrics = Object.fromEntries(
    (["zone", "segment"] as const).map((key) => [
      key,
      [...new Set(test.map((r) => r[key]))].map((name) => ({
        name,
        metrics: evaluate(
          test.filter((r) => r[key] === name),
          fitted,
        ),
      })),
    ]),
  );
  const model = {
    version: "logistic-synthetic-1",
    dataset_hash,
    synthetic: true as const,
    cutoff: HISTORY_CUTOFF,
    features: FEATURES,
    ...fitted,
    metrics: {
      train: evaluate(train, fitted),
      validation: evaluate(validation, fitted),
      test: evaluate(test, fitted),
      base_rate: evaluate(test, base),
      unseen_clients: evaluate(unseen, fitted),
    },
    climate_ablation: evaluate(test, noClimate),
    group_metrics,
  };
  return {
    ...model,
    hash: createHash("sha256").update(JSON.stringify(model)).digest("hex"),
  };
}
