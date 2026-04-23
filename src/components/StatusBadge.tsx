type StatusBadgeProps = {
  label: string;
  tone?: "idle" | "active" | "busy" | "error";
};

const toneClasses = {
  idle: "border-slate-700 bg-slate-900 text-slate-400",
  active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  busy: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  error: "border-red-500/40 bg-red-500/10 text-red-300",
};

export function StatusBadge({ label, tone = "idle" }: StatusBadgeProps) {
  return (
    <span className={`rounded border px-2 py-1 text-[11px] uppercase tracking-[0.16em] ${toneClasses[tone]}`}>
      {label}
    </span>
  );
}
