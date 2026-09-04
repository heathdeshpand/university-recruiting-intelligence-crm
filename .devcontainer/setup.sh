#!/usr/bin/env bash
#
# Runs once when a codespace or dev container is created.
#
# Everything here is the documented local setup from docs/local-development.md,
# with the database URL pointing at the compose service and a session secret
# generated fresh rather than copied from the example.

set -euo pipefail

cd /workspace

echo "Installing dependencies…"
npm ci

if [ ! -f .env ]; then
  echo "Creating .env…"
  cp .env.example .env

  SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")"

  # Point at the compose database and install a real secret.
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://postgres:postgres@db:5432/recruiting_crm?schema=public\"|" .env
  sed -i "s|^TEST_DATABASE_URL=.*|TEST_DATABASE_URL=\"postgresql://postgres:postgres@db:5432/recruiting_crm_test?schema=public\"|" .env
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=\"${SECRET}\"|" .env

  # A codespace forwards port 3000 over https, but the CSRF origin check
  # compares against APP_URL. Leaving it as localhost is correct for the
  # in-browser preview; if you open the forwarded URL directly, set APP_URL
  # to that origin.
  echo ".env created with a freshly generated session secret."
fi

echo "Applying migrations…"
npm run db:migrate:deploy

echo "Seeding the demo dataset…"
npm run db:seed

cat <<'MESSAGE'

  Ready.

    npm run dev                                    start the app on port 3000
    npm run pipeline -- example-state-university   run the pipeline from the terminal
    npm run check                                  typecheck, lint and tests

  Sign in with the DEMO_USER_EMAIL and DEMO_USER_PASSWORD in .env.

MESSAGE
