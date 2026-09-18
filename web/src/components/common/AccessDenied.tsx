import { ErrorState } from "@/components/common/ErrorState";

/** The one wording used on every page that blocks a role
 *  (docs/05-web-spec.md 5.8ข). */
export const ACCESS_DENIED_MESSAGE = "🔒 หน้านี้สำหรับเจ้าของร้านเท่านั้น";

export function AccessDenied({ message = ACCESS_DENIED_MESSAGE }: { message?: string }) {
  return <ErrorState message={message} />;
}
