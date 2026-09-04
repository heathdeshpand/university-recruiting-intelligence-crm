/**
 * Account management.
 *
 *   npm run user -- list
 *   npm run user -- create <email> "<Full Name>" [ADMIN|RECRUITER|VIEWER]
 *   npm run user -- password <email>
 *   npm run user -- disable <email>
 *
 * Passwords are never taken from the command line. An argument would end up
 * in shell history and in the process list of every other user on the
 * machine, so this prompts for it with echo turned off instead.
 */

import { createInterface } from "node:readline";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";

/** Reads a line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;

    if (!input.isTTY) {
      reject(new Error("A terminal is required to enter a password."));
      return;
    }

    output.write(question);

    const rl = createInterface({ input, output, terminal: true });

    // Suppress the echo of typed characters while still showing the prompt.
    let muted = false;
    const write = output.write.bind(output);
    (output as unknown as { write: (chunk: string) => boolean }).write = (chunk: string) =>
      muted ? true : write(chunk);
    muted = true;

    rl.question("", (answer) => {
      muted = false;
      (output as unknown as { write: typeof write }).write = write;
      output.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

async function readNewPassword(): Promise<string> {
  const password = await promptHidden("New password (at least 8 characters): ");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");

  const confirmation = await promptHidden("Confirm: ");
  if (password !== confirmation) throw new Error("The two passwords did not match.");

  return password;
}

async function list() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  if (users.length === 0) {
    console.log("No users. Create one with:\n  npm run user -- create you@example.com \"Your Name\" ADMIN");
    return;
  }
  console.log(`${users.length} user(s):\n`);
  for (const u of users) {
    const state = u.active ? "" : "  (disabled)";
    const seen = u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 10) : "never";
    console.log(`  ${u.email.padEnd(32)} ${u.role.padEnd(10)} last sign-in: ${seen}${state}`);
  }
}

async function create(email: string, name: string, role: string) {
  const normalized = email.trim().toLowerCase();
  const validRoles = ["ADMIN", "RECRUITER", "VIEWER"];
  if (!validRoles.includes(role)) {
    throw new Error(`Role must be one of ${validRoles.join(", ")}.`);
  }
  if (await prisma.user.findUnique({ where: { email: normalized } })) {
    throw new Error(`${normalized} already exists. Use "password" to change their password.`);
  }

  const password = await readNewPassword();
  await prisma.user.create({
    data: {
      email: normalized,
      name,
      role: role as "ADMIN" | "RECRUITER" | "VIEWER",
      passwordHash: await hashPassword(password),
    },
  });
  console.log(`Created ${normalized} as ${role}.`);
}

async function setPassword(email: string) {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) throw new Error(`No user with the email ${normalized}.`);

  const password = await readNewPassword();
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password) },
  });

  // Every existing session is invalidated, so a password change actually
  // ends access rather than only changing what the next sign-in needs.
  const { count } = await prisma.session.deleteMany({ where: { userId: user.id } });
  console.log(`Password updated for ${normalized}. ${count} existing session(s) signed out.`);
}

async function disable(email: string) {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) throw new Error(`No user with the email ${normalized}.`);

  await prisma.user.update({ where: { id: user.id }, data: { active: false } });
  const { count } = await prisma.session.deleteMany({ where: { userId: user.id } });
  console.log(`Disabled ${normalized}. ${count} session(s) signed out.`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "list":
      await list();
      break;
    case "create":
      if (args.length < 2) throw new Error('Usage: npm run user -- create <email> "<Full Name>" [ROLE]');
      await create(args[0]!, args[1]!, args[2] ?? "ADMIN");
      break;
    case "password":
      if (args.length < 1) throw new Error("Usage: npm run user -- password <email>");
      await setPassword(args[0]!);
      break;
    case "disable":
      if (args.length < 1) throw new Error("Usage: npm run user -- disable <email>");
      await disable(args[0]!);
      break;
    default:
      console.log(
        [
          "Account management.",
          "",
          "  npm run user -- list",
          '  npm run user -- create <email> "<Full Name>" [ADMIN|RECRUITER|VIEWER]',
          "  npm run user -- password <email>",
          "  npm run user -- disable <email>",
          "",
          "Passwords are prompted for, never passed as arguments.",
        ].join("\n"),
      );
  }
}

main()
  .catch((e) => {
    console.error(`\n  ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
