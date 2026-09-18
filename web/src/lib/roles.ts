/** Roles from the backend (spec 7.2). Kept in one place for later screens. */
export const ROLES = ["owner", "pharmacist", "staff"] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "เจ้าของร้าน",
  pharmacist: "เภสัชกร",
  staff: "พนักงาน",
};

export function roleLabel(role: string | null | undefined): string {
  return role && role in ROLE_LABELS ? ROLE_LABELS[role as Role] : "ไม่ทราบสิทธิ์";
}

export function hasRole(role: string | null | undefined, allowed: readonly Role[]): boolean {
  return Boolean(role) && allowed.includes(role as Role);
}

/** owner and pharmacist may see cost and value fields; staff may not (D11, spec 7.2). */
export function canViewCost(role: string | null | undefined): boolean {
  return hasRole(role, ["owner", "pharmacist"]);
}

export function isOwner(role: string | null | undefined): boolean {
  return hasRole(role, ["owner"]);
}
