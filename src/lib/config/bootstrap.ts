import type { PrismaClient } from "@prisma/client";
import { SIGNAL_DEFINITIONS } from "@/lib/config/signals";
import { DEFAULT_SCORING_CONFIGS } from "@/lib/config/scoring";

/**
 * Copies the built-in defaults from code into the database.
 *
 * The split matters: code holds the defaults, the database holds the live,
 * editable configuration. Re-running this is safe -- it upserts definitions
 * and rules by their stable keys, so a recruiter's edits to *values* survive,
 * while newly added built-ins appear.
 */

export interface BootstrapResult {
  signalDefinitions: number;
  scoringConfigs: number;
  scoringRules: number;
}

export async function bootstrapConfiguration(
  prisma: PrismaClient,
  options: { restoreDefaults?: boolean } = {},
): Promise<BootstrapResult> {
  let scoringRules = 0;

  for (const def of SIGNAL_DEFINITIONS) {
    await prisma.signalDefinition.upsert({
      where: { key: def.key },
      // Labels and descriptions are refreshed from code; `active` is not,
      // so a signal a deployment has switched off stays off.
      update: { label: def.label, category: def.category, description: def.description },
      create: { ...def, isBuiltIn: true },
    });
  }

  for (const configSeed of DEFAULT_SCORING_CONFIGS) {
    const config = await prisma.scoringConfig.upsert({
      where: { name_kind: { name: configSeed.name, kind: configSeed.kind } },
      update: {
        description: configSeed.description,
        categoryCaps: configSeed.categoryCaps as never,
        ...(options.restoreDefaults
          ? { discoveryThreshold: configSeed.discoveryThreshold }
          : {}),
      },
      create: {
        name: configSeed.name,
        kind: configSeed.kind,
        description: configSeed.description,
        isDefault: true,
        discoveryThreshold: configSeed.discoveryThreshold,
        categoryCaps: configSeed.categoryCaps as never,
      },
    });

    for (const rule of configSeed.rules) {
      await prisma.scoringRule.upsert({
        where: { configId_key: { configId: config.id, key: rule.key } },
        update: {
          label: rule.label,
          category: rule.category,
          signalKey: rule.signalKey,
          order: rule.order,
          // Points are a recruiter's to tune, so an ordinary re-seed leaves
          // them alone. `demo:reset` passes restoreDefaults to put them back.
          ...(options.restoreDefaults
            ? {
                points: rule.points,
                minOccurrences: rule.minOccurrences ?? 1,
                pointsPerExtraOccurrence: rule.pointsPerExtraOccurrence ?? 0,
                maxPoints: rule.maxPoints ?? null,
                active: true,
              }
            : {}),
        },
        create: {
          configId: config.id,
          key: rule.key,
          label: rule.label,
          category: rule.category,
          signalKey: rule.signalKey,
          points: rule.points,
          minOccurrences: rule.minOccurrences ?? 1,
          pointsPerExtraOccurrence: rule.pointsPerExtraOccurrence ?? 0,
          maxPoints: rule.maxPoints ?? null,
          order: rule.order,
        },
      });
      scoringRules += 1;
    }
  }

  return {
    signalDefinitions: SIGNAL_DEFINITIONS.length,
    scoringConfigs: DEFAULT_SCORING_CONFIGS.length,
    scoringRules,
  };
}

/** Returns the active default config for a scoring kind. */
export async function getDefaultScoringConfig(
  prisma: PrismaClient,
  kind: "DISCOVERY" | "FINAL",
) {
  const config = await prisma.scoringConfig.findFirst({
    where: { kind, isDefault: true },
    include: { rules: { where: { active: true }, orderBy: { order: "asc" } } },
  });
  if (!config) {
    throw new Error(
      `No default ${kind} scoring configuration found. Run \`npm run db:seed\` to install the built-in defaults.`,
    );
  }
  return config;
}
