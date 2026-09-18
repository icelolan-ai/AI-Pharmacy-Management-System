/** What each role may do in the UI (mirrors spec 7.2 + D11 + D20).
 *  The backend is the real gate; this only decides what to render. */

import type { Role } from "@/lib/roles";

export const ABILITIES = {
  viewCost: "viewCost",
  manageMedicines: "manageMedicines",
  manageSuppliers: "manageSuppliers",
  viewSuppliers: "viewSuppliers",
  receiveStock: "receiveStock",
  adjustStock: "adjustStock",
  viewInventoryValue: "viewInventoryValue",
  viewAuditLog: "viewAuditLog",
} as const;

export type Ability = (typeof ABILITIES)[keyof typeof ABILITIES];

const MANAGERS: readonly Role[] = ["owner", "pharmacist"];
const OWNER_ONLY: readonly Role[] = ["owner"];

const ABILITY_ROLES: Record<Ability, readonly Role[]> = {
  viewCost: MANAGERS,
  manageMedicines: MANAGERS,
  manageSuppliers: MANAGERS,
  viewSuppliers: MANAGERS,
  receiveStock: MANAGERS,
  adjustStock: MANAGERS,
  viewInventoryValue: OWNER_ONLY, // D20
  viewAuditLog: OWNER_ONLY,
};

export function can(role: string | null | undefined, ability: Ability): boolean {
  if (!role) return false;
  return ABILITY_ROLES[ability].includes(role as Role);
}
