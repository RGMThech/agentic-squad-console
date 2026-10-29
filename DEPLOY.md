# Deploy na Hostinger (plano Business / Cloud)

O console é um app **Next.js (Node.js)**. Nos planos Business e Cloud, a Hostinger tem suporte nativo a apps Node.js: faz o deploy a partir do GitHub, roda o build a cada push e permite configurar variáveis de ambiente pelo hPanel.

Endereço de produção: **https://iadasilva.com.br**

> Os nomes exatos dos menus do hPanel podem variar um pouco. O fluxo é sempre: adicionar um *Node.js Web App*, conectar o GitHub, conferir o build e cadastrar as variáveis.

---

## 1. Antes de começar (5 min)

1. **Template marcado como template.** No GitHub, abra `RGMThech/agentic-data-squad` → **Settings** → marque **Template repository**. Sem isso, o botão "Nova squad" do console não funciona.
   - Na página inicial do repositório, em **About → ⚙️**, adicione o tópico `agentic-data-squad`. O console só lista repositórios com esse tópico; as squads criadas pelo console já recebem o tópico automaticamente.
2. **Domínio com SSL.** No hPanel, confirme que `iadasilva.com.br` aponta para a hospedagem e que o **SSL** está ativo. O login com GitHub exige HTTPS.
3. **Actions pode abrir PRs (obrigatório).** Na organização **RGMThech** → **Settings → Actions → General → Workflow permissions**:
   - marque **Read and write permissions**
   - marque **Allow GitHub Actions to create and approve pull requests**

   Sem isso, o agente roda e commita, mas o workflow falha ao abrir o PR da feature. Confira também **Actions permissions**: o workflow usa apenas actions oficiais do GitHub (`actions/checkout`, `setup-python`, `setup-node`).

## 2. Criar o GitHub OAuth App

Crie o app **dentro da organização**, para que ele pertença à RGMThech e não a uma conta pessoal:

GitHub → organização **RGMThech** → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**

| Campo | Valor |
|-------|-------|
| Application name | Squad Console |
| Homepage URL | `https://iadasilva.com.br` |
| Authorization callback URL | `https://iadasilva.com.br/api/auth/callback` |

Depois de criar:
- copie o **Client ID**
- clique em **Generate a new client secret** e copie o **Client secret**

> **Squads em outras organizações (clientes):** se a organização do cliente tiver restrição a apps de terceiros, um owner dela precisa aprovar o *Squad Console* em **Organization settings → Third-party access → OAuth app policy**. Sem essa aprovação, os repositórios daquela organização não aparecem no console.

## 3. Criar o app Node.js no hPanel

1. hPanel → **Websites** → **Adicionar site** → **Node.js Web App**.
2. Escolha **Importar do GitHub** e autorize a Hostinger. Na tela de autorização do GitHub, conceda acesso à organização **RGMThech** (botão *Grant* ao lado dela); sem isso, o repositório não aparece na lista. Selecione `RGMThech/agentic-squad-console`, branch `main`.
3. Confira as configurações de build. O framework deve ser detectado como **Next.js**.

   | Configuração | Valor |
   |--------------|-------|
   | Versão do Node.js | **22.x** |
   | Comando de instalação | `npm install` |
   | Comando de build | `npm run build` |
   | Comando de start | `npm start` |
   | Diretório de saída | `.next` |

4. Vincule o domínio **iadasilva.com.br** ao app.

## 4. Variáveis de ambiente

No app Node.js do hPanel, cadastre as variáveis abaixo **antes do primeiro deploy**.

| Variável | Valor |
|----------|-------|
| `APP_URL` | `https://iadasilva.com.br` |
| `GITHUB_CLIENT_ID` | o Client ID do passo 2 |
| `GITHUB_CLIENT_SECRET` | o Client secret do passo 2 |
| `SESSION_SECRET` | um segredo aleatório de 32+ caracteres (veja abaixo) |
| `SQUAD_TEMPLATE_REPO` | `RGMThech/agentic-data-squad` |
| `SQUAD_TOPIC` | `agentic-data-squad` |
| `ALLOWED_GITHUB_USERS` | *(recomendado no início)* `mellrodrigo` |
| `ALLOWED_GITHUB_ORGS` | *(recomendado)* `RGMThech`: membros da organização podem entrar. Para clientes, acrescente as organizações deles, separadas por vírgula |

Para gerar o `SESSION_SECRET` no seu computador:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

> `ALLOWED_GITHUB_USERS` e `ALLOWED_GITHUB_ORGS` vazios = qualquer conta do GitHub consegue entrar, mas só enxerga as squads às quais já tem acesso no GitHub. Comece restrito e abra quando o time entrar.

## 5. Deploy e verificação

1. Rode o deploy no hPanel e acompanhe o log de build.
2. Abra `https://iadasilva.com.br/api/health`. Deve responder `{"ok":true,...}`.
3. Abra `https://iadasilva.com.br` → **Entrar com GitHub** → autorize.
4. A squad `agentic-data-squad` (o próprio template) deve aparecer na lista.

A partir daqui, **todo push na `main` do console gera um novo deploy automaticamente**.

## 6. Primeira squad de verdade

1. No console: **Nova squad**. Informe o dono, o nome, o cliente e a plataforma.
2. Em **Configuração**: cadastre a chave da API da Anthropic. Ela vai criptografada direto para os segredos do GitHub Actions do repositório; o console não guarda a chave.
3. Em **Equipe e papéis**: adicione os membros. Eles também precisam de acesso ao repositório no GitHub.
4. No GitHub, em **Settings → Branches** do repositório da squad, proteja a `main`:
   - exija Pull Request
   - exija a checagem **Harness (naming, contratos, gates, testes)**
5. **Nova feature** → descreva o problema → acompanhe o analista trabalhando.

---

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| GitHub mostra *redirect_uri mismatch* | Callback do OAuth App diferente de `APP_URL` | Use exatamente `https://iadasilva.com.br/api/auth/callback` |
| Página de erro citando `SESSION_SECRET` | Variável ausente ou curta | Cadastre um valor com 32+ caracteres e refaça o deploy |
| Login funciona, mas a lista de squads vem vazia | Repositório sem o tópico, ou OAuth App não aprovado na organização | Adicione o tópico `agentic-data-squad` ao repositório, ou peça a aprovação ao owner da organização |
| "Nova squad" diz que não é template | O template não está marcado | Veja o passo 1.1 |
| Agente acionado, mas a execução falha logo no início | Chave da API ausente ou GitHub Actions desabilitado | Configure a chave no console e habilite o Actions no repositório |
| A execução falha em "Validar pedido" | Quem acionou não está em `.squad/members.yaml` | Adicione a pessoa em Equipe e papéis |
| Aprovar G3 dá erro de merge | Proteção de branch exige aprovações | O console já registra a aprovação do operador; confira as regras da branch |

## Segurança

- O token do GitHub fica apenas no cookie de sessão **criptografado** (httpOnly, 8 h) e nunca é enviado ao navegador.
- Os escopos pedidos são `repo` (ler e escrever os repositórios da squad), `workflow` (acionar o squad-agent) e `read:org` (listar organizações).
- Toda ação passa por duas checagens: o papel em `.squad/members.yaml` e a permissão real no GitHub.
- Os gates são revalidados pelo CI (`check_spec.py` confere se quem aprovou é operador).
