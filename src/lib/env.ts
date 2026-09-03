import { z } from "zod";

/**
 * Environment configuration, validated once at module load.
 *
 * Validation is intentionally strict about the things that would silently
 * produce a broken or unsafe deployment (missing database URL, short session
 * secret) and lenient about the things that are genuinely optional (search
 * and AI providers). A fresh checkout with only DATABASE_URL and
 * SESSION_SECRET set is a fully working install.
 */

const bool = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? defaultValue : v.toLowerCase() === "true"));

const int = (defaultValue: number, min?: number, max?: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? defaultValue : Number.parseInt(v, 10)))
    .pipe(
      z
        .number()
        .int()
        .min(min ?? Number.MIN_SAFE_INTEGER)
        .max(max ?? Number.MAX_SAFE_INTEGER),
    );

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required. Copy .env.example to .env."),
  TEST_DATABASE_URL: z.string().optional(),

  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters. See .env.example for how to generate one."),
  SESSION_TTL_HOURS: int(24, 1, 24 * 90),

  APP_URL: z.string().url().default("http://localhost:3000"),

  DEMO_MODE: bool(true),
  DEMO_USER_EMAIL: z.string().email().default("demo@example.com"),
  DEMO_USER_PASSWORD: z.string().min(8).default("demo-password-change-me"),

  HTTP_USER_AGENT: z
    .string()
    .default("UniversityRecruitingIntelligenceCRM/0.1 (+contact: you@example.com)"),
  HTTP_TIMEOUT_MS: int(15_000, 1_000, 120_000),
  HTTP_PER_HOST_DELAY_MS: int(1_500, 0, 60_000),

  DISCOVERY_MAX_PAGES: int(60, 1, 5_000),
  DISCOVERY_MAX_DEPTH: int(2, 0, 5),
  RESPECT_ROBOTS_TXT: bool(true),
  ENABLE_LIVE_NETWORK: bool(false),

  SEARCH_PROVIDER: z.enum(["", "brave", "serpapi"]).default(""),
  SEARCH_API_KEY: z.string().optional().default(""),

  AI_PROVIDER: z.enum(["", "anthropic", "openai", "custom"]).default(""),
  AI_API_KEY: z.string().optional().default(""),
  AI_MODEL: z.string().optional().default(""),
  AI_BASE_URL: z.string().optional().default(""),

  DISCOVERY_THRESHOLD: int(60, 0, 100),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\n` +
        `Copy .env.example to .env and fill in the required values.`,
    );
  }
  return parsed.data;
}

export const env: Env = loadEnv();

/** True when outbound requests to real websites are permitted. */
export const liveNetworkEnabled = env.ENABLE_LIVE_NETWORK;

/** True when the demo banner shows and demo fixture adapters are available. */
export const demoModeEnabled = env.DEMO_MODE;

/** True when a web-search API is configured for source discovery. */
export const searchApiConfigured = env.SEARCH_PROVIDER !== "" && env.SEARCH_API_KEY !== "";

/** True when an AI provider is configured for optional assisted classification. */
export const aiConfigured = env.AI_PROVIDER !== "" && env.AI_API_KEY !== "";
