import { mkdir, writeFile } from "node:fs/promises";
import { trainModel } from "../apps/api/src/analysis/model.js";
const model = trainModel();
await mkdir("data/models", { recursive: true });
await writeFile(
  "data/models/deterioration-v1.json",
  JSON.stringify(model, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      version: model.version,
      hash: model.hash,
      test: model.metrics.test,
      without_climate: model.climate_ablation,
    },
    null,
    2,
  ),
);
