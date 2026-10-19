import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = { title: "OT Calc" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <header className="border-b bg-white">
          <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 text-sm">
            <Link href="/" className="text-base font-bold">
              OT Calc
            </Link>
            <Link href="/" className="text-slate-600 hover:text-slate-900">
              Month
            </Link>
            <Link href="/import" className="text-slate-600 hover:text-slate-900">
              Import Bamawl
            </Link>
            <Link href="/settings" className="text-slate-600 hover:text-slate-900">
              Settings
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
