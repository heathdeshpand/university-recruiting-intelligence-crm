import { cn } from "@/lib/util/cn";

export interface FunnelStage {
  label: string;
  value: number;
  hint?: string;
}

/**
 * The product's central claim, drawn as a picture: we do NOT start from the
 * whole student body. Each bar is scaled against the widest stage, so the
 * narrowing is visible at a glance.
 */
export function Funnel({ stages, className }: { stages: FunnelStage[]; className?: string }) {
  const max = Math.max(1, ...stages.map((s) => s.value));

  return (
    <ol className={cn("space-y-2.5", className)}>
      {stages.map((stage, i) => {
        const pct = (stage.value / max) * 100;
        const previous = i > 0 ? stages[i - 1]!.value : null;
        const conversion =
          previous && previous > 0 ? Math.round((stage.value / previous) * 100) : null;

        return (
          <li key={stage.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{stage.label}</span>
              <span className="tabular flex items-baseline gap-2">
                <span className="font-semibold">{stage.value.toLocaleString()}</span>
                {conversion !== null ? (
                  <span className="text-xs text-muted-foreground">{conversion}%</span>
                ) : null}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/80 transition-all"
                style={{ width: `${Math.max(pct, stage.value > 0 ? 2 : 0)}%` }}
              />
            </div>
            {stage.hint ? (
              <p className="mt-1 text-xs text-muted-foreground">{stage.hint}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
