import { ForbiddenException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
export function coordinator(token: string | undefined) {
  const expected = process.env.DEMO_COORDINATOR_TOKEN;
  if (
    !expected ||
    !token ||
    Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  )
    throw new ForbiddenException("Ingrese la credencial local de coordinador");
}
export const transitions: Record<string, string[]> = {
  DRAFT: ["APPROVED", "CANCELLED"],
  APPROVED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["CONTACTED", "CANCELLED"],
  CONTACTED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};
