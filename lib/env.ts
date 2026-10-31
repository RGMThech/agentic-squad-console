import "server-only";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}. Veja .env.example e DEPLOY.md.`);
  return v;
}

const list = (v?: string) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** Aceita a chave PEM inteira, com "\n" escapados, ou em base64 (mais fácil de colar em painéis). */
export function pem(raw: string): string {
  let v = raw.trim();
  if (!v.includes("BEGIN")) {
    try {
      v = Buffer.from(v, "base64").toString("utf8");
    } catch {
      /* mantém como veio */
    }
  }
  return v.replace(/\\n/g, "\n");
}

export const env = {
  get appUrl() {
    return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get sessionSecret() {
    const s = req("SESSION_SECRET");
    if (s.length < 32) throw new Error("SESSION_SECRET precisa ter pelo menos 32 caracteres.");
    return s;
  },

  // ---- banco de dados ----
  get databaseUrl() {
    return req("DATABASE_URL");
  },
  /** Banco em memória: só para desenvolvimento e testes. */
  get allowMemoryDb() {
    return !this.isProduction || process.env.ALLOW_MEMORY_DB === "1";
  },

  // ---- e-mail ----
  get smtp() {
    return {
      host: process.env.SMTP_HOST || "",
      port: Number(process.env.SMTP_PORT || 465),
      secure: (process.env.SMTP_SECURE ?? (Number(process.env.SMTP_PORT || 465) === 465 ? "true" : "false")) === "true",
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    };
  },
  get mailFrom() {
    return process.env.MAIL_FROM || process.env.SMTP_USER || "";
  },
  /** "console" imprime os e-mails no log (desenvolvimento). */
  get mailTransport() {
    return (process.env.MAIL_TRANSPORT || (process.env.SMTP_HOST ? "smtp" : "console")).toLowerCase();
  },
  /** Administradores iniciais: entram mesmo sem convite e não podem ser rebaixados pelo console. */
  get adminEmails() {
    return list(process.env.ADMIN_EMAILS);
  },

  // ---- GitHub App ----
  get githubAppId() {
    return req("GITHUB_APP_ID");
  },
  get githubAppPrivateKey() {
    return pem(req("GITHUB_APP_PRIVATE_KEY"));
  },
  /** Organização conectada automaticamente na primeira vez (opcional: as demais são cadastradas em Admin → Conexões). */
  get githubOrg() {
    return (process.env.GITHUB_ORG || "").trim();
  },
  /** Chave para cifrar as chaves de Apps próprios das conexões (padrão: derivada do SESSION_SECRET). */
  get chaveConexoes() {
    return process.env.CONEXOES_KEY || this.sessionSecret;
  },
  /** GitHub Enterprise Server: ex. https://github.empresa.com/api/v3 */
  get githubApiUrl() {
    return (process.env.GITHUB_API_URL || "").replace(/\/$/, "");
  },
  get templateRepo() {
    return process.env.SQUAD_TEMPLATE_REPO || "RGMThech/agentic-data-squad";
  },
  get topic() {
    return (process.env.SQUAD_TOPIC || "agentic-data-squad").toLowerCase();
  },
};
