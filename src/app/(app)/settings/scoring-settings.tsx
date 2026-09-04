"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ScoreKind, SignalCategory } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { humanizeEnum } from "@/lib/util/format";

/**
 * Editing a scoring configuration.
 *
 * Points are bounded to 0-100 and cannot be negative: the model has no
 * concept of a penalty, and allowing one here would quietly introduce
 * scoring people down for what a university failed to publish.
 */

export interface RuleView {
  id: string;
  key: string;
  label: string;
  category: SignalCategory;
  signalKey: string;
  points: number;
  active: boolean;
}

export interface ConfigView {
  id: string;
  name: string;
  kind: ScoreKind;
  description: string | null;
  discoveryThreshold: number;
  rules: RuleView[];
}

export function ScoringSettings({ config }: { config: ConfigView }) {
  const router = useRouter();
  const [rules, setRules] = useState<RuleView[]>(config.rules);
  const [threshold, setThreshold] = useState(config.discoveryThreshold);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    threshold !== config.discoveryThreshold ||
    rules.some((r, i) => r.points !== config.rules[i]?.points || r.active !== config.rules[i]?.active);

  function updateRule(id: string, patch: Partial<RuleView>) {
    setRules((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/scoring", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configId: config.id,
          ...(config.kind === "DISCOVERY" ? { discoveryThreshold: threshold } : {}),
          rules: rules.map((r) => ({ id: r.id, points: r.points, active: r.active })),
        }),
      });
      const body = (await res.json()) as { error?: string; note?: string };

      if (!res.ok) {
        setError(body.error ?? "Could not save.");
        return;
      }

      setMessage(body.note ?? "Saved.");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  const byCategory = rules.reduce<Record<string, RuleView[]>>((acc, rule) => {
    (acc[rule.category] ??= []).push(rule);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>{config.name}</CardTitle>
        <CardDescription>{config.description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {config.kind === "DISCOVERY" ? (
          <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-accent/40 p-4">
            <label className="w-32 space-y-1">
              <span className="text-xs font-medium">Discovery threshold</span>
              <Input
                type="number"
                min={0}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(Number.parseInt(e.target.value, 10) || 0)}
              />
            </label>
            <p className="flex-1 text-sm text-muted-foreground">
              Candidates scoring at or above this enter the enrichment queue. Everyone below stays
              discovered and fully scored, and is simply never looked up in a directory. Raising it
              enriches fewer people; lowering it enriches more.
            </p>
          </div>
        ) : null}

        <div className="space-y-4">
          {Object.entries(byCategory).map(([category, categoryRules]) => (
            <div key={category}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {humanizeEnum(category)}
              </h4>
              <ul className="space-y-1.5">
                {categoryRules.map((rule) => (
                  <li key={rule.id} className="flex items-center gap-3 rounded-md border p-2.5">
                    <input
                      type="checkbox"
                      checked={rule.active}
                      onChange={(e) => updateRule(rule.id, { active: e.target.checked })}
                      className="size-4 rounded border-input"
                      aria-label={`Enable ${rule.label}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{rule.label}</p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">
                        {rule.signalKey}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={rule.points}
                      disabled={!rule.active}
                      onChange={(e) =>
                        updateRule(rule.id, { points: Math.max(0, Number.parseInt(e.target.value, 10) || 0) })
                      }
                      className="w-20 text-right"
                      aria-label={`Points for ${rule.label}`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-success">{message}</p> : null}

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          {dirty ? <span className="text-xs text-muted-foreground">Unsaved changes</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
