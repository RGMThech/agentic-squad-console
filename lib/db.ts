import "server-only";
import { env } from "./env";

export type GlobalRole = "admin" | "usuario";
export type UserStatus = "ativo" | "desativado";

export type UserRow = {
  id: number;
  email: string;
  name: string;
  role: GlobalRole;
  status: UserStatus;
  sessionVersion: number;
  invitedBy: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
};

export type CodeRow = {
  id: number;
  email: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
};

export interface Store {
  findUserByEmail(email: string): Promise<UserRow | null>;
  findUserById(id: number): Promise<UserRow | null>;
  listUsers(): Promise<UserRow[]>;
  createUser(u: { email: string; name: string; role: GlobalRole; invitedBy: string | null }): Promise<UserRow>;
  updateUser(id: number, patch: Partial<Pick<UserRow, "name" | "role" | "status">> & { bumpSession?: boolean; touchLogin?: boolean }): Promise<void>;

  countCodesSince(by: { email?: string; ip?: string }, since: Date): Promise<number>;
  insertCode(c: { email: string; codeHash: string; ip: string; expiresAt: Date }): Promise<void>;
  latestActiveCode(email: string, now: Date): Promise<CodeRow | null>;
  bumpCodeAttempts(id: number): Promise<void>;
  consumeCodes(email: string, now: Date): Promise<void>;

  audit(e: { actor: string; action: string; target?: string; ip?: string }): Promise<void>;
  listAudit(limit: number): Promise<{ at: Date; actor: string; action: string; target: string | null }[]>;
}

// =====================================================================  MySQL

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS sc_users (
     id INT AUTO_INCREMENT PRIMARY KEY,
     email VARCHAR(254) NOT NULL UNIQUE,
     name VARCHAR(120) NOT NULL DEFAULT '',
     role ENUM('admin','usuario') NOT NULL DEFAULT 'usuario',
     status ENUM('ativo','desativado') NOT NULL DEFAULT 'ativo',
     session_version INT NOT NULL DEFAULT 1,
     invited_by VARCHAR(254) NULL,
     created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     last_login_at DATETIME NULL
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sc_login_codes (
     id INT AUTO_INCREMENT PRIMARY KEY,
     email VARCHAR(254) NOT NULL,
     code_hash CHAR(64) NOT NULL,
     ip VARCHAR(64) NOT NULL DEFAULT '',
     created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     expires_at DATETIME NOT NULL,
     attempts INT NOT NULL DEFAULT 0,
     used_at DATETIME NULL,
     INDEX idx_email_created (email, created_at),
     INDEX idx_ip_created (ip, created_at)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sc_audit (
     id BIGINT AUTO_INCREMENT PRIMARY KEY,
     at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     actor VARCHAR(254) NOT NULL,
     action VARCHAR(60) NOT NULL,
     target VARCHAR(255) NULL,
     ip VARCHAR(64) NULL,
     INDEX idx_at (at)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToUser(r: any): UserRow {
  return {
    id: Number(r.id),
    email: r.email,
    name: r.name ?? "",
    role: r.role,
    status: r.status,
    sessionVersion: Number(r.session_version),
    invitedBy: r.invited_by ?? null,
    createdAt: new Date(r.created_at),
    lastLoginAt: r.last_login_at ? new Date(r.last_login_at) : null,
  };
}

async function mysqlStore(url: string): Promise<Store> {
  const mysql = await import("mysql2/promise");
  const pool = mysql.createPool({ uri: url, connectionLimit: 5, timezone: "Z", dateStrings: false, waitForConnections: true });
  for (const sql of MIGRATIONS) await pool.query(sql);
  const q = async (sql: string, params: unknown[] = []) => (await pool.execute(sql, params as any[]))[0] as any;

  return {
    async findUserByEmail(email) {
      const rows = await q("SELECT * FROM sc_users WHERE email = ? LIMIT 1", [email]);
      return rows[0] ? rowToUser(rows[0]) : null;
    },
    async findUserById(id) {
      const rows = await q("SELECT * FROM sc_users WHERE id = ? LIMIT 1", [id]);
      return rows[0] ? rowToUser(rows[0]) : null;
    },
    async listUsers() {
      return (await q("SELECT * FROM sc_users ORDER BY status, email")).map(rowToUser);
    },
    async createUser(u) {
      const r = await q("INSERT INTO sc_users (email, name, role, invited_by, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())", [u.email, u.name, u.role, u.invitedBy]);
      const rows = await q("SELECT * FROM sc_users WHERE id = ? LIMIT 1", [Number(r.insertId)]);
      return rowToUser(rows[0]);
    },
    async updateUser(id, p) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (p.name !== undefined) (sets.push("name = ?"), vals.push(p.name));
      if (p.role !== undefined) (sets.push("role = ?"), vals.push(p.role));
      if (p.status !== undefined) (sets.push("status = ?"), vals.push(p.status));
      if (p.bumpSession) sets.push("session_version = session_version + 1");
      if (p.touchLogin) sets.push("last_login_at = UTC_TIMESTAMP()");
      if (!sets.length) return;
      await q(`UPDATE sc_users SET ${sets.join(", ")} WHERE id = ?`, [...vals, id]);
    },
    async countCodesSince(by, since) {
      const col = by.email ? "email" : "ip";
      const rows = await q(`SELECT COUNT(*) AS n FROM sc_login_codes WHERE ${col} = ? AND created_at >= ?`, [by.email ?? by.ip, since]);
      return Number(rows[0].n);
    },
    async insertCode(c) {
      await q("INSERT INTO sc_login_codes (email, code_hash, ip, created_at, expires_at) VALUES (?, ?, ?, UTC_TIMESTAMP(), ?)", [c.email, c.codeHash, c.ip, c.expiresAt]);
    },
    async latestActiveCode(email, now) {
      const rows = await q(
        "SELECT * FROM sc_login_codes WHERE email = ? AND used_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1",
        [email, now],
      );
      const r = rows[0];
      return r ? { id: Number(r.id), email: r.email, codeHash: r.code_hash, expiresAt: new Date(r.expires_at), attempts: Number(r.attempts) } : null;
    },
    async bumpCodeAttempts(id) {
      await q("UPDATE sc_login_codes SET attempts = attempts + 1 WHERE id = ?", [id]);
    },
    async consumeCodes(email, now) {
      await q("UPDATE sc_login_codes SET used_at = ? WHERE email = ? AND used_at IS NULL", [now, email]);
      await q("DELETE FROM sc_login_codes WHERE created_at < (UTC_TIMESTAMP() - INTERVAL 7 DAY)");
    },
    async audit(e) {
      await q("INSERT INTO sc_audit (actor, action, target, ip) VALUES (?, ?, ?, ?)", [e.actor, e.action, e.target ?? null, e.ip ?? null]);
    },
    async listAudit(limit) {
      const n = Math.max(1, Math.min(500, Math.floor(limit)));
      return (await q(`SELECT at, actor, action, target FROM sc_audit ORDER BY id DESC LIMIT ${n}`)).map((r: any) => ({
        at: new Date(r.at),
        actor: r.actor,
        action: r.action,
        target: r.target,
      }));
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// =====================================================================  memória (dev/testes)

export function memoryStore(): Store {
  const users: UserRow[] = [];
  const codes: (CodeRow & { ip: string; createdAt: Date; usedAt: Date | null })[] = [];
  const audits: { at: Date; actor: string; action: string; target: string | null }[] = [];
  let uid = 0;
  let cid = 0;
  const clone = <T,>(x: T): T => (x ? (structuredClone(x) as T) : x);
  return {
    async findUserByEmail(email) {
      return clone(users.find((u) => u.email === email) ?? null);
    },
    async findUserById(id) {
      return clone(users.find((u) => u.id === id) ?? null);
    },
    async listUsers() {
      return clone([...users].sort((a, b) => a.status.localeCompare(b.status) || a.email.localeCompare(b.email)));
    },
    async createUser(u) {
      if (users.some((x) => x.email === u.email)) throw Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
      const row: UserRow = { id: ++uid, ...u, status: "ativo", sessionVersion: 1, createdAt: new Date(), lastLoginAt: null };
      users.push(row);
      return clone(row);
    },
    async updateUser(id, p) {
      const u = users.find((x) => x.id === id);
      if (!u) return;
      if (p.name !== undefined) u.name = p.name;
      if (p.role !== undefined) u.role = p.role;
      if (p.status !== undefined) u.status = p.status;
      if (p.bumpSession) u.sessionVersion++;
      if (p.touchLogin) u.lastLoginAt = new Date();
    },
    async countCodesSince(by, since) {
      return codes.filter((c) => (by.email ? c.email === by.email : c.ip === by.ip) && c.createdAt >= since).length;
    },
    async insertCode(c) {
      codes.push({ id: ++cid, email: c.email, codeHash: c.codeHash, ip: c.ip, expiresAt: c.expiresAt, attempts: 0, createdAt: new Date(), usedAt: null });
    },
    async latestActiveCode(email, now) {
      const c = [...codes].reverse().find((x) => x.email === email && !x.usedAt && x.expiresAt > now);
      return c ? { id: c.id, email: c.email, codeHash: c.codeHash, expiresAt: c.expiresAt, attempts: c.attempts } : null;
    },
    async bumpCodeAttempts(id) {
      const c = codes.find((x) => x.id === id);
      if (c) c.attempts++;
    },
    async consumeCodes(email, now) {
      for (const c of codes) if (c.email === email && !c.usedAt) c.usedAt = now;
    },
    async audit(e) {
      audits.push({ at: new Date(), actor: e.actor, action: e.action, target: e.target ?? null });
    },
    async listAudit(limit) {
      return clone(audits.slice(-limit).reverse());
    },
  };
}

// =====================================================================  instância

const g = globalThis as unknown as { __squadStore?: Promise<Store> };

export function store(): Promise<Store> {
  if (!g.__squadStore) {
    const url = env.databaseUrl;
    if (url.startsWith("memory:")) {
      if (!env.allowMemoryDb) throw new Error("DATABASE_URL=memory:// é só para desenvolvimento. Configure o MySQL.");
      g.__squadStore = Promise.resolve(memoryStore());
    } else if (url.startsWith("mysql://")) {
      g.__squadStore = mysqlStore(url).catch((e) => {
        g.__squadStore = undefined;
        // preserva o código do erro (ECONNREFUSED, ER_ACCESS_DENIED_ERROR…) para o diagnóstico
        throw e;
      });
    } else {
      throw new Error("DATABASE_URL deve começar com mysql:// (ex.: mysql://usuario:senha@host:3306/banco).");
    }
  }
  return g.__squadStore;
}
