import "./print.css";

/** Print pages have no sidebar, no header and no navigation — the tab exists
 *  only to be sent to a printer. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white">{children}</div>;
}
