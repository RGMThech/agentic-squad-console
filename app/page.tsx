import { redirect } from "next/navigation";
import { IconBot, IconCoins, IconGate, IconGithub, IconLayers, IconSettings } from "@/components/Icons";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Landing({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (await currentUser()) redirect("/squads");
  const { erro } = await searchParams;

  return (
    <div className="landing">
      <section className="landing-hero">
        <div className="row" style={{ gap: 12 }}>
          <span className="brand-mark">
            <IconLayers size={19} />
          </span>
          <div>
            <div className="brand-name">Squad Console</div>
            <div className="brand-sub">NTT DATA · DATA &amp; AI</div>
          </div>
        </div>

        <h1>Um humano no comando. Uma squad inteira de agentes entregando dados.</h1>
        <p className="lead">
          Abra pedidos, acompanhe os agentes trabalhando e aprove os três gates — spec, design e produção — sem sair daqui.
        </p>

        <div className="stack-sm" style={{ marginTop: 32, maxWidth: 420 }}>
          {erro && <div className="alert alert-error">{erro}</div>}
          <div>
            <a className="btn btn-github" href="/api/auth/login">
              <IconGithub size={20} /> Entrar com GitHub
            </a>
          </div>
          <p className="small" style={{ color: "#7d8fb0" }}>
            O acesso segue as permissões do GitHub: você só vê as squads às quais já tem acesso.
          </p>
        </div>

        <div className="foot">Spec-Driven Development + Harness Engineering</div>
      </section>

      <aside className="landing-side" aria-label="Recursos">
        {[
          { ic: <IconGate size={20} />, amber: true, t: "Gates na sua mão", d: "G1, G2 e G3 aprovados em um clique — com bloqueio quando a spec ainda tem dúvidas abertas." },
          { ic: <IconBot size={20} />, t: "Nove agentes sob demanda", d: "Cada pedido vira uma execução no GitHub Actions, com escopo e ferramentas restritos por papel." },
          { ic: <IconCoins size={20} />, t: "Custo de cada execução", d: "Turnos, duração e custo em dólar por agente, por feature e por mês." },
          { ic: <IconSettings size={20} />, t: "Squad configurável", d: "Equipe, papéis, agentes, constituição e chave da API — toda mudança vira um Pull Request." },
        ].map((f) => (
          <div key={f.t} className="landing-feature">
            <span className={`ic ${f.amber ? "amber" : ""}`}>{f.ic}</span>
            <div>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}
