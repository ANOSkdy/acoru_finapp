"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/recordlists", label: "Record List", sub: "台帳一覧" },
  { href: "/upload", label: "Upload", sub: "領収書" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <div className="app-container">
        <header className="app-header">
          <div>
            <div className="record-meta">Acoru 経費台帳</div>
            <h1>経費ワークスペース</h1>
          </div>
        </header>
        <main className="app-main">{children}</main>
      </div>
      <nav className="bottom-nav" aria-label="Primary">
        <div className="bottom-nav-inner">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link${active ? " active" : ""}`}
              >
                <span>{item.label}</span>
                <span className="record-meta">{item.sub}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
