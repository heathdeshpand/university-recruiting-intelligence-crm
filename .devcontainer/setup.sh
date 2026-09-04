#!/usr/bin/env bash
#
# Runs once when a codespace or dev container is created.
#
# This is the documented local setup from docs/local-development.md, with the
# database URL pointing at the compose service and a session secret generated
# fresh rather than copied from the example.
#
# It runs in the workspace folder, so it never changes directory -- an earlier
# version cd'd to a hardcoded path, which silently installed dependencies
# somewhere the terminal never opened.

set -uo pipefail

fail() {
  echo ""
  echo "  Setup did not finish: $1"
  echo ""
  echo "  Run this in the terminal to finish it by hand:"
  echo "    npm install && npm run db:migrate:deploy && npm run db:seed"
  echo ""
  exit 1
}

echo "Working directory: $(pwd)"

if [ ! -f package.json ]; then
  fail "no package.json here, so this is not the repository root."
fi

echo "Installing dependencies…"
npm ci || npm install || fail "dependency installation failed."

if [ ! -x node_modules/.bin/next ]; then
  fail "dependencies installed but Next.js is missing from node_modules."
fi

if [ ! -f .env ]; then
  echo "Creating .env…"
  cp .env.example .env || fail "could not create .env"

  SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")"

  # Point at the compose database and install a real secret.
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://postgres:postgres@db:5432/recruiting_crm?schema=public\"|" .env
  sed -i "s|^TEST_DATABASE_URL=.*|TEST_DATABASE_URL=\"postgresql://postgres:postgres@db:5432/recruiting_crm_test?schema=public\"|" .env
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=\"${SECRET}\"|" .env

  echo ".env created with a freshly generated session secret."
fi

# The database container is healthy before this script runs, but the very
# first connection can still race it.
echo "Waiting for PostgreSQL…"
for attempt in $(seq 1 30); do
  if node -e "
    const net = require('net');
    const s = net.connect(5432, 'db');
    s.on('connect', () => { s.end(); process.exit(0); });
    s.on('error', () => process.exit(1));
  " 2>/dev/null; then
    echo "PostgreSQL is accepting connections."
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    fail "PostgreSQL did not become reachable."
  fi
  sleep 2
done

echo "Applying migrations…"
npm run db:migrate:deploy || fail "migrations failed."

echo "Seeding the demo dataset…"
npm run db:seed || fail "seeding failed."

cat <<'MESSAGE'

  Ready.

    npm run dev                                    start the app on port 3000
    npm run pipeline -- example-state-university   run the pipeline in the terminal
    npm run check                                  typecheck, lint and tests

  Sign in with the DEMO_USER_EMAIL and DEMO_USER_PASSWORD from .env.

MESSAGE
