import Link from "next/link";
import { redirect } from "next/navigation";
import { Radar } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { demoModeEnabled } from "@/lib/env";
import { DemoBanner } from "@/components/app/demo-banner";
import { Nav } from "@/components/app/nav";
import { SignOutButton } from "@/components/app/sign-out-button";

/**
 * Authenticated application shell.
 *
 * Every page under this layout requires a session. Auth is checked here on the
 * server rather than in middleware so that the check and the data fetching for
 * a page share one request context.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      {demoModeEnabled ? <DemoBanner /> : null}
      <div className="flex flex-1">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card md:flex">
          <Link href="/" className="flex items-center gap-2.5 border-b px-5 py-4">
            <Radar className="size-5 text-primary" />
            <div className="leading-tight">
              <div className="text-sm font-semibold">Recruiting Intelligence</div>
              <div className="text-xs text-muted-foreground">University CRM</div>
            </div>
          </Link>

          <div className="flex-1 overflow-y-auto">
            <Nav />
          </div>

          <div className="border-t p-3">
            <div className="px-3 pb-2">
              <div className="truncate text-sm font-medium">{user.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {user.role.toLowerCase()}
              </div>
            </div>
            <SignOutButton />
          </div>
        </aside>

        <main className="min-w-0 flex-1 bg-background">{children}</main>
      </div>
    </div>
  );
}
