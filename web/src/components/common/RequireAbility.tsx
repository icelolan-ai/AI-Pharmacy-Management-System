"use client";

import { useAuth } from "@/components/auth-provider";
import { ABILITIES, can, type Ability } from "@/lib/abilities";

/** Shows its children only when the signed-in role has the ability.
 *  UI-level only — the backend enforces the real rules on every request. */
export function RequireAbility({
  ability,
  children,
  fallback = null,
}: {
  ability: Ability;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { me } = useAuth();
  return <>{can(me?.role, ability) ? children : fallback}</>;
}

export { ABILITIES };
