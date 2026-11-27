import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";

const StepSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    instruction: z.string().min(1),
    guardrail: z.string().min(1),
  })
  .strict();
export const KnowledgeSchema = z
  .object({
    version: z.string().min(1),
    status: z.literal("DEMO"),
    reviewed_on: z.string(),
    hazard_type: z.literal("rain_flood"),
    audience: z.literal("ASESOR"),
    notice: z.string(),
    protocols: z
      .array(
        z
          .object({
            id: z.string(),
            title: z.string(),
            action_code: z.enum(["COMMON", "LIQUIDITY_VISIT", "RESCHEDULE"]),
            source: z
              .object({
                id: z.string(),
                title: z.string(),
                kind: z.literal("DEMO"),
              })
              .strict(),
            steps: z.array(StepSchema).min(1),
          })
          .strict(),
      )
      .length(3),
  })
  .strict();
export const KNOWLEDGE = KnowledgeSchema.parse(
  JSON.parse(
    readFileSync(resolve("data/knowledge/prevention-demo-1.json"), "utf8"),
  ),
);
export const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const KNOWLEDGE_HASH = digest(KNOWLEDGE);
export function protocolSteps(actionCode: string, knowledge = KNOWLEDGE) {
  if (!["LIQUIDITY_VISIT", "RESCHEDULE"].includes(actionCode))
    throw new Error("Acción sin protocolo");
  return knowledge.protocols
    .filter((p) => p.action_code === "COMMON" || p.action_code === actionCode)
    .flatMap((p) =>
      p.steps.map((s) => ({
        ...s,
        protocol_id: p.id,
        source_id: p.source.id,
        owner: "ASESOR" as const,
      })),
    );
}
export function deterministicContent(
  actionCode: string,
  knowledge = KNOWLEDGE,
) {
  return { steps: protocolSteps(actionCode, knowledge) };
}
