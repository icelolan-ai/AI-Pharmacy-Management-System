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
  viewReports: "viewReports",
  manageStoreProfile: "manageStoreProfile",
  manageStoreMap: "manageStoreMap",
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
  viewReports: MANAGERS, // dashboard, expiry and the three report pages
  manageStoreProfile: OWNER_ONLY, // everyone may read it; only the owner may edit
  // U-8: every role reads the map — a cashier has to find where a medicine
  // sits — and only the owner draws it. There is no ability for reading it,
  // because there is no role that may not.
  manageStoreMap: OWNER_ONLY,
};

export function can(role: string | null | undefined, ability: Ability): boolean {
  if (!role) return false;
  return ABILITY_ROLES[ability].includes(role as Role);
}
