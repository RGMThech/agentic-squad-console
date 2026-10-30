// Traduz erros de infraestrutura em mensagens úteis, sem expor senhas, hosts ou chaves.

type Err = { code?: string; errno?: number; message?: string; status?: number; responseCode?: number };

const asErr = (e: unknown): Err => (typeof e === "object" && e ? (e as Err) : { message: String(e) });

export function explainDbError(e: unknown): string {
  const x = asErr(e);
  const msg = x.message ?? "";
  if (/Variável de ambiente ausente: DATABASE_URL/.test(msg)) return "DATABASE_URL não está definida nas variáveis de ambiente.";
  if (/deve começar com mysql:\/\//.test(msg)) return "DATABASE_URL precisa começar com mysql:// (ex.: mysql://usuario:senha@host:3306/banco).";
  if (/só para desenvolvimento/.test(msg)) return "DATABASE_URL está como memory://, que só serve para desenvolvimento.";
  switch (x.code) {
    case "ER_ACCESS_DENIED_ERROR":
      return "MySQL recusou usuário ou senha. Confira o usuário e a senha na DATABASE_URL (senhas com @ : / # precisam ser codificadas: %40 %3A %2F %23).";
    case "ER_BAD_DB_ERROR":
      return "O banco informado na DATABASE_URL não existe. Confira o nome do banco (na Hostinger ele costuma ter prefixo, ex.: u123456789_squad).";
    case "ER_DBACCESS_DENIED_ERROR":
      return "O usuário do MySQL não tem permissão nesse banco. No hPanel, associe o usuário ao banco com todos os privilégios.";
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "O host do MySQL não foi encontrado. Confira o host na DATABASE_URL (no hPanel, em Gerenciamento de MySQL; se o app roda na mesma hospedagem, tente localhost).";
    case "ECONNREFUSED":
      return "Conexão recusada pelo MySQL. Confira host e porta (3306) na DATABASE_URL; se o app roda na mesma hospedagem, tente localhost.";
    case "ETIMEDOUT":
    case "PROTOCOL_SEQUENCE_TIMEOUT":
      return "Tempo esgotado ao conectar no MySQL. O host pode estar errado ou bloqueado para conexões remotas (no hPanel: MySQL remoto).";
    case "ER_HOST_NOT_PRIVILEGED":
    case "ER_HOST_IS_BLOCKED":
      return "O MySQL não aceita conexões deste servidor. No hPanel, libere o acesso em MySQL remoto, ou use localhost se o app roda na mesma hospedagem.";
    case "ERR_INVALID_URL":
      return "DATABASE_URL em formato inválido. Use mysql://usuario:senha@host:3306/banco e codifique caracteres especiais da senha.";
  }
  if (/getaddrinfo ENOTFOUND/.test(msg)) return explainDbError({ code: "ENOTFOUND" });
  if (/ECONNREFUSED/.test(msg)) return explainDbError({ code: "ECONNREFUSED" });
  if (/Invalid URL|URI malformed/i.test(msg)) return "DATABASE_URL em formato inválido. Codifique caracteres especiais da senha (@ → %40, : → %3A, / → %2F, # → %23).";
  return `Falha no MySQL (${x.code ?? "erro desconhecido"}).`;
}

export function explainMailError(e: unknown): string {
  const x = asErr(e);
  const msg = x.message ?? "";
  if (/E-mail não configurado/.test(msg)) return "SMTP não configurado: defina SMTP_HOST, SMTP_USER e SMTP_PASS.";
  if (x.code === "EAUTH" || x.responseCode === 535) return "O servidor de e-mail recusou usuário ou senha. Confira SMTP_USER (e-mail completo) e SMTP_PASS.";
  if (x.code === "ESOCKET" || x.code === "ECONNECTION" || x.code === "ETIMEDOUT")
    return "Não foi possível conectar ao servidor de e-mail. Confira SMTP_HOST (smtp.hostinger.com) e SMTP_PORT (465).";
  if (x.code === "EENVELOPE") return "O servidor de e-mail recusou o remetente. Use em MAIL_FROM o mesmo e-mail de SMTP_USER.";
  return `Falha no envio de e-mail (${x.code ?? x.responseCode ?? "erro desconhecido"}).`;
}

export function explainGithubError(e: unknown): string {
  const x = asErr(e);
  const msg = x.message ?? "";
  if (/Variável de ambiente ausente: (GITHUB_\w+)/.test(msg)) return msg.match(/Variável de ambiente ausente: \w+/)![0] + ".";
  if (/não está instalado na organização/.test(msg)) return msg;
  if (/PEM|private key|asn1|DECODER|bad base64|secretOrPrivateKey|keyData|Invalid key/i.test(msg) || (e as { name?: string })?.name === "DataError")
    return "GITHUB_APP_PRIVATE_KEY inválida. Cole de novo o conteúdo do .pem convertido para base64 (uma linha só, sem espaços extras).";
  if (x.status === 401) return "O GitHub recusou a autenticação do App. Confira se GITHUB_APP_ID corresponde à chave privada gerada para esse App.";
  if (x.status === 404) return "App ou instalação não encontrados. Confira GITHUB_APP_ID, GITHUB_ORG e se o App está instalado na organização.";
  return `Falha ao falar com o GitHub (${x.status ?? x.code ?? "erro desconhecido"}).`;
}
