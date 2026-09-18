"use client";

import Link from "next/link";

import { useAuth } from "@/components/auth-provider";
import { ABILITIES, can } from "@/lib/abilities";
import { useStore } from "@/lib/store/store-provider";

/** The shop's own name at the top of the sidebar.
 *  Never invents a placeholder shop name: until the owner saves one, this says
 *  so in grey and (for the owner) links to the page that fixes it. */
export function SideNavStoreName() {
  const { me } = useAuth();
  const { store, loading } = useStore();
  const name = store?.name?.trim();

  if (name) {
    return <div className="mb-6 truncate text-sm font-semibold text-slate-900">{name}</div>;
  }

  if (loading) {
    return <div className="mb-6 text-sm text-slate-400">กำลังโหลด...</div>;
  }

  if (can(me?.role, ABILITIES.manageStoreProfile)) {
    return (
      <Link
        href="/settings/store"
        className="mb-6 block text-sm text-slate-400 underline-offset-2 hover:underline"
      >
        ยังไม่ได้ตั้งชื่อร้าน
      </Link>
    );
  }

  return <div className="mb-6 text-sm text-slate-400">ยังไม่ได้ตั้งชื่อร้าน</div>;
}
