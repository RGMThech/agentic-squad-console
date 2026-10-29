const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const dt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export const money = (v: number) => usd.format(v || 0);
export const when = (iso?: string | null) => (iso ? dt.format(new Date(iso)) : "—");

export function duration(ms?: number | null) {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

export function ago(iso?: string | null) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return `há ${Math.floor(diff / 86400)} d`;
}

export function runDuration(createdAt: string, updatedAt: string, ms?: number | null) {
  if (ms) return duration(ms);
  return duration(new Date(updatedAt).getTime() - new Date(createdAt).getTime());
}
