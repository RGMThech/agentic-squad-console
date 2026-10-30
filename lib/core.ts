// Lógica pura (sem dependência de Next ou GitHub), testada em tests/core.test.ts.
import YAML from "yaml";

export type Role = "operador" | "membro" | "leitor";
export type GateState = "nao_iniciado" | "pendente" | "aguardando" | "aprovado";

export const RE_FEATURE = /^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RE_NAME = /^[A-Za-z0-9_.-]{1,100}$/;
export const RE_AGENT = /^[a-z][a-z0-9-]{1,48}$/;

// ---------- front matter ----------
export type Frontmatter = Record<string, string>;

export function parseFrontmatter(text: string): { data: Frontmatter; body: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
  if (!m) return { data: {}, body: text };
  let raw: unknown = {};
  try {
    raw = YAML.parse(m[1], { schema: "failsafe" }) ?? {};
  } catch {
    raw = {};
  }
  const data: Frontmatter = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string") data[k] = v.trim();
    }
  }
  return { data, body: m[2] };
}

/** Atualiza (ou acrescenta) chaves do front matter preservando o restante do arquivo. */
export function setFrontmatter(text: string, updates: Record<string, string>): string {
  const m = text.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!m) throw new Error("O arquivo não tem front matter (bloco --- no início).");
  let fm = m[2];
  for (const [k, v] of Object.entries(updates)) {
    const re = new RegExp(`^${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:.*$`, "m");
    fm = re.test(fm) ? fm.replace(re, `${k}: ${v}`) : `${fm}\n${k}: ${v}`;
  }
  return m[1] + fm + m[3] + text.slice(m[0].length);
}

/** Itens "- [ ]" na seção "Dúvidas abertas" (mesma regra do scripts/check_spec.py). */
export function openDoubts(body: string): string[] {
  const m = body.match(/^## *\d*\.? *Dúvidas abertas[ \t]*$([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!m) return [];
  return m[1]
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- [ ]"))
    .map((l) => l.slice(5).trim());
}

// ---------- dúvidas com respostas ----------
export type Doubt = { texto: string; resposta: string | null; autor: string | null };

const RE_SECAO_DUVIDAS = /^## *\d*\.? *Dúvidas abertas[ \t]*$/;
const RE_RESPOSTA = /^\s+- \*\*Resposta do Operador\*\*(?: \(([^)]*)\))?:\s?(.*)$/;

function secaoDuvidas(lines: string[]): [number, number] | null {
  const ini = lines.findIndex((l) => RE_SECAO_DUVIDAS.test(l));
  if (ini < 0) return null;
  let fim = lines.length;
  for (let i = ini + 1; i < lines.length; i++) if (/^## /.test(lines[i])) { fim = i; break; }
  return [ini + 1, fim];
}

/** Dúvidas da spec: abertas (com ou sem resposta do Operador) e resolvidas. */
export function parseDoubts(body: string): { abertas: Doubt[]; resolvidas: string[] } {
  const lines = body.split(/\r?\n/);
  const sec = secaoDuvidas(lines);
  const abertas: Doubt[] = [];
  const resolvidas: string[] = [];
  if (!sec) return { abertas, resolvidas };
  for (let i = sec[0]; i < sec[1]; i++) {
    const l = lines[i];
    const aberta = l.match(/^- \[ \]\s*(.*)$/);
    const fechada = l.match(/^- \[[xX]\]\s*(.*)$/);
    if (fechada) resolvidas.push(fechada[1].trim());
    if (!aberta) continue;
    let resposta: string | null = null;
    let autor: string | null = null;
    for (let j = i + 1; j < sec[1] && /^\s+\S/.test(lines[j]); j++) {
      const m = lines[j].match(RE_RESPOSTA);
      if (!m) continue;
      autor = m[1] ?? null;
      const partes = [m[2]];
      for (let k = j + 1; k < sec[1] && /^\s{4,}\S/.test(lines[k]) && !/^\s+- /.test(lines[k]); k++) partes.push(lines[k].trim());
      resposta = partes.join("\n").trim();
      break;
    }
    abertas.push({ texto: aberta[1].trim(), resposta, autor });
  }
  return { abertas, resolvidas };
}

/**
 * Grava (ou substitui, ou remove com resposta vazia) a resposta do Operador
 * logo abaixo de cada dúvida aberta indicada pelo texto. A dúvida continua
 * "- [ ]" até o analista processar; o check_spec segue bloqueando o G1.
 */
export function applyAnswers(raw: string, respostas: Map<string, string>, quem: string, data: string): { texto: string; aplicadas: number } {
  const lines = raw.split("\n");
  const sec = secaoDuvidas(lines);
  if (!sec) throw new Error('A spec não tem a seção "Dúvidas abertas".');
  const out: string[] = lines.slice(0, sec[0]);
  let aplicadas = 0;
  for (let i = sec[0]; i < sec[1]; i++) {
    const l = lines[i];
    out.push(l);
    const m = l.match(/^- \[ \]\s*(.*)$/);
    if (!m || !respostas.has(m[1].trim())) continue;
    // copia sub-itens que não são a resposta anterior
    let j = i + 1;
    while (j < sec[1] && /^\s+\S/.test(lines[j])) {
      if (RE_RESPOSTA.test(lines[j])) {
        j++;
        while (j < sec[1] && /^\s{4,}\S/.test(lines[j]) && !/^\s+- /.test(lines[j])) j++;
        continue;
      }
      out.push(lines[j]);
      j++;
    }
    const resp = (respostas.get(m[1].trim()) ?? "").replace(/\r\n/g, "\n").trim();
    if (resp) {
      const [primeira, ...resto] = resp.split("\n");
      out.push(`  - **Resposta do Operador** (${quem}, ${data}): ${primeira}`);
      for (const r of resto) out.push(r.trim() ? `    ${r.trim()}` : "");
    }
    aplicadas++;
    i = j - 1;
  }
  return { texto: out.concat(lines.slice(sec[1])).join("\n"), aplicadas };
}

// ---------- tarefas ----------
export type Task = { id: string; tarefa: string; agente: string; ciclos: string; status: string };

export function parseTasks(body: string): Task[] {
  const lines = body.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => /^\|\s*ID\s*\|/i.test(l) && /status/i.test(l));
  if (headerIdx < 0) return [];
  const header = splitRow(lines[headerIdx]).map((h) => h.toLowerCase());
  const col = (name: string) => header.findIndex((h) => h.startsWith(name));
  const iId = col("id"), iTarefa = col("tarefa"), iAgente = col("agente"), iCiclos = col("ciclos"), iStatus = col("status");
  const out: Task[] = [];
  for (const line of lines.slice(headerIdx + 2)) {
    if (!line.trim().startsWith("|")) break;
    const c = splitRow(line);
    if (!c[iId] || !/^T-\d+/i.test(c[iId])) continue;
    out.push({
      id: c[iId],
      tarefa: c[iTarefa] ?? "",
      agente: c[iAgente] ?? "",
      ciclos: iCiclos >= 0 ? c[iCiclos] ?? "" : "",
      status: (iStatus >= 0 ? c[iStatus] ?? "" : "").replace(/`/g, "").toLowerCase(),
    });
  }
  return out;
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((s) => s.trim());
}

// ---------- ids e nomes ----------
export function slugify(text: string, max = 40): string {
  const s = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return s || "feature";
}

export function nextFeatureId(existing: string[], titulo: string): string {
  const nums = existing.map((f) => parseInt(f.slice(0, 3), 10)).filter((n) => !Number.isNaN(n));
  const next = Math.max(0, ...nums) + 1;
  return `${String(next).padStart(3, "0")}-${slugify(titulo)}`;
}

export function todaySaoPaulo(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

// ---------- papéis ----------
export type Members = { operadores: string[]; membros: string[]; leitores: string[] };

export function parseMembers(text: string | null): Members {
  const empty: Members = { operadores: [], membros: [], leitores: [] };
  if (!text) return empty;
  try {
    const d = YAML.parse(text) ?? {};
    const list = (v: unknown) =>
      Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim().replace(/^@/, "").toLowerCase()).filter(Boolean))] : [];
    return { operadores: list(d.operadores), membros: list(d.membros), leitores: list(d.leitores) };
  } catch {
    return empty;
  }
}

/**
 * Papel de um usuário do console numa squad. Administradores do console são
 * operadores em todas as squads. Quem não está listado não tem acesso (null).
 */
export function resolveRole(email: string, members: Members, isAdmin: boolean): Role | null {
  if (isAdmin) return "operador";
  const e = email.trim().toLowerCase();
  if (members.operadores.includes(e)) return "operador";
  if (members.membros.includes(e)) return "membro";
  if (members.leitores.includes(e)) return "leitor";
  return null;
}

/** Reescreve .squad/members.yaml a partir das listas (mantém o cabeçalho explicativo). */
export function serializeMembers(m: Members): string {
  const lista = (xs: string[]) => (xs.length ? "\n" + xs.map((x) => `  - ${x}`).join("\n") : " []");
  return `# Papéis na squad. Use e-mails (contas do Squad Console) ou logins do GitHub.
# O Squad Console administra este arquivo em Configuração → Equipe e papéis.
#
# operadores: aprovam gates G1/G2/G3, fazem merge, alteram configuração e segredos
# membros:    abrem pedidos e acionam agentes
# leitores:   só visualizam
#
# Se a lista de operadores estiver vazia, administradores do console atuam como operadores.
operadores:${lista(m.operadores)}
membros:${lista(m.membros)}
leitores:${lista(m.leitores)}
`;
}

/** Coloca (ou tira, com role=null) um e-mail em exatamente uma lista. */
export function setMemberRole(m: Members, email: string, role: Role | null): Members {
  const e = email.trim().toLowerCase();
  const sem = (xs: string[]) => xs.filter((x) => x !== e);
  const out: Members = { operadores: sem(m.operadores), membros: sem(m.membros), leitores: sem(m.leitores) };
  if (role === "operador") out.operadores.push(e);
  if (role === "membro") out.membros.push(e);
  if (role === "leitor") out.leitores.push(e);
  return out;
}

export function can(role: Role, action: "ver" | "acionar" | "aprovar" | "configurar"): boolean {
  if (action === "ver") return true;
  if (action === "acionar") return role === "operador" || role === "membro";
  return role === "operador";
}

// ---------- execuções ----------
export type RunRecord = {
  run_id: string;
  run_url?: string;
  agente: string;
  feature: string;
  ator: string;
  modelo?: string;
  status: string;
  custo_usd: number;
  turnos?: number | null;
  duracao_ms?: number | null;
  validadores?: string;
  ts?: number;
};

export function parseRunRecords(body: string): RunRecord[] {
  const out: RunRecord[] = [];
  for (const m of body.matchAll(/<!--\s*squad-run\s+(\{[\s\S]*?\})\s*-->/g)) {
    try {
      const r = JSON.parse(m[1]);
      if (r && r.run_id) out.push({ ...r, run_id: String(r.run_id), custo_usd: Number(r.custo_usd) || 0 });
    } catch {
      /* comentário malformado: ignora */
    }
  }
  return out;
}

export function parseRunTitle(title: string): { agente: string; feature: string; ator: string } | null {
  const parts = title.split(" · ").map((s) => s.trim());
  if (parts.length < 3) return null;
  return { agente: parts[0], feature: parts[1], ator: parts[2].replace(/^@/, "") };
}

// ---------- gates ----------
export type GateInput = {
  specStatus?: string;
  designStatus?: string;
  qaVeredito?: string;
  hasReview: boolean;
  prState?: "open" | "closed" | "merged";
  onMainOnly: boolean;
};

export function computeGates(i: GateInput): { g1: GateState; g2: GateState; g3: GateState } {
  if (i.onMainOnly || i.prState === "merged") return { g1: "aprovado", g2: "aprovado", g3: "aprovado" };
  const g1: GateState = !i.specStatus ? "pendente" : i.specStatus === "aprovado" ? "aprovado" : "aguardando";
  let g2: GateState = "nao_iniciado";
  if (g1 === "aprovado") g2 = !i.designStatus ? "pendente" : i.designStatus === "aprovado" ? "aprovado" : "aguardando";
  let g3: GateState = "nao_iniciado";
  if (g2 === "aprovado") {
    const pronto = i.prState === "open" && i.hasReview && (i.qaVeredito ?? "").toUpperCase().startsWith("APROVADO");
    g3 = pronto ? "aguardando" : "pendente";
  }
  return { g1, g2, g3 };
}

/** Próximo agente sugerido e instrução padrão para o estado atual. */
export function nextStep(g: { g1: GateState; g2: GateState; g3: GateState }, feature: string) {
  if (g.g1 === "pendente")
    return { agente: "analista-requisitos", instrucao: `Crie a spec da feature ${feature} a partir do pedido registrado.` };
  if (g.g1 === "aguardando")
    return { agente: "analista-requisitos", instrucao: "Incorpore as respostas e ajustes do Operador na spec." };
  if (g.g2 === "pendente")
    return { agente: "arquiteto-dados", instrucao: `A spec de ${feature} foi aprovada (G1). Produza o design.md, os contratos e os ADRs necessários.` };
  if (g.g2 === "aguardando")
    return { agente: "arquiteto-dados", instrucao: "Incorpore os ajustes do Operador no design." };
  if (g.g3 === "pendente")
    return { agente: "orquestrador", instrucao: `Spec e design de ${feature} aprovados (G1 e G2). Execute a feature até deixar o G3 pronto: tasks, implementação, QA, revisão e documentação.` };
  return { agente: "orquestrador", instrucao: "Trate os pontos levantados pelo Operador antes do G3." };
}

export const AGENTES_PADRAO = [
  "analista-requisitos",
  "arquiteto-dados",
  "orquestrador",
  "eng-ingestao",
  "eng-transformacao",
  "qa-data-quality",
  "analytics-bi",
  "revisor",
  "governanca-docs",
];

// ---------- caminhos editáveis na configuração ----------
export const CONFIG_PATHS: RegExp[] = [
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/,
  /^\.squad\/(squad|members)\.yaml$/,
  /^\.claude\/agents\/[a-z][a-z0-9-]*\.md$/,
  /^\.claude\/skills\/[a-z][a-z0-9-]*\/SKILL\.md$/,
  /^docs\/naming-convention\.md$/,
];

export function isEditablePath(p: string): boolean {
  return CONFIG_PATHS.some((re) => re.test(p));
}

/** Validação mínima de conteúdo antes de abrir PR de configuração. Retorna mensagem de erro ou null. */
export function validateConfigContent(path: string, content: string): string | null {
  if (!content.trim()) return "O arquivo não pode ficar vazio.";
  if (path.endsWith(".yaml")) {
    try {
      const d = YAML.parse(content);
      if (path.endsWith("members.yaml")) {
        for (const k of ["operadores", "membros", "leitores"]) {
          if (d?.[k] != null && !Array.isArray(d[k])) return `"${k}" precisa ser uma lista.`;
        }
        if (!Array.isArray(d?.operadores) || d.operadores.length === 0) return "Mantenha pelo menos um operador.";
      }
    } catch (e) {
      return `YAML inválido: ${(e as Error).message.split("\n")[0]}`;
    }
  }
  const agent = path.match(/^\.claude\/agents\/([a-z][a-z0-9-]*)\.md$/);
  if (agent) {
    const { data } = parseFrontmatter(content);
    if (data.name !== agent[1]) return `O campo "name" do front matter deve ser "${agent[1]}".`;
    if (!data.description) return 'Inclua "description" no front matter.';
    if (!data.tools) return 'Inclua "tools" no front matter (ex.: Read, Grep, Glob).';
  }
  const skill = path.match(/^\.claude\/skills\/([a-z][a-z0-9-]*)\/SKILL\.md$/);
  if (skill) {
    const { data } = parseFrontmatter(content);
    if (!data.name || !data.description) return 'Skill precisa de "name" e "description" no front matter.';
  }
  return null;
}

export function agentTemplate(name: string): string {
  return `---
name: ${name}
description: <quando usar este agente, em uma frase>
tools: Read, Grep, Glob, Write, Edit
---

Você é o agente **${name}**. Leia \`AGENTS.md\` antes de tudo.

## Missão
<o que este agente entrega>

## Procedimento
1. ...

## Regras
- Nunca aprove gates.
`;
}

// ---------- situação da feature: em execução, precisa de você, falhou ou entregue ----------

export type SituacaoTipo = "rodando" | "voce" | "erro" | "entregue";
export type SituacaoAcao = "responder" | "enviar_respostas" | "g1" | "g2" | "g3" | "acionar" | "aguardar" | "ver_entrega";

export type Situacao = {
  tipo: SituacaoTipo;
  titulo: string;
  detalhe: string;
  acao: SituacaoAcao;
  agente?: string;
  instrucao?: string;
};

export type SituacaoInput = {
  feature: string;
  gates: { g1: GateState; g2: GateState; g3: GateState };
  duvidasSemResposta: number;
  duvidasTotal: number;
  rodando: { agente: string; desde: string; fila: boolean } | null;
  ultima: { agente: string; ok: boolean; resumo: string } | null;
  tarefas: { status: string }[];
};

const RE_BLOQUEIO = /decis[aã]o necess[aá]ria|bloquead|para destravar|preciso que (voc[eê]|o operador)|aguardando (o )?operador|precisa(mos)? do operador|o que preciso/i;

/** Uma frase para cada estado: ninguém fica sem saber se a squad está trabalhando ou esperando. */
export function situacao(i: SituacaoInput): Situacao {
  const g = i.gates;
  if (g.g3 === "aprovado")
    return { tipo: "entregue", titulo: "Entregue", detalhe: "O PR foi mesclado na branch principal. Veja tudo o que foi construído e baixe os documentos na aba Entrega.", acao: "ver_entrega" };
  if (i.rodando) {
    return {
      tipo: "rodando",
      titulo: i.rodando.fila ? `${i.rodando.agente} na fila do GitHub` : `${i.rodando.agente} trabalhando`,
      detalhe: i.rodando.fila
        ? "A execução começa em instantes. Você não precisa fazer nada; esta página atualiza sozinha."
        : "Você não precisa fazer nada agora. Esta página atualiza sozinha e avisa quando for a sua vez.",
      acao: "aguardar",
      agente: i.rodando.agente,
    };
  }
  if (i.ultima && !i.ultima.ok)
    return {
      tipo: "erro",
      titulo: `A última execução do ${i.ultima.agente} falhou`,
      detalhe: "Nada está rodando. Veja o motivo nos logs e acione o agente de novo (ajuste a instrução se for preciso).",
      acao: "acionar",
      agente: i.ultima.agente,
    };
  if (g.g1 === "aguardando") {
    if (i.duvidasSemResposta > 0)
      return { tipo: "voce", titulo: `Responda ${i.duvidasSemResposta} dúvida(s) da spec`, detalhe: "O analista parou esperando suas respostas. Responda abaixo e envie ao analista.", acao: "responder" };
    if (i.duvidasTotal > 0)
      return { tipo: "voce", titulo: "Envie as respostas ao analista", detalhe: "Todas as dúvidas têm resposta. Envie para o analista incorporá-las na spec.", acao: "enviar_respostas" };
    return { tipo: "voce", titulo: "Aprove a spec (G1)", detalhe: "A spec está pronta e sem dúvidas. Revise e aprove, ou peça ajustes.", acao: "g1" };
  }
  if (g.g2 === "aguardando")
    return { tipo: "voce", titulo: "Aprove o design (G2)", detalhe: "O arquiteto terminou. Revise o design e aprove, ou peça ajustes.", acao: "g2" };
  if (g.g3 === "aguardando")
    return { tipo: "voce", titulo: "Aprove a produção (G3)", detalhe: "QA e revisor aprovaram. Aprovar mescla o PR na branch principal.", acao: "g3" };

  const passo = nextStep(g, i.feature);
  const bloqueadas = i.tarefas.filter((t) => t.status === "bloqueado").length;
  const andando = i.tarefas.filter((t) => ["em_andamento", "em_qa", "pendente", "reprovado"].includes(t.status)).length;
  if (i.ultima && (RE_BLOQUEIO.test(i.ultima.resumo) || (bloqueadas > 0 && andando === 0)))
    return {
      tipo: "voce",
      titulo: "A squad está bloqueada e precisa de você",
      detalhe: `O ${i.ultima.agente} parou e pediu uma decisão ou um acesso. Leia a mensagem abaixo, resolva o que ele pede e acione de novo, explicando o que mudou.`,
      acao: "acionar",
      agente: passo.agente,
      instrucao: "Resolvi as pendências: <descreva aqui o que você fez ou decidiu>. Continue a partir de onde parou.",
    };
  if (g.g1 === "pendente")
    return { tipo: "voce", titulo: "Acione o analista para escrever a spec", detalhe: "Nada está rodando e a spec ainda não existe.", acao: "acionar", ...passo };
  if (g.g2 === "pendente")
    return { tipo: "voce", titulo: "Acione o arquiteto", detalhe: "A spec foi aprovada (G1), mas o design ainda não foi feito e nada está rodando.", acao: "acionar", ...passo };
  const feitas = i.tarefas.filter((t) => t.status === "aprovado").length;
  return {
    tipo: "voce",
    titulo: "Parada: acione o orquestrador para continuar",
    detalhe: i.ultima
      ? `O ${i.ultima.agente} terminou a execução, mas o G3 ainda não está pronto${i.tarefas.length ? ` (${feitas} de ${i.tarefas.length} tarefas aprovadas)` : ""}. Cada execução tem limite de turnos; acione de novo para seguir.`
      : "Spec e design aprovados. Nada está rodando: acione o orquestrador para implementar.",
    acao: "acionar",
    ...passo,
  };
}

/** Texto do comentário de execução sem o cabeçalho técnico: o que o agente disse ao Operador. */
export function resumoExecucao(body: string): string {
  return body
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .filter((l) => !/^#{1,6}\s/.test(l) && !/^\*\*Acionado por/.test(l))
    .map((l) => l.replace(/^>\s?/, ""))
    .join("\n")
    .trim();
}
