import { mkdir, writeFile, readFile } from "node:fs/promises";
import { trainModel } from "../apps/api/src/analysis/model.js";
const model = trainModel();
await mkdir("data/models", { recursive: true });
const path = "data/models/deterioration-v2.json";
const previous = await readFile(path, "utf8").catch(() => null);
if (previous && JSON.parse(previous).hash !== model.hash) throw new Error("Artefacto existente distinto: crear una nueva versión");
if (!previous) await writeFile(path, JSON.stringify(model, null, 2) + "\n", { flag: "wx" });
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
