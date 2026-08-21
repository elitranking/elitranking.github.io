/** Små byggstenar som används på flera ställen. */
import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-ink-200 bg-white shadow-sm dark:border-ink-800 dark:bg-ink-900 ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-4 py-3 dark:border-ink-800">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-xs text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Poäng- eller placeringsförändring med riktning och färg. */
export function Delta({ value, invert = false, suffix = "" }: { value: number; invert?: boolean; suffix?: string }) {
  if (!value) return <span className="text-ink-300 tnum">–</span>;
  const good = invert ? value < 0 : value > 0;
  return (
    <span className={`tnum font-medium ${good ? "text-up" : "text-down"}`}>
      {value > 0 ? "+" : "−"}
      {Math.abs(value).toLocaleString("sv-SE")}
      {suffix}
    </span>
  );
}

/** Placeringsförändring som pil, kompaktare än siffror i en tabell. */
export function RankArrow({ delta }: { delta: number }) {
  if (!delta) return <span className="text-ink-300">–</span>;
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 tnum text-xs font-semibold ${up ? "text-up" : "text-down"}`}>
      <svg viewBox="0 0 8 8" className="h-2 w-2" aria-hidden>
        <path d={up ? "M4 0 8 6H0z" : "M4 8 0 2h8z"} fill="currentColor" />
      </svg>
      {Math.abs(delta)}
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "felt" | "warn" }) {
  const tones = {
    neutral: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
    felt: "bg-felt-100 text-felt-700 dark:bg-felt-900 dark:text-felt-100",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  };
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function Toggle<T extends string>({
  value, options, onChange, label,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-ink-100 p-0.5 dark:bg-ink-800">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition ${
            value === o.value
              ? "bg-white text-ink-900 shadow-sm dark:bg-ink-700 dark:text-white"
              : "text-ink-500 hover:text-ink-700 dark:hover:text-ink-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Landsflagga som text — tre bokstäver är läsbarare än små flaggbilder i en tät tabell. */
export function Nation({ code }: { code: string }) {
  return <span className="font-mono text-[11px] tracking-wide text-ink-500">{code}</span>;
}
