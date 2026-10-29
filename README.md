# Squad Console

Console web para **configurar e operar squads agênticas de Data Analytics**, onde um único humano (o Operador) comanda uma squad inteira de agentes.

Funciona junto com o template [`agentic-data-squad`](https://github.com/mellrodrigo/agentic-data-squad).

## O que dá para fazer

| Área | Recursos |
|------|----------|
| **Squads** | Listar as squads às quais você tem acesso. Criar squad nova a partir do template, com você como operador. |
| **Nova feature** | Descrever o problema de negócio. O console reserva o número da feature e aciona o analista de requisitos. |
| **Gates** | Ver spec, design, tarefas, QA e revisão renderizados. Aprovar G1 e G2. Pedir ajustes ao agente responsável. Aprovar o G3, que mescla o PR. |
| **Agentes** | Acionar qualquer agente com uma instrução, com sugestão automática do próximo passo. |
| **Status** | Painel com gates por feature, o que está aguardando você, progresso das tarefas e agentes rodando (atualiza sozinho). |
| **Custos** | Custo por execução, por agente, por feature e por mês, com turnos, duração e alerta de execução cara. |
| **Configuração** | Equipe e papéis, dados da squad, editor de agentes, AGENTS.md e skills, e chave da API. Toda alteração vira Pull Request. |

## Como funciona

```
Navegador ──► Squad Console (Next.js, Hostinger)
                │  login GitHub OAuth · sessão criptografada
                ▼
           API do GitHub ──► repositório da squad
                │               ├─ specs/ (spec, design, tasks, QA, review)
                │               ├─ .squad/ (squad.yaml, members.yaml)
                │               └─ .claude/ (agentes, skills)
                ▼
           GitHub Actions: workflow squad-agent
                └─ Claude Code roda como o agente escolhido, commita na branch
                   squad/<feature>, abre/atualiza o PR e registra custo e turnos
```

O console **não tem banco de dados**. O estado vive no repositório da squad:
- gates no front matter dos artefatos
- papéis em `.squad/members.yaml`
- execuções no GitHub Actions
- custos nos comentários dos PRs

Por isso o GitHub continua sendo a fonte de verdade e a trilha de auditoria.

### Papéis

| Papel | Pode |
|-------|------|
| **Operador** | Tudo: aprovar gates, mesclar, configurar, cadastrar a chave da API |
| **Membro** | Abrir features e acionar agentes |
| **Leitor** | Visualizar |

O papel vem de `.squad/members.yaml` e é limitado pela permissão real da pessoa no GitHub.

## Rodar localmente

```bash
cp .env.example .env.local   # preencha as variáveis
npm install
npm run dev                  # http://localhost:3000
```

Para o login local, crie um OAuth App com callback `http://localhost:3000/api/auth/callback` e use `APP_URL=http://localhost:3000`.

```bash
npm test          # testes da lógica central (gates, front matter, papéis, custos)
npm run typecheck
npm run build
```

## Deploy

Veja [DEPLOY.md](DEPLOY.md) (Hostinger, plano Business/Cloud, domínio `iadasilva.com.br`).

## Estrutura

```
app/                      rotas (App Router)
  api/auth/               login, callback e logout do GitHub OAuth
  squads/                 lista e criação de squads
  s/[owner]/[repo]/       visão geral, feature, nova feature, execuções, configuração
components/               UI (shell, gates, formulários de ação, markdown)
lib/
  core.ts                 lógica pura e testada (gates, front matter, papéis, custos)
  squad.ts                leitura do estado da squad no GitHub
  actions.ts              server actions (todas com checagem de papel)
  session.ts, env.ts      sessão criptografada e configuração
tests/                    testes da lógica central
```
