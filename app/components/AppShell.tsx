"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", sub: "月次収支", badge: "分析" },
  { href: "/recordlists", label: "Record List", sub: "仕訳台帳", badge: "編集" },
  { href: "/upload", label: "Upload", sub: "領収書登録", badge: "取込" },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="app-nav-list">
      {navItems.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link${active ? " active" : ""}`}
            onClick={onNavigate}
          >
            <span className="nav-link-main">
              <span>{item.label}</span>
              <span className="nav-badge">{item.badge}</span>
            </span>
            <span className="record-meta">{item.sub}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <div className="app-container">
        <div className="app-content">
          <header className="app-header">
            <Link className="brand-block app-header-brand" href="/recordlists">
              <span className="brand-mark">A</span>
              <span>
                <span className="brand-eyebrow">Acoru FinApp</span>
                <span className="brand-title">経費ワークスペース</span>
              </span>
            </Link>

            <div className="app-header-actions">
              <Link className="btn header-cta" href="/upload">
                領収書を追加
              </Link>
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
            </div>
          </header>
          <main className="app-main">{children}</main>
        </div>
      </div>

      {menuOpen ? <button className="menu-backdrop" aria-label="メニューを閉じる" onClick={() => setMenuOpen(false)} /> : null}

      <nav id="global-nav" className={`hamburger-nav${menuOpen ? " open" : ""}`} aria-label="Primary">
        <div className="mobile-nav-header">
          <span className="brand-mark">A</span>
          <div>
            <div className="brand-eyebrow">Acoru FinApp</div>
            <strong>メニュー</strong>
          </div>
        </div>
        <NavLinks pathname={pathname} onNavigate={() => setMenuOpen(false)} />
      </nav>
    </div>
  );
}
