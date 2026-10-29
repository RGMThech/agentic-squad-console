import Link from "next/link";
import type { User } from "@/lib/session";
import { IconLayers, IconLogout } from "./Icons";
import { NavLink } from "./NavLink";

export type NavItem = { href: string; label: string; icon: React.ReactNode; exact?: boolean };

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
            <div className="brand-name">Squad Console</div>
            <div className="brand-sub">NTT DATA · DATA &amp; AI</div>
          </span>
        </Link>

        {squad && (
          <Link href="/squads" className="squad-switch" title="Trocar de squad">
            <small>{squad.cliente || `${squad.owner}`}</small>
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
          {user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar} alt="" className="avatar" width={32} height={32} />
          ) : (
            <span className="avatar" />
          )}
          <div className="who">
            {user.name}
            <small>@{user.login}</small>
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
