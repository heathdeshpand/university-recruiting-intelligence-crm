import * as React from "react";
import { cn } from "@/lib/util/cn";

/**
 * A single headline number.
 *
 * `hint` exists because most numbers in this product need a caveat: a count of
 * zero can mean "not run yet", and a count of sources can mean "found" rather
 * than "usable".
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "success" | "warning" | "destructive" | "info";
  className?: string;
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    info: "text-info",
  }[tone];

  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon ? <div className="text-muted-foreground [&_svg]:size-4">{icon}</div> : null}
      </div>
      <p className={cn("tabular mt-1.5 text-2xl font-semibold", toneClass)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
