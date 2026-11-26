import { Decimal } from "decimal.js";
export const money = (v: Decimal.Value) => new Decimal(v).toFixed(2);
