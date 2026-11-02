import { PageHead } from "@/components/Shell";
import { NovaSquadForm, type OpcaoConexao } from "@/components/NovaSquadForm";
import Link from "next/link";
import { env } from "@/lib/env";
import { gh, listarConexoes, readFile } from "@/lib/github";
import { requireAdmin } from "@/lib/session";
import { CATALOGO_LEGADO, parseBaseTipos } from "@/lib/tipo";

/** Tipos oferecidos pelo template de cada conexão (tipos/base.yaml); template antigo só tem Data Analytics. */
async function opcoes(conexoes: { owner: string; template: string }[]): Promise<OpcaoConexao[]> {
  const cache = new Map<string, Promise<OpcaoConexao["tipos"] | null>>();
  return Promise.all(
    conexoes.map(async (c) => {
      const template = c.template || env.templateRepo;
      if (!cache.has(template)) {
        const [tOwner, tRepo] = template.split("/");
        cache.set(
          template,
          gh(c.owner)
            .then((o) => readFile(o, tOwner, tRepo, "tipos/base.yaml"))
            .then((f) => parseBaseTipos(f?.content)?.tipos ?? null)
            .catch(() => null),
        );
      }
      const tipos = await cache.get(template)!;
      return tipos
        ? { owner: c.owner, template, tipos }
        : { owner: c.owner, template, tipos: CATALOGO_LEGADO, aviso: `O template ${template} ainda não tem tipos de squad (tipos/base.yaml): só Data Analytics está disponível.` };
    }),
  );
}

export const metadata = { title: "Nova squad" };

export default async function NewSquadPage() {
  await requireAdmin();
  const conexoes = (await listarConexoes()).filter((c) => c.ativo);
  if (!conexoes.length)
    return (
      <>
        <PageHead title="Nova squad" crumbs={[{ href: "/squads", label: "Squads" }, { label: "Nova" }]} />
        <div className="content">
          <div className="card card-pad stack-sm">
            <h2>Conecte uma organização do GitHub primeiro</h2>
            <p className="muted">As squads ficam em repositórios de uma organização do GitHub. Conecte a sua ou a do cliente em Conexões.</p>
            <Link href="/admin/conexoes" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
              Abrir Conexões
            </Link>
          </div>
        </div>
      </>
    );

  return (
    <>
      <PageHead
        title="Nova squad"
        crumbs={[{ href: "/squads", label: "Squads" }, { label: "Nova" }]}
        subtitle="Escolha o tipo de squad. O console cria um repositório privado na organização escolhida, a partir do template dela, com os agentes do tipo e você como operador."
      />
      <div className="content">
        <div className="split">
          <div className="card card-pad">
            <NovaSquadForm conexoes={await opcoes(conexoes)} />
          </div>
          <div className="card card-pad stack-sm">
            <h3>Depois de criar</h3>
            <ol className="small muted" style={{ paddingLeft: 18, margin: 0 }}>
              <li>Cadastre a chave da API da Anthropic na configuração da squad.</li>
              <li>Monte a equipe: operadores, membros e leitores, por e-mail.</li>
              <li>Preencha o contexto do tipo no repositório (ex.: marca, oferta, políticas ou arquitetura em <code>docs/</code>).</li>
              <li>Se a squad usa dados, conecte a plataforma em Acesso a dados (o console testa antes de salvar).</li>
              <li>No GitHub, proteja a branch principal (ruleset) exigindo PR e a checagem do harness.</li>
              <li>Abra a primeira feature.</li>
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}
