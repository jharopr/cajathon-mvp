import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Decimal } from "decimal.js";
import { pool, transaction } from "../database.js";
import { Repository } from "../climate/exposure.repository.js";
import {
  profile,
  currentCutoff,
  type Payment,
} from "./history.js";
import type { Model } from "../analysis/model.js";
import type { Business } from "../data.js";
import { POLICY, policyHash } from "../planning/policy.js";
import { money } from "../shared/money.js";
import { generateCapacityHistory, CAPACITY_VERSION } from "./capacity.js";

export interface PortfolioRecord {
  business: Business;
  profile: ReturnType<typeof profile>;
  history: Payment[];
  loans: { id: string; balance: string; monthly_installment: string }[];
}
@Injectable()
export class PortfolioService {
  async prepare(cutoff = currentCutoff()) {
    const model = JSON.parse(
      await readFile("data/models/deterioration-v2.json", "utf8"),
    ) as Model;
    const { hash, ...content } = model;
    if (
      createHash("sha256").update(JSON.stringify(content)).digest("hex") !==
      hash
    )
      throw new Error("Artefacto de modelo alterado");
    const businesses = await new Repository().businesses();
    if (!businesses.length)
      throw new Error("Ejecute el seed de la cartera ficticia");
    const loans = (
      await pool.query(
        "SELECT id,business_id,balance::text,monthly_installment::text FROM climashield.loans WHERE status='ACTIVE' ORDER BY id",
      )
    ).rows;
    const byBusiness = new Map<string, typeof loans>();
    for (const l of loans) {
      const group = byBusiness.get(l.business_id) ?? [];
      group.push(l);
      byBusiness.set(l.business_id, group);
    }
    const inputHash = createHash("sha256")
      .update(
        JSON.stringify({ businesses, loans, version: CAPACITY_VERSION, cutoff }),
      )
      .digest("hex");
    return transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(2026112601)");
      const previous = (
        await c.query(
          "SELECT artifact_hash FROM climashield.model_versions WHERE id=$1",
          [model.version],
        )
      ).rows[0];
      if (previous && previous.artifact_hash !== hash)
        throw new Error("Use una nueva versión de modelo");
      await c.query(
        "INSERT INTO climashield.model_versions(id,artifact_hash,dataset_hash,artifact) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
        [model.version, hash, model.dataset_hash, JSON.stringify(model)],
      );
      await c.query(
        "INSERT INTO climashield.policy_versions(id,input_hash,policy) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING",
        [POLICY.id, policyHash, JSON.stringify(POLICY)],
      );
      const storedPolicy = (
        await c.query(
          "SELECT input_hash FROM climashield.policy_versions WHERE id=$1",
          [POLICY.id],
        )
      ).rows[0];
      if (storedPolicy.input_hash !== policyHash)
        throw new Error("Use una nueva versión de política");
      const existing = (
        await c.query(
          "SELECT id FROM climashield.portfolio_snapshots WHERE input_hash=$1",
          [inputHash],
        )
      ).rows[0];
      if (existing)
        return {
          snapshot_id: existing.id as string,
          model_id: model.version,
          policy_id: POLICY.id,
        };
      const id = randomUUID(),
        payments: any[] = [];
      const records: PortfolioRecord[] = businesses.map((b) => {
        const own = byBusiness.get(b.id) ?? [],
          histories = own.map((l) => {
            const rows = generateCapacityHistory(
              b,
              l.balance,
              l.monthly_installment,
              cutoff,
            );
            payments.push(
              ...rows.map((r) => ({
                loan_id: l.id,
                period: r.period,
                amount_due: r.due,
                amount_paid: r.paid,
                principal: r.principal,
                interest: r.interest,
                balance: r.balance,
                days_past_due: r.dpd,
              })),
            );
            return rows;
          });
        const history = Array.from({ length: 24 }, (_, i) => {
          const rows = histories.map((h) => h[i]),
            sum = (
              key: "due" | "paid" | "principal" | "interest" | "balance",
            ) => money(rows.reduce((v, r) => v.plus(r[key]), new Decimal(0)));
          return {
            month: rows[0]?.month ?? i + 1,
            period: rows[0]?.period ?? cutoff,
            due: sum("due"),
            paid: sum("paid"),
            principal: sum("principal"),
            interest: sum("interest"),
            balance: sum("balance"),
            dpd: Math.max(0, ...rows.map((r) => r.dpd)),
          };
        });
        return { business: b, profile: profile(b), history, loans: own };
      });
      await c.query(
        "INSERT INTO climashield.portfolio_snapshots(id,input_hash,cutoff,generator_version,records) VALUES($1,$2,$3,$4,$5)",
        [id, inputHash, cutoff, CAPACITY_VERSION, JSON.stringify(records)],
      );
      await c.query(
        `INSERT INTO climashield.loan_payment_history(snapshot_id,loan_id,period,amount_due,amount_paid,principal,interest,balance,days_past_due)
        SELECT $1,x.* FROM jsonb_to_recordset($2::jsonb) AS x(loan_id uuid,period date,amount_due numeric,amount_paid numeric,principal numeric,interest numeric,balance numeric,days_past_due integer)`,
        [id, JSON.stringify(payments)],
      );
      return { snapshot_id: id, model_id: model.version, policy_id: POLICY.id };
    });
  }
}
