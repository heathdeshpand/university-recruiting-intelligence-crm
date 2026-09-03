import { redirect } from "next/navigation";
import { Radar } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { demoModeEnabled, env } from "@/lib/env";
import { LoginForm } from "@/app/login/login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Radar className="size-8 text-primary" />
          <h1 className="text-lg font-semibold">Recruiting Intelligence CRM</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to discover, resolve and rank university candidates.
          </p>
        </div>

        <LoginForm />

        {demoModeEnabled ? (
          <div className="rounded-lg border border-dashed bg-card p-4 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Demo Mode is on</p>
            <p>
              Seed the demo dataset with{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">npm run db:seed</code>, then
              sign in as{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">{env.DEMO_USER_EMAIL}</code>.
              The password is whatever <code className="font-mono">DEMO_USER_PASSWORD</code> is set
              to in your <code className="font-mono">.env</code>.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
