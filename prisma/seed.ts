/**
 * Seeds the database.
 *
 * Always installs the built-in configuration (signal taxonomy and scoring
 * rules) and the application user. When DEMO_MODE is on it also creates the
 * synthetic demo university and registers its fixture-backed sources.
 *
 * Note what the demo seed does NOT do: it does not insert candidates, scores
 * or evidence. Those are produced by running the real pipeline over the demo
 * sources, so the demo exercises the actual code path rather than a
 * pre-baked result.
 *
 *   npm run db:seed              install config, user, and demo sources
 *   npm run demo:reset           delete all demo data first, then reseed
 */

import { PrismaClient } from "@prisma/client";
import { bootstrapConfiguration } from "../src/lib/config/bootstrap";
import { hashPassword } from "../src/lib/auth/password";
import { seedDemoUniversities, deleteDemoData } from "../src/lib/demo/seed-demo";

const prisma = new PrismaClient();

async function main() {
  const reset = process.argv.includes("--reset");
  const demoMode = (process.env.DEMO_MODE ?? "true").toLowerCase() === "true";

  if (reset) {
    console.log("Removing existing demo data…");
    const removed = await deleteDemoData(prisma);
    console.log(`  removed ${removed.universities} demo universit(ies) and everything under them`);
  }

  console.log(
    reset
      ? "Restoring built-in configuration to defaults…"
      : "Installing built-in configuration…",
  );
  const config = await bootstrapConfiguration(prisma, { restoreDefaults: reset });
  console.log(
    `  ${config.signalDefinitions} signal definitions, ${config.scoringConfigs} scoring configs, ${config.scoringRules} scoring rules`,
  );

  const email = (process.env.DEMO_USER_EMAIL ?? "demo@example.com").toLowerCase();
  const password = process.env.DEMO_USER_PASSWORD ?? "demo-password-change-me";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Application user already exists: ${email}`);
  } else {
    await prisma.user.create({
      data: {
        email,
        name: "Demo Recruiter",
        passwordHash: await hashPassword(password),
        role: "ADMIN",
      },
    });
    console.log(`Created application user: ${email}`);
  }

  if (demoMode) {
    console.log("Seeding demo universities and their fixture-backed sources…");
    const demo = await seedDemoUniversities(prisma);
    for (const u of demo) {
      console.log(`  ${u.name}: ${u.sourceCount} sources registered (${u.notFound} categories not found)`);
    }
    console.log(
      "\nDemo data is synthetic. Run the pipeline from a university page, or use\n" +
        "the Run full pipeline button, to populate candidates, signals and scores.",
    );
  } else {
    console.log("DEMO_MODE is off; skipping demo data.");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
