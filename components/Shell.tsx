import Link from "next/link";
import { BRAND } from "@/lib/brand";
import type { User } from "@/lib/session";
import { IconLayers, IconLogout } from "./Icons";
import { NavLink } from "./NavLink";

export type NavItem = { href: string; label: string; icon: React.ReactNode; exact?: boolean };

export function initials(nome: string) {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

export function Shell({
  user,
  nav,
  squad,
  children,
}: {
  user: User;
  nav: NavItem[];
  squad?: { owner: string; repo: string; nome: string; cliente: string };
  children: React.ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/squads" className="brand" style={{ textDecoration: "none" }}>
          <span className="brand-mark">
            <IconLayers size={19} />
          </span>
          <span>
            <div className="brand-name">{BRAND.produto}</div>
            <div className="brand-sub">{BRAND.assinatura}</div>
          </span>
        </Link>

        {squad && (
          <Link href="/squads" className="squad-switch" title="Trocar de squad">
            <small>{squad.cliente || squad.owner}</small>
            {squad.nome}
          </Link>
        )}

        <nav className="nav" aria-label="Navegação principal">
          {nav.map((n) => (
            <NavLink key={n.href} href={n.href} exact={n.exact}>
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <Link href="/conta" className="avatar avatar-initials" title="Minha conta" aria-label="Minha conta">
            {initials(user.name)}
          </Link>
          <div className="who">
            {user.name}
            <small>{user.isAdmin ? "Administrador" : user.email}</small>
          </div>
          <form action="/api/auth/logout" method="post">
            <button className="icon-btn" title="Sair" aria-label="Sair">
              <IconLogout size={17} />
            </button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

export function PageHead({
  title,
  crumbs,
  actions,
  subtitle,
}: {
  title: React.ReactNode;
  crumbs?: { href?: string; label: string }[];
  actions?: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <header className="topbar">
      <div>
        {crumbs && (
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <span key={i}>
                {c.href ? <Link href={c.href}>{c.label}</Link> : c.label}
                {i < crumbs.length - 1 && " /"}
              </span>
            ))}
          </div>
        )}
        <h1>{title}</h1>
        {subtitle && <p className="muted small" style={{ marginTop: 6 }}>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}
