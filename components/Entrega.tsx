import { arquivosDaFeature, completarLocais, lerBytes, objetosDosContratos, refDaFeature, ROTULO_CATEGORIA, type ArquivoEntrega, type Categoria } from "@/lib/entrega";
import type { Feature, SquadContext } from "@/lib/squad";
import { IconExternal, IconFile } from "./Icons";
import { Markdown } from "./Markdown";

function Baixar({ base, a }: { base: string; a: ArquivoEntrega }) {
  const u = (formato: string) => `${base}?arquivo=${encodeURIComponent(a.path)}&formato=${formato}`;
  return (
    <span className="baixar">
      {a.texto ? (
        <>
          <a href={u("pdf")} download>PDF</a>
          <a href={u("docx")} download>DOCX</a>
          <a href={u("txt")} download>TXT</a>
          <a href={u("original")} download title="Arquivo como está no repositório">original</a>
        </>
      ) : (
        <a href={u("original")} download>baixar</a>
      )}
      <a href={a.url} target="_blank" rel="noreferrer" title="Abrir no GitHub" aria-label={`Abrir ${a.path} no GitHub`}>
        <IconExternal size={13} />
      </a>
    </span>
  );
}

/** Tudo o que a feature entregou: objetos na plataforma, documentos e arquivos, com download. */
export async function EntregaView({ ctx, f, base }: { ctx: SquadContext; f: Feature; base: string }) {
  const arquivos = await arquivosDaFeature(ctx, f);
  const ref = refDaFeature(ctx, f);
  const contratos = await Promise.all(
    arquivos.filter((a) => a.categoria === "contratos" && /\.ya?ml$/.test(a.path)).map(async (a) => ({ path: a.path, texto: ((await lerBytes(ctx, a.path, ref)) ?? Buffer.alloc(0)).toString("utf8") })),
  );
  const objetos = completarLocais(objetosDosContratos(contratos), f.entrega?.body);
  const grupos = (Object.keys(ROTULO_CATEGORIA) as Categoria[]).map((c) => ({ c, itens: arquivos.filter((a) => a.categoria === c) })).filter((g) => g.itens.length);
  const entregue = f.gates.g3 === "aprovado";
  const contratoUrl = (p: string) => arquivos.find((a) => a.path === p)?.url;

  return (
    <div className="card-pad stack entrega">
      <div className="entrega-top">
        <div>
          <h3>{entregue ? "Tudo o que foi entregue" : "O que a feature já produziu"}</h3>
          <p className="small muted">
            {arquivos.length} arquivo(s){objetos.length ? ` · ${objetos.length} objeto(s) na plataforma` : ""}
            {entregue ? " · versão mesclada na branch principal" : ` · em andamento na branch ${f.branch}`}
          </p>
        </div>
        <div className="row entrega-acoes">
          <a className="btn btn-primary" href={`${base}?pacote=zip`} download>
            Baixar tudo (.zip)
          </a>
          <a className="btn" href={`${base}?dossie=pdf`} download>
            Dossiê PDF
          </a>
          <a className="btn" href={`${base}?dossie=docx`} download>
            Dossiê DOCX
          </a>
        </div>
      </div>
      <p className="xs muted">
        O dossiê junta pedido, spec, design, tarefas, QA, revisão, entrega e documentação num arquivo só. O .zip traz o dossiê, cada documento em PDF, DOCX, TXT e MD e
        todos os arquivos (pipelines, contratos, testes) como estão no repositório.
      </p>

      <section className="stack-sm">
        <h3>Objetos na plataforma</h3>
        {objetos.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Objeto</th>
                  <th>Camada</th>
                  <th>Onde está</th>
                  <th className="num">Colunas</th>
                  <th className="num">PII</th>
                  <th>Contrato</th>
                </tr>
              </thead>
              <tbody>
                {objetos.map((o) => (
                  <tr key={o.contrato}>
                    <td>
                      <span className="mono xs">{o.objeto}</span>
                      {o.descricao && <div className="xs muted">{o.descricao}</div>}
                    </td>
                    <td>
                      <span className={`badge camada-${o.camada}`}>{o.camada || "—"}</span>
                    </td>
                    <td className="mono xs">{o.local ?? <span className="muted">ver entrega.md</span>}</td>
                    <td className="num">{o.colunas}</td>
                    <td className="num">{o.pii ? <span className="badge badge-amber">{o.pii}</span> : "0"}</td>
                    <td className="xs">
                      <a href={contratoUrl(o.contrato)} target="_blank" rel="noreferrer">
                        {o.contrato.split("/").pop()}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="small muted">Nenhum contrato de dados nesta feature ainda. Os objetos aparecem aqui quando o arquiteto cria os contratos.</p>
        )}
      </section>

      {f.entrega ? (
        <details className="entrega-md" open={entregue}>
          <summary>
            <b>Relatório de entrega</b> <span className="xs muted">(entrega.md, gerado pela governança)</span>
          </summary>
          <Markdown>{f.entrega.body}</Markdown>
        </details>
      ) : (
        <p className="xs muted">
          O relatório de entrega (<span className="mono">entrega.md</span>) é gerado pelo agente de governança no fim da feature, com o local de cada objeto e como executar.
        </p>
      )}

      {grupos.map((g) => (
        <section key={g.c} className="stack-sm">
          <h3>
            {ROTULO_CATEGORIA[g.c]} <span className="badge">{g.itens.length}</span>
          </h3>
          <ul className="arquivos">
            {g.itens.map((a) => (
              <li key={a.path}>
                <IconFile size={15} />
                <div className="arquivo-nome">
                  <b>{a.nome}</b>
                  <span className="mono xs muted">{a.path}</span>
                </div>
                {a.camada && <span className={`badge camada-${a.camada}`}>{a.camada}</span>}
                <span className={`badge ${a.status === "novo" ? "badge-green" : ""}`}>{a.status}</span>
                <Baixar base={base} a={a} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
