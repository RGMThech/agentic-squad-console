import type { GateState, Role } from "@/lib/core";
import type { Run } from "@/lib/squad";
import { IconCheck, IconClock, IconX } from "./Icons";

const GATE_LABEL: Record<GateState, string> = {
  nao_iniciado: "Não iniciado",
  pendente: "Com os agentes",
  aguardando: "Aguardando o Operador",
  aprovado: "Aprovado",
};

export function GatesMini({ gates }: { gates: { g1: GateState; g2: GateState; g3: GateState } }) {
  return (
    <span className="gates-mini">
      {(["g1", "g2", "g3"] as const).map((g) => (
        <span key={g} className={`gate-mini ${gates[g]}`} title={`${g.toUpperCase()}: ${GATE_LABEL[gates[g]]}`}>
          {gates[g] === "aprovado" ? <IconCheck size={14} /> : g.toUpperCase()}
        </span>
      ))}
    </span>
  );
}

export function GateTrack({
  gates,
  running,
}: {
  gates: { g1: GateState; g2: GateState; g3: GateState };
  running: boolean;
}) {
  const steps = [
    { k: "g1" as const, t: "G1 · Spec" },
    { k: "g2" as const, t: "G2 · Design" },
    { k: "g3" as const, t: "G3 · Produção" },
  ];
  return (
    <div className="track" role="list" aria-label="Gates da feature">
      {steps.map((s) => {
        const st = gates[s.k];
        const label = st === "pendente" && running ? "Agente trabalhando…" : GATE_LABEL[st];
        return (
          <div key={s.k} className={`track-step ${st}`} role="listitem">
            <div className="gate-big">{st === "aprovado" ? <IconCheck size={22} /> : s.k.toUpperCase()}</div>
            <div className="track-title">{s.t}</div>
            <div className="track-state">{label}</div>
          </div>
        );
      })}
    </div>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const cls = role === "operador" ? "badge-navy" : role === "membro" ? "badge-blue" : "";
  const label = role === "operador" ? "Operador" : role === "membro" ? "Membro" : "Leitor";
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function RunBadge({ run }: { run: Run }) {
  if (run.status !== "completed")
    return (
      <span className="badge badge-blue">
        <span className="dot pulse" /> {run.status === "queued" ? "Na fila" : "Rodando"}
      </span>
    );
  if (run.conclusion === "success") return <span className="badge badge-green">Concluída</span>;
  if (run.conclusion === "cancelled") return <span className="badge">Cancelada</span>;
  return <span className="badge badge-red">Falhou</span>;
}

export function RunIcon({ run }: { run: Run }) {
  if (run.status !== "completed")
    return (
      <span className="tl-icon run">
        <IconClock size={13} />
      </span>
    );
  if (run.conclusion === "success")
    return (
      <span className="tl-icon ok">
        <IconCheck size={13} />
      </span>
    );
  return (
    <span className="tl-icon bad">
      <IconX size={13} />
    </span>
  );
}

export function DocBadge({ value }: { value?: string }) {
  const v = (value ?? "").toLowerCase();
  if (!v) return null;
  if (v.startsWith("aprovado") || v.startsWith("sem bloqueios")) return <span className="badge badge-green">{value}</span>;
  if (v.startsWith("reprovado") || v.startsWith("com bloqueios")) return <span className="badge badge-red">{value}</span>;
  if (v === "em_revisao") return <span className="badge badge-amber">em revisão</span>;
  return <span className="badge">{value}</span>;
}
