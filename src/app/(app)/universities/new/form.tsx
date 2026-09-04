"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Splits a comma- or newline-separated field into trimmed values. */
function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function NewUniversityForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      shortName: String(form.get("shortName") ?? ""),
      primaryDomain: String(form.get("primaryDomain") ?? ""),
      additionalDomains: splitList(String(form.get("additionalDomains") ?? "")),
      athleticName: String(form.get("athleticName") ?? ""),
      aliases: splitList(String(form.get("aliases") ?? "")),
      city: String(form.get("city") ?? ""),
      state: String(form.get("state") ?? ""),
      country: String(form.get("country") ?? "US") || "US",
      notes: String(form.get("notes") ?? ""),
    };

    try {
      const res = await fetch("/api/universities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { error?: string; university?: { slug: string } };

      if (!res.ok || !body.university) {
        setError(body.error ?? "Could not create the university.");
        setPending(false);
        return;
      }

      router.push(`/universities/${body.university.slug}`);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>How the university is named and addressed on the web.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required placeholder="University of Illinois Urbana-Champaign" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="shortName">Short name</Label>
              <Input id="shortName" name="shortName" placeholder="UIUC" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="athleticName">Athletic name</Label>
              <Input id="athleticName" name="athleticName" placeholder="Fighting Illini" />
              <p className="text-xs text-muted-foreground">
                Athletics sites often use a different name from the university.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="aliases">Aliases</Label>
            <Input id="aliases" name="aliases" placeholder="Illinois, UIUC, U of I" />
            <p className="text-xs text-muted-foreground">
              Comma separated. Used to recognise the university in page titles and link text.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Domains</CardTitle>
          <CardDescription>
            Discovery only crawls these domains and their subdomains. It never follows links off
            them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="primaryDomain">Primary domain</Label>
            <Input
              id="primaryDomain"
              name="primaryDomain"
              required
              placeholder="illinois.edu"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              A full URL, an email address or a leading @ all work — they are reduced to the
              domain.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="additionalDomains">Additional domains</Label>
            <Input
              id="additionalDomains"
              name="additionalDomains"
              placeholder="fightingillini.com, involvement.illinois.edu"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Comma separated. Athletics and student-involvement platforms are frequently on their
              own domains.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location and notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="state">State</Label>
              <Input id="state" name="state" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country">Country</Label>
              <Input id="country" name="country" defaultValue="US" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" name="notes" placeholder="Anything a teammate should know" />
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending ? "Creating…" : "Create university"}
        </Button>
      </div>
    </form>
  );
}
