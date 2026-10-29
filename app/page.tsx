import Link from "next/link";
import { IconBot, IconCheck, IconCoins, IconGate, IconLayers, IconSettings } from "@/components/Icons";
import { BRAND } from "@/lib/brand";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const GATES = [
  { g: "G1", t: "Spec", d: "O analista transforma o pedido em especificação e lista as dúvidas. Você responde e aprova." },
  { g: "G2", t: "Design", d: "O arquiteto modela a solução, os contratos de dados e o mapa de dados pessoais. Você aprova." },
  { g: "G3", t: "Produção", d: "Engenheiros, QA, revisor e documentação entregam. Com tudo verde, você libera o merge." },
];

const RECURSOS = [
  { ic: <IconBot size={20} />, t: "Nove agentes especializados", d: "Requisitos, arquitetura, ingestão, transformação, QA, BI, revisão, governança e orquestração — cada um com escopo e ferramentas restritos." },
  { ic: <IconGate size={20} />, amber: true, t: "Três gates humanos", d: "Nada vai para produção sem a sua aprovação. Spec com dúvida aberta não passa." },
  { ic: <IconCoins size={20} />, t: "Custo sob controle", d: "Turnos, duração e custo de cada execução, por agente, por feature e por mês." },
  { ic: <IconSettings size={20} />, t: "Harness auditável", d: "Convenções, contratos e papéis versionados no repositório. Toda mudança deixa rastro." },
];

export default async function Landing() {
  const user = await currentUser().catch(() => null);
  const cta = user ? { href: "/squads", label: "Abrir o console" } : { href: "/login", label: "Entrar" };

  return (
    <div className="site">
      <header className="site-nav">
        <div className="site-wrap spread">
          <span className="row" style={{ gap: 10 }}>
            <span className="brand-mark">
              <IconLayers size={19} />
            </span>
            <span>
              <span className="brand-name" style={{ color: "#fff" }}>{BRAND.produto}</span>
              <span className="brand-sub" style={{ display: "block" }}>{BRAND.assinatura}</span>
            </span>
          </span>
          <Link href={cta.href} className="btn btn-github">
            {cta.label}
          </Link>
        </div>
      </header>

      <section className="site-hero">
        <div className="site-wrap">
          <p className="eyebrow">Squad agêntica de Data Analytics</p>
          <h1>Um humano no comando. Uma squad inteira de agentes entregando dados.</h1>
          <p className="lead">
            Você define o problema e aprova três gates. Os agentes especificam, modelam, constroem, testam e documentam — sob regras que impedem o erro de chegar à produção.
          </p>
          <div className="row" style={{ gap: 12, marginTop: 28 }}>
            <Link href={cta.href} className="btn btn-gate" style={{ height: 46, padding: "0 24px", fontSize: 15 }}>
              {cta.label}
            </Link>
            <span className="small" style={{ color: "#a9bbd8" }}>Acesso somente por convite.</span>
          </div>
          <div className="site-stats">
            <div><b>1</b><span>humano no comando</span></div>
            <div><b>9</b><span>agentes especializados</span></div>
            <div><b>3</b><span>gates de aprovação</span></div>
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-wrap">
          <h2 className="site-h2">Como funciona</h2>
          <p className="muted site-sub">Spec-Driven Development: a especificação é o contrato, e só você muda o status para aprovado.</p>
          <ol className="site-gates">
            {GATES.map((x) => (
              <li key={x.g}>
                <span className="gate-big" style={{ background: "var(--amber)", borderColor: "var(--amber)", color: "var(--navy)" }}>{x.g}</span>
                <div>
                  <h3>{x.t}</h3>
                  <p className="muted small">{x.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="site-section site-alt">
        <div className="site-wrap">
          <h2 className="site-h2">O que vem com a squad</h2>
          <div className="grid grid-2" style={{ marginTop: 24 }}>
            {RECURSOS.map((f) => (
              <div key={f.t} className="card card-pad row" style={{ alignItems: "flex-start", gap: 16, flexWrap: "nowrap" }}>
                <span className={`site-ic ${f.amber ? "amber" : ""}`}>{f.ic}</span>
                <div>
                  <h3>{f.t}</h3>
                  <p className="muted small" style={{ marginTop: 4 }}>{f.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-wrap site-cta">
          <div>
            <h2 className="site-h2">Segurança desde o login</h2>
            <ul className="site-list">
              {[
                "Entrada por e-mail com código de uso único — sem senhas para vazar",
                "Contas só por convite de um administrador",
                "Papéis por squad: operador, membro ou leitor",
                "Ninguém precisa de conta no GitHub; o console usa um App da organização",
              ].map((t) => (
                <li key={t}>
                  <IconCheck size={16} /> {t}
                </li>
              ))}
            </ul>
          </div>
          <Link href={cta.href} className="btn btn-primary" style={{ height: 46, padding: "0 26px", fontSize: 15 }}>
            {cta.label}
          </Link>
        </div>
      </section>

      <footer className="site-foot">
        <div className="site-wrap spread">
          <span>© {new Date().getFullYear()} {BRAND.empresa}</span>
          <span>{BRAND.produto}</span>
        </div>
      </footer>
    </div>
  );
}
