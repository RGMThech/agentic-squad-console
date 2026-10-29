import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { IconLayers } from "./Icons";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="auth">
      <Link href="/" className="row auth-brand" style={{ gap: 10, textDecoration: "none" }}>
        <span className="brand-mark">
          <IconLayers size={19} />
        </span>
        <span>
          <span className="brand-name" style={{ color: "#fff" }}>{BRAND.produto}</span>
          <span className="brand-sub" style={{ display: "block" }}>{BRAND.assinatura}</span>
        </span>
      </Link>
      <main className="card auth-card">
        <h1>{title}</h1>
        {subtitle && <p className="muted small" style={{ margin: "8px 0 22px" }}>{subtitle}</p>}
        {children}
      </main>
      <p className="xs" style={{ color: "#7d8fb0" }}>Acesso somente por convite · {BRAND.empresa}</p>
    </div>
  );
}
