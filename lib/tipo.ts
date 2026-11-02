import YAML from "yaml";

/** Tipo de squad (dados, software, marketing…), lido de .squad/tipo.yaml. Sem tipo.yaml, vale o tipo dados. */

export type Papeis = { especificacao: string; design: string; orquestracao: string; documentacao: string };
export type Pasta = { prefixo: string; rotulo: string };
export type TipoSquad = {
  tipo: string;
  nome: string;
  rotulos: { g1: string; g2: string; g3: string };
  papeis: Papeis;
  pastas: Pasta[];
};

export const TIPO_PADRAO: TipoSquad = {
  tipo: "dados",
  nome: "Data Analytics",
  rotulos: { g1: "Spec", g2: "Design", g3: "Produção" },
  papeis: { especificacao: "analista-requisitos", design: "arquiteto-dados", orquestracao: "orquestrador", documentacao: "governanca-docs" },
  pastas: [
    { prefixo: "contracts/", rotulo: "Contratos de dados" },
    { prefixo: "pipelines/", rotulo: "Pipelines" },
    { prefixo: "semantic/", rotulo: "Camada semântica" },
    { prefixo: "tests/", rotulo: "Testes" },
    { prefixo: "docs/", rotulo: "Documentação e ADRs" },
  ],
};

/** Nome e ícone dos tipos conhecidos, para quando o catálogo do template não está à mão (ex.: lista de squads). */
export const TIPOS_CONHECIDOS: Record<string, { nome: string; icone: string }> = {
  dados: { nome: "Data Analytics", icone: "chart" },
  software: { nome: "Desenvolvimento de Software", icone: "code" },
  marketing: { nome: "Marketing", icone: "megaphone" },
  produto: { nome: "Produto", icone: "compass" },
  "ia-ml": { nome: "IA e Machine Learning", icone: "brain" },
  vendas: { nome: "Vendas e pré-vendas", icone: "handshake" },
  atendimento: { nome: "Atendimento / CX", icone: "headset" },
};

const RE_AGENTE = /^[a-z][a-z0-9-]{1,48}$/;
const RE_TIPO = /^[a-z][a-z0-9-]{1,30}$/;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function texto(v: unknown, padrao: string, max = 60): string {
  const s = typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
  return s ? s.slice(0, max) : padrao;
}

export function parseTipo(text: string | null | undefined): TipoSquad {
  let d: Record<string, unknown> = {};
  try {
    d = obj(text ? YAML.parse(text) : {});
  } catch {
    return TIPO_PADRAO;
  }
  if (!Object.keys(d).length) return TIPO_PADRAO;
  const tipo = RE_TIPO.test(String(d.tipo ?? "")) ? String(d.tipo) : TIPO_PADRAO.tipo;
  const r = obj(d.rotulos);
  const p = obj(d.papeis);
  const agente = (v: unknown, padrao: string) => (RE_AGENTE.test(String(v ?? "")) ? String(v) : padrao);
  const pastasYaml = obj(obj(d.entrega).pastas);
  const pastas = Object.entries(pastasYaml)
    .filter(([k]) => /^[\w.-]+(\/[\w.-]+)*\/?$/.test(k))
    .map(([k, v]) => ({ prefixo: k.endsWith("/") ? k : `${k}/`, rotulo: texto(v, k, 80) }));
  return {
    tipo,
    nome: texto(d.nome, TIPOS_CONHECIDOS[tipo]?.nome ?? tipo, 80),
    rotulos: { g1: texto(r.g1, TIPO_PADRAO.rotulos.g1, 30), g2: texto(r.g2, TIPO_PADRAO.rotulos.g2, 30), g3: texto(r.g3, TIPO_PADRAO.rotulos.g3, 30) },
    papeis: {
      especificacao: agente(p.especificacao, TIPO_PADRAO.papeis.especificacao),
      design: agente(p.design, TIPO_PADRAO.papeis.design),
      orquestracao: agente(p.orquestracao, TIPO_PADRAO.papeis.orquestracao),
      documentacao: agente(p.documentacao, TIPO_PADRAO.papeis.documentacao),
    },
    pastas: pastas.length ? pastas : tipo === TIPO_PADRAO.tipo ? TIPO_PADRAO.pastas : [{ prefixo: "docs/", rotulo: "Documentação" }],
  };
}

// ---------- catálogo do template (tipos/base.yaml) ----------

export type TipoCatalogo = { id: string; nome: string; descricao: string; icone: string };
export type BaseTipos = { padrao: string; tipos: TipoCatalogo[]; especificoDoPadrao: string[] };

export function parseBaseTipos(text: string | null | undefined): BaseTipos | null {
  if (!text) return null;
  let d: Record<string, unknown>;
  try {
    d = obj(YAML.parse(text));
  } catch {
    return null;
  }
  const tipos = Object.entries(obj(d.tipos))
    .filter(([id]) => RE_TIPO.test(id))
    .map(([id, v]) => {
      const t = obj(v);
      return { id, nome: texto(t.nome, TIPOS_CONHECIDOS[id]?.nome ?? id, 80), descricao: texto(t.descricao, "", 300), icone: texto(t.icone, TIPOS_CONHECIDOS[id]?.icone ?? "layers", 20) };
    });
  const padrao = String(d.padrao ?? "");
  if (!tipos.length || !tipos.some((t) => t.id === padrao)) return null;
  const especificoDoPadrao = Array.isArray(d.especifico_do_padrao) ? d.especifico_do_padrao.map(String) : [];
  return { padrao, tipos, especificoDoPadrao };
}

/** Catálogo de quando o template não tem tipos/base.yaml: só o tipo dados. */
export const CATALOGO_LEGADO: TipoCatalogo[] = [
  { id: "dados", nome: "Data Analytics", descricao: "Pipelines, modelos de dados, métricas e painéis, do pedido de negócio à tabela em produção.", icone: "chart" },
];

function casa(path: string, padroes: string[]): boolean {
  return padroes.some((p) => path === p || (p.endsWith("/**") && path.startsWith(p.slice(0, -2))));
}

/**
 * O que muda no repositório recém-criado para virar uma squad do tipo escolhido
 * (mesma regra de scripts/instanciar_tipo.py do template):
 * apaga tipos/, apaga os arquivos específicos do tipo padrão e copia tipos/<tipo>/ por cima da raiz.
 */
export function planejarTipo(paths: string[], base: BaseTipos, tipo: string): { apagar: string[]; copiar: Record<string, string> } {
  if (!base.tipos.some((t) => t.id === tipo)) throw new Error(`Tipo de squad desconhecido: ${tipo}.`);
  let apagar = paths.filter((p) => p.startsWith("tipos/"));
  const copiar: Record<string, string> = {};
  if (tipo !== base.padrao) {
    apagar = apagar.concat(paths.filter((p) => !p.startsWith("tipos/") && casa(p, base.especificoDoPadrao)));
    const prefixo = `tipos/${tipo}/`;
    for (const p of paths) if (p.startsWith(prefixo)) copiar[p.slice(prefixo.length)] = p;
    apagar = apagar.filter((p) => !(p in copiar));
  }
  return { apagar: [...new Set(apagar)].sort(), copiar };
}

// ---------- tipo nos tópicos do repositório (lista de squads sem ler arquivos) ----------

export const PREFIXO_TOPICO = "squad-tipo-";

export function topicoDoTipo(tipo: string): string {
  return `${PREFIXO_TOPICO}${tipo}`;
}

/** Tipo pelos tópicos do repositório; squads antigas (sem tópico de tipo) são de dados. */
export function tipoDosTopicos(topics: string[] | null | undefined): string {
  const t = (topics ?? []).find((x) => x.startsWith(PREFIXO_TOPICO));
  return t ? t.slice(PREFIXO_TOPICO.length) : TIPO_PADRAO.tipo;
}

export function nomeDoTipo(tipo: string): string {
  return TIPOS_CONHECIDOS[tipo]?.nome ?? tipo;
}

// ---------- formulário de nova feature: rótulos e exemplos por tipo ----------

export type CampoPedido = { rotulo: string; exemplo: string };
export type DicasPedido = {
  titulo: string;
  problema: string;
  publico: string;
  decisao: CampoPedido;
  fontes: CampoPedido;
  sla: string;
};

const DICAS: Record<string, DicasPedido> = {
  dados: {
    titulo: "Inadimplência mensal por carteira",
    problema: "O que está doendo hoje? Que decisão está difícil de tomar?",
    publico: "Diretoria de Risco, analistas de cobrança",
    decisao: { rotulo: "Decisão que será tomada", exemplo: "Priorizar carteiras para renegociação" },
    fontes: { rotulo: "Fontes que você conhece", exemplo: "Core de crédito, tabela de contratos" },
    sla: "D-1 até 07:00",
  },
  software: {
    titulo: "Pagamento com Pix no checkout",
    problema: "O que o usuário não consegue fazer hoje? Que problema isso causa?",
    publico: "Clientes do e-commerce, time financeiro",
    decisao: { rotulo: "Resultado esperado", exemplo: "Reduzir abandono no pagamento" },
    fontes: { rotulo: "Sistemas e referências", exemplo: "API de pagamentos, tela de checkout, gateway X" },
    sla: "Até a release de dezembro",
  },
  marketing: {
    titulo: "Lançamento do plano anual",
    problema: "O que a campanha precisa provocar? Para quem? Por que agora?",
    publico: "Pequenas empresas que já testaram o produto",
    decisao: { rotulo: "Meta", exemplo: "300 leads qualificados em 30 dias" },
    fontes: { rotulo: "Canais e materiais de referência", exemplo: "LinkedIn, e-mail, blog; campanha de 2025" },
    sla: "Publicar até 15/11",
  },
  produto: {
    titulo: "Abandono no cadastro",
    problema: "Que problema do usuário ou do negócio precisa ser entendido? Que evidências existem?",
    publico: "Novos usuários do app",
    decisao: { rotulo: "Decisão que o discovery apoia", exemplo: "Reformular ou não o cadastro no próximo trimestre" },
    fontes: { rotulo: "Evidências e referências", exemplo: "Funil do app, tickets de suporte, pesquisa de 2025" },
    sla: "Backlog pronto até o planejamento do trimestre",
  },
  "ia-ml": {
    titulo: "Assistente de dúvidas do RH",
    problema: "Que tarefa a IA vai apoiar? O que acontece quando ela erra?",
    publico: "Colaboradores, time de RH",
    decisao: { rotulo: "Métrica de sucesso", exemplo: "80% das perguntas respondidas com a fonte correta" },
    fontes: { rotulo: "Dados e documentos disponíveis", exemplo: "Políticas internas em PDF, histórico de chamados" },
    sla: "Piloto em 6 semanas",
  },
  vendas: {
    titulo: "Prospecção de indústrias de médio porte",
    problema: "O que vender, para quem e por que agora?",
    publico: "Diretores de operações de indústrias de 200 a 1000 funcionários",
    decisao: { rotulo: "Meta comercial", exemplo: "40 reuniões qualificadas no trimestre" },
    fontes: { rotulo: "Oferta e materiais existentes", exemplo: "Apresentação institucional, casos autorizados" },
    sla: "Cadência pronta até 10/11",
  },
  atendimento: {
    titulo: "Segunda via de boleto no WhatsApp",
    problema: "Qual dor do cliente ou do time de atendimento? Qual o volume?",
    publico: "Clientes pessoa física, time de atendimento",
    decisao: { rotulo: "Indicador a melhorar", exemplo: "Resolver 60% no autoatendimento" },
    fontes: { rotulo: "Canais, políticas e dados", exemplo: "Relatório de motivos de contato, política de cobrança" },
    sla: "No ar antes do pico de dezembro",
  },
};

export function dicasPedido(tipo: string): DicasPedido {
  return DICAS[tipo] ?? DICAS.dados;
}

/** Documentos de contexto que o Operador preenche em cada tipo (editáveis em Configuração). */
export const DOCS_DO_TIPO: Record<string, [string, string][]> = {
  dados: [["docs/naming-convention.md", "Convenção de nomes completa"]],
  software: [["docs/arquitetura.md", "Stack, componentes e padrões do sistema"]],
  marketing: [["docs/marca.md", "Voz da marca, termos e promessas proibidos"]],
  produto: [["docs/produto.md", "Visão, personas, métricas e roadmap"]],
  "ia-ml": [],
  vendas: [["docs/oferta.md", "Produtos, preços de referência, casos autorizados e promessas proibidas"]],
  atendimento: [["docs/politicas.md", "Tom, SLAs, trocas, reembolsos e quando escalar"]],
};
