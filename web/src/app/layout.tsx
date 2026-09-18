import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";

import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

// Thai + Latin in one family so Windows renders both clearly.
const notoSansThai = Noto_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Pharmacy Management System",
  description: "ระบบบริหารจัดการร้านขายยา",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${notoSansThai.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 font-sans text-slate-900">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
