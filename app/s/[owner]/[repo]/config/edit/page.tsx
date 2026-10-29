import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { Markdown } from "@/components/Markdown";
import { PageHead } from "@/components/Shell";
import { saveConfigFile } from "@/lib/actions";
import { agentTemplate, can, isEditablePath, parseFrontmatter } from "@/lib/core";
import { readFile } from "@/lib/github";
import { getSquad, type SquadParams } from "@/lib/page";

export const metadata = { title: "Editar configuração" };

const DICAS: Record<string, string> = {
  ".squad/members.yaml": "Listas de logins do GitHub. Operadores aprovam gates; membros abrem pedidos e acionam agentes; leitores só visualizam. A pessoa também precisa ter acesso ao repositório no GitHub.",
  ".squad/squad.yaml": "modelo: sonnet | opus | haiku · max_turnos limita cada execução · alerta_custo_usd destaca execuções caras.",
  "AGENTS.md": "Toda execução de agente lê este arquivo primeiro. Mudanças aqui mudam o comportamento da squad inteira.",
};

export default async function EditConfig({ params, searchParams }: { params: SquadParams; searchParams: Promise<{ path?: string; novo?: string }> }) {
  const { owner, repo } = await params;
  const { path = "", novo } = await searchParams;
  if (!isEditablePath(path)) notFound();
  const ctx = await getSquad(owner, repo);
  const b = `/s/${owner}/${repo}`;
  const operador = can(ctx.role, "configurar");

  const atual = await readFile(ctx.o, owner, repo, path, ctx.defaultBranch);
  const agente = path.match(/^\.claude\/agents\/([a-z][a-z0-9-]*)\.md$/);
  if (!atual && !(novo && agente)) notFound();
  const conteudo = atual?.content ?? (agente ? agentTemplate(agente[1]) : "");
  const dica = DICAS[path] ?? (agente ? "Front matter: name (igual ao nome do arquivo), description (quando usar) e tools (ferramentas permitidas, separadas por vírgula)." : "");

  return (
    <>
      <PageHead
        title={<span className="mono" style={{ fontSize: 20 }}>{path}</span>}
        crumbs={[{ href: b, label: ctx.config.nome || repo }, { href: `${b}/config`, label: "Configuração" }, { label: atual ? "Editar" : "Novo" }]}
        subtitle={dica}
      />
      <div className="content">
        {operador ? (
          <div className="card card-pad">
            <ActionForm action={saveConfigFile} submit="Salvar como Pull Request" pending="Abrindo PR…">
              <input type="hidden" name="owner" value={owner} />
              <input type="hidden" name="repo" value={repo} />
              <input type="hidden" name="path" value={path} />
              <textarea name="content" className="textarea code-editor" defaultValue={conteudo} spellCheck={false} aria-label="Conteúdo do arquivo" />
              <div className="grid grid-2">
                <div className="field">
                  <label htmlFor="motivo">Descrição da alteração</label>
                  <input id="motivo" name="motivo" className="input" placeholder={atual ? `atualiza ${path}` : `cria ${path}`} />
                </div>
                <div className="field" style={{ justifyContent: "flex-end" }}>
                  <label className="check">
                    <input type="checkbox" name="aplicar" /> Aplicar imediatamente (mesclar o PR se a branch permitir)
                  </label>
                </div>
              </div>
            </ActionForm>
          </div>
        ) : (
          <div className="card card-pad">
            {path.endsWith(".md") ? <Markdown>{parseFrontmatter(conteudo).body}</Markdown> : <pre className="mono small">{conteudo}</pre>}
          </div>
        )}
      </div>
    </>
  );
}
