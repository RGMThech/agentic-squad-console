# Squad Console · RGM Tech

Console web para **configurar e operar squads agênticas de Data Analytics**, onde um único humano (o Operador) comanda uma squad inteira de agentes.

Funciona junto com o template [`agentic-data-squad`](https://github.com/RGMThech/agentic-data-squad).

## O que dá para fazer

| Área | Recursos |
|------|----------|
| **Acesso** | Landing page pública. Login por e-mail com código de uso único. Contas só por convite. |
| **Usuários** | Convidar, mudar papel (administrador ou usuário), desativar e encerrar sessões. Trilha de auditoria. |
| **Squads** | Criar squad a partir do template na organização. Cada pessoa vê só as squads em que está na equipe. |
| **Equipe** | Operadores, membros e leitores por e-mail, gravados no `.squad/members.yaml` da squad. |
| **Features e gates** | Abrir pedidos, acompanhar os agentes, aprovar G1 e G2, pedir ajustes, aprovar G3 (merge). |
| **Custos** | Custo, turnos e duração por execução, por agente, por feature e por mês. |
| **Configuração** | Agentes, `AGENTS.md`, skills, chave da API e conexão Databricks (com teste antes de salvar). Alterações viram Pull Request. |

## Como funciona

```
Pessoa ──► landing ──► login (e-mail + código) ──► Squad Console (Next.js, Hostinger)
                                                     │  contas, códigos e auditoria → MySQL
                                                     │  e-mails → SMTP
                                                     ▼
                                     GitHub App "RGM Squad Console" (organização RGMThech)
                                                     │
                                                     ▼
                                     repositório da squad ──► GitHub Actions (squad-agent)
                                       specs/, .squad/, .claude/      Claude Code roda o agente
```

- **Ninguém precisa de conta no GitHub.** O console age pelo GitHub App da organização, e cada ação registra quem pediu (o e-mail) nos commits, comentários e execuções.
- O **estado das squads continua no GitHub**: gates no front matter dos artefatos, equipe em `.squad/members.yaml`, execuções no Actions e custos nos comentários dos PRs.
- O **banco** guarda apenas contas, códigos de login (como HMAC) e auditoria.

### Papéis

| Onde | Papel | Pode |
|------|-------|------|
| Console | **Administrador** | Tudo: convidar pessoas, criar squads, operar qualquer squad |
| Console | **Usuário** | Entrar e ver as squads em que está na equipe |
| Squad | **Operador** | Aprovar gates, mesclar, configurar, cadastrar a chave da API, montar a equipe |
| Squad | **Membro** | Abrir features e acionar agentes |
| Squad | **Leitor** | Visualizar |

## Rodar localmente

```bash
cp .env.example .env.local
# para testar sem MySQL e sem SMTP:
#   DATABASE_URL=memory://
#   MAIL_TRANSPORT=console       (o código de login aparece no terminal)
#   ADMIN_EMAILS=voce@empresa.com.br
npm install
npm run dev     # http://localhost:3000
```

```bash
npm test          # gates, front matter, papéis, equipe e regras do código de login
npm run typecheck
npm run build
```

## Deploy

Veja [DEPLOY.md](DEPLOY.md): Hostinger com MySQL, SMTP e GitHub App.

## Estrutura

```
middleware.ts             bloqueia as áreas internas sem sessão
app/
  page.tsx                landing page pública
  login/                  e-mail → código de 6 dígitos
  admin/usuarios|auditoria  administração (só administradores)
  conta/                  nome de exibição
  squads/                 lista e criação de squads
  s/[owner]/[repo]/       visão geral, feature, nova feature, execuções, configuração
lib/
  otp.ts                  regras do código de login (puro, testado)
  core.ts                 gates, front matter, papéis, equipe, custos (puro, testado)
  db.ts                   MySQL (e banco em memória para desenvolvimento)
  mail.ts                 e-mails de código e de convite
  github.ts               cliente do GitHub App
  auth-actions.ts         pedir e conferir código
  admin-actions.ts        convites e contas
  actions.ts              ações das squads (todas com checagem de papel)
tests/                    testes da lógica central
```
