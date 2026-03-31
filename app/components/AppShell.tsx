"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
  { href: "/recordlists", label: "Record List", sub: "台帳一覧" },
  { href: "/dashboard", label: "Dashboard", sub: "ダッシュボード" },
  { href: "/trial-balance", label: "Trial Balance", sub: "試算表" },
  { href: "/pl", label: "PL", sub: "損益計算書" },
  { href: "/bs", label: "BS", sub: "貸借対照表" },
  { href: "/cf", label: "CF", sub: "簡易CF" },
  { href: "/upload", label: "Upload", sub: "領収書" },
  { href: "/journals", label: "Journals", sub: "複合仕訳" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);


  return (
    <div className="app-shell">
      <div className="app-container">
        <header className="app-header">
          <div>
            <div className="record-meta">Acoru 経費台帳</div>
            <h1>経費ワークスペース</h1>
          </div>
          <button
            type="button"
            className="menu-toggle"
            aria-label="メニューを開く"
            aria-expanded={menuOpen}
            aria-controls="global-nav"
            onClick={() => setMenuOpen((v) => !v)}
          >
            ☰
          </button>
        </header>
        <main className="app-main">{children}</main>
      </div>

      {menuOpen ? <button className="menu-backdrop" aria-label="メニューを閉じる" onClick={() => setMenuOpen(false)} /> : null}

      <nav id="global-nav" className={`hamburger-nav${menuOpen ? " open" : ""}`} aria-label="Primary">
        <div className="hamburger-nav-inner">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link${active ? " active" : ""}`}
                onClick={() => setMenuOpen(false)}
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
