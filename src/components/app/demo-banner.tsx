import { FlaskConical } from "lucide-react";

/**
 * Demo Mode banner.
 *
 * Deliberately loud and always visible. Everything below it is synthetic:
 * fictional people at a fictional university. Nobody should ever be able to
 * screenshot this app and mistake demo output for real student records.
 */
export function DemoBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-warning px-4 py-1.5 text-center text-xs font-medium text-warning-foreground">
      <FlaskConical className="size-3.5 shrink-0" />
      <span>
        <strong>Demo Mode</strong> — all universities, sources, people and scores shown here are
        synthetic. No real student data is present, and no live websites are contacted.
      </span>
    </div>
  );
}
