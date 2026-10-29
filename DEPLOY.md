# Implantação na Hostinger (plano Business / Cloud)

O Squad Console é um app **Next.js (Node.js)** com três peças externas:

| Peça | Para quê | Onde |
|------|----------|------|
| **MySQL** | contas, códigos de login, auditoria | banco da própria Hostinger |
| **SMTP** | envio dos códigos e dos convites | e-mail da própria Hostinger |
| **GitHub App** | o console falar com os repositórios das squads | organização **RGMThech** |

Endereço de produção: **https://iadasilva.com.br**

Ninguém entra pelo GitHub. As pessoas entram com **e-mail + código de 6 dígitos**, e só quem foi convidado.

> Os nomes dos menus do hPanel e do GitHub podem variar um pouco; o fluxo é o mesmo.

---

## 1. Banco de dados MySQL (hPanel)

1. hPanel → **Bancos de dados → Gerenciamento de MySQL**.
2. Crie um banco (ex.: `squadconsole`), um usuário e uma senha forte.
3. Anote o **host** que o hPanel mostra para o banco.
4. Monte a `DATABASE_URL`:

   ```
   mysql://USUARIO:SENHA@HOST:3306/BANCO
   ```

   Se a senha tiver caracteres especiais (`@`, `:`, `/`, `#`), escreva-os codificados, por exemplo `@` → `%40`.

As tabelas (`sc_users`, `sc_login_codes`, `sc_audit`) são criadas sozinhas no primeiro acesso.

## 2. E-mail para os códigos (hPanel)

1. hPanel → **E-mails** → crie a caixa `no-reply@iadasilva.com.br`.
2. Os dados de SMTP da Hostinger são:

   | Variável | Valor |
   |----------|-------|
   | `SMTP_HOST` | `smtp.hostinger.com` |
   | `SMTP_PORT` | `465` |
   | `SMTP_USER` | `no-reply@iadasilva.com.br` |
   | `SMTP_PASS` | a senha da caixa |
   | `MAIL_FROM` | `no-reply@iadasilva.com.br` |

Para os códigos não caírem no spam, confira no hPanel se o domínio tem **SPF, DKIM e DMARC** ativos (em E-mails → Configurações de DNS).

## 3. GitHub App da organização

### 3.1 Criar o App

GitHub → organização **RGMThech** → **Settings → Developer settings → GitHub Apps → New GitHub App**

| Campo | Valor |
|-------|-------|
| GitHub App name | `RGM Squad Console` (o nome vira o bot `rgm-squad-console[bot]`) |
| Homepage URL | `https://iadasilva.com.br` |
| Callback URL / Setup URL | deixe em branco |
| Webhook | **desmarque "Active"**; o console não usa webhooks |
| Where can this GitHub App be installed? | **Only on this account** |

**Repository permissions**, e nada além delas:

| Permissão | Acesso | Uso no console |
|-----------|--------|----------------|
| Actions | Read and write | acionar os agentes e listar execuções |
| Administration | Read and write | criar squads a partir do template, tópicos e ler proteção da branch |
| Checks | Read-only | ver se as checagens do PR passaram (G3) |
| Contents | Read and write | ler specs e gravar aprovações de gates e configuração |
| Issues | Read and write | comentários nos PRs |
| Metadata | Read-only | obrigatória |
| Pull requests | Read and write | abrir e mesclar PRs (G3 e configuração) |
| Secrets | Read and write | gravar a chave da API da Anthropic de cada squad |
| Workflows | Read and write | criar squads cujo template contém workflows |

**Organization permissions:** nenhuma.

### 3.2 Chave e ID

1. Na página do App, anote o **App ID** (número no topo).
2. Em **Private keys → Generate a private key**, o GitHub baixa um arquivo `.pem`.
3. Converta o `.pem` para base64 (uma linha só, mais fácil de colar no hPanel):

   ```powershell
   # Windows (PowerShell)
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\rgm-squad-console.pem"))
   ```

   ```bash
   # Linux / macOS
   base64 -w0 rgm-squad-console.pem
   ```

Guarde o `.pem` em local seguro e não o envie por e-mail ou chat.

### 3.3 Instalar na organização

Na página do App → **Install App** → **RGMThech** → **All repositories** → **Install**.

"All repositories" é necessário para que cada squad nova, criada pelo console, já fique acessível ao App.

### 3.4 Ajustes nos repositórios

- **Template:** em `RGMThech/agentic-data-squad` → Settings → marque **Template repository**.
- **Actions na organização:** RGMThech → Settings → Actions → General → Workflow permissions:
  - marque **Read and write permissions**
  - marque **Allow GitHub Actions to create and approve pull requests**
- **Squads que já existem:** em `.squad/squad.yaml`, preencha `console_bot: rgm-squad-console[bot]`, com o nome exato que aparece em Configuração → Saúde da instalação. Squads criadas pelo console já nascem com esse campo.
- **Ruleset da `main`** (opcional, recomendado): adicione o App **RGM Squad Console** à **Bypass list**. Assim, alterações de equipe entram na hora; sem isso, o console abre um PR para cada alteração.

## 4. Variáveis de ambiente (hPanel → app Node.js)

| Variável | Valor |
|----------|-------|
| `APP_URL` | `https://iadasilva.com.br` |
| `SESSION_SECRET` | texto aleatório com 32+ caracteres (veja abaixo) |
| `DATABASE_URL` | passo 1 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | passo 2 |
| `ADMIN_EMAILS` | seu e-mail, por exemplo `voce@empresa.com.br` (vários separados por vírgula) |
| `GITHUB_APP_ID` | passo 3.2 |
| `GITHUB_APP_PRIVATE_KEY` | o base64 do `.pem` (passo 3.2) |
| `GITHUB_ORG` | `RGMThech` |
| `SQUAD_TEMPLATE_REPO` | `RGMThech/agentic-data-squad` |
| `SQUAD_TOPIC` | `agentic-data-squad` |

Gerar o `SESSION_SECRET` no PowerShell:

```powershell
[Convert]::ToBase64String((1..32 | % { Get-Random -Max 256 }))
```

**Remova as variáveis antigas**, que não são mais usadas:
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `ALLOWED_GITHUB_USERS`
- `ALLOWED_GITHUB_ORGS`
- `GITHUB_URL`

Trocar o `SESSION_SECRET` derruba todas as sessões e invalida os códigos pendentes. Isso é útil em caso de suspeita de vazamento.

## 5. Deploy e primeiro acesso

1. Rode o deploy no hPanel. O build é o de sempre: Node 22, `npm install`, `npm run build`, `npm start`.
2. `https://iadasilva.com.br/api/health` deve responder `{"ok":true,...}`.
3. Abra `https://iadasilva.com.br` → **Entrar** → informe o e-mail de `ADMIN_EMAILS` → digite o código recebido.
4. Em **Minha conta** (clique nas suas iniciais), ajuste seu nome de exibição.
5. Em **Usuários**, convide o time. Em cada squad, monte a equipe em **Configuração → Equipe e papéis**.

## 6. Limpeza do login antigo pelo GitHub

O console não usa mais login com GitHub. Para fechar essa porta:
1. GitHub → **RGMThech → Settings → Developer settings → OAuth Apps** → apague o app **Squad Console**. Faça o mesmo em Settings → Developer settings da sua conta pessoal, se ele foi criado lá.
2. Na sua conta: **Settings → Applications → Authorized OAuth Apps** → revogue o *Squad Console*.

---

## Como o login funciona

| Etapa | Proteção |
|-------|----------|
| Pedir código | Resposta idêntica para e-mails com e sem conta (não revela quem tem acesso). Limite de **3 pedidos por e-mail** e **10 por IP** a cada 15 minutos. |
| Código | 6 dígitos, **válido por 10 minutos**, uso único, guardado só como HMAC-SHA256 (nunca em texto). |
| Tentativas | **5 erros** invalidam o código. |
| Sessão | Cookie criptografado, `httpOnly`, `Secure`, `SameSite=Lax`, **12 horas**. A conta é reconferida a cada página: desativar alguém ou "Encerrar sessões" derruba o acesso na hora. |
| Contas | Só por convite. Administradores convidam; `ADMIN_EMAILS` são administradores permanentes. |
| Auditoria | Logins, códigos errados, convites, mudanças de papel e de equipe ficam em **Auditoria**. |

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| Erro citando `DATABASE_URL` ou MySQL | URL incorreta ou senha com caractere especial não codificado | Confira o passo 1 |
| O código não chega | SMTP incorreto ou caiu no spam | Confira o passo 2 e o SPF/DKIM do domínio |
| "O GitHub App não está instalado na organização" | App não instalado na RGMThech | Passo 3.3 |
| "O GitHub App não conseguiu se autenticar" | `GITHUB_APP_ID` ou chave errados | Gere uma nova chave e cole o base64 de novo |
| Agente recusado em "Validar pedido" | `console_bot` ausente no `.squad/squad.yaml`, ou a pessoa não está na equipe | Configuração → Saúde da instalação mostra o valor certo |
| Equipe alterada mas a mudança não aparece | `main` protegida: o console abriu um PR | Aplique o PR, ou adicione o App ao bypass do ruleset (passo 3.4) |
