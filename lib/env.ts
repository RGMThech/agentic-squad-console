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

export const env = {
  get appUrl() {
    return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  },
  /** Endereço web do GitHub (para OAuth). Troque só em GitHub Enterprise Server. */
  get githubUrl() {
    return (process.env.GITHUB_URL || "https://github.com").replace(/\/$/, "");
  },
  get clientId() {
    return req("GITHUB_CLIENT_ID");
  },
  get clientSecret() {
    return req("GITHUB_CLIENT_SECRET");
  },
  get sessionSecret() {
    const s = req("SESSION_SECRET");
    if (s.length < 32) throw new Error("SESSION_SECRET precisa ter pelo menos 32 caracteres.");
    return s;
  },
  get templateRepo() {
    return process.env.SQUAD_TEMPLATE_REPO || "RGMThech/agentic-data-squad";
  },
  get topic() {
    return (process.env.SQUAD_TOPIC || "agentic-data-squad").toLowerCase();
  },
  get allowedUsers() {
    return list(process.env.ALLOWED_GITHUB_USERS);
  },
  get allowedOrgs() {
    return list(process.env.ALLOWED_GITHUB_ORGS);
  },
};
