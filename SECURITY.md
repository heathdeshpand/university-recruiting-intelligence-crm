# Security

## Reporting a vulnerability

Report privately — please do not open a public issue.

Open a [GitHub security advisory](../../security/advisories/new), or contact
the repository owner directly.

Useful in a report: what the issue is, how to reproduce it, which version or
commit, and what an attacker could achieve. A proof of concept helps.

## Never include in a report

- Real student data, or any real personal data
- Real credentials, session tokens or API keys
- A generated export workbook
- Database dumps from a live installation

If a vulnerability can only be demonstrated with real data, describe it and
we will find a safe way to reproduce it. **Use the synthetic demo dataset**
(`npm run db:seed`) wherever possible.

## Scope

In scope:

- Authentication and session handling
- Authorization between users and roles
- SQL, command or template injection
- Cross-site scripting or request forgery
- Path traversal, particularly in export download
- Data exposure through API routes
- Anything that bypasses the fetch layer's politeness controls

Out of scope:

- Missing hardening on a local development server
- Vulnerabilities requiring an already-compromised host
- Denial of service by volume against your own installation
- Anything only reachable with `ENABLE_LIVE_NETWORK=true` against a site you
  chose to target

## How the application is protected

**Passwords** are hashed with scrypt from Node's standard library, with
per-password salts and parameters stored alongside the hash so cost can be
raised without invalidating existing hashes. Verification is constant-time.

**Sessions** are opaque 256-bit tokens. The database stores only their
SHA-256 hash, so a database dump cannot be replayed as a login. Cookies are
`HttpOnly`, `SameSite=Lax`, and `Secure` in production. Expiry is enforced
server-side.

**CSRF** is defended twice: `SameSite=Lax` cookies, plus an explicit
`Origin`/`Referer` check on every state-changing request, so the app does not
depend on browser behaviour alone. The check accepts the configured `APP_URL`
and the origin the request was actually addressed to, reconstructed from the
forwarded host and protocol — comparing Origin against the request's own host
is the standard check, and it means a proxy, tunnel or forwarded port works
without configuration. An attacker's page has its own origin, which never
equals the host of the request it forged.

**Rate limiting** is applied per IP to login (10 per 15 minutes) and per user
to job-starting endpoints and general API traffic. It is in-process and
single-node, and says so.

**Input validation** goes through Zod on every mutating endpoint. Database
access is entirely through Prisma's parameterised queries.

**Authorization** is role-based (`ADMIN`, `RECRUITER`, `VIEWER`), checked in
route handlers rather than in middleware, so the check and the data fetch
share one request context.

**Export downloads** require a session, resolve filenames only inside the
export directory with an explicit containment check, and are recorded in the
audit log — "who took a copy of this data" is exactly what an audit log is for.

**Outbound requests** all pass through one client that enforces the live
network switch, robots.txt, per-host delays, timeouts and a response size cap.
A new adapter cannot bypass it.

**Audit logging** covers source activation, match decisions, manual merges and
splits, score recalculation, configuration changes, exports and downloads, and
is readable in the application under Activity. Entries survive the deletion of
what they describe -- deleting a university nulls the reference rather than
cascading, so the record of what was done to it, including the deletion, is
not destroyed along with it.

**Logs redact** email, phone, password, token, key, cookie and authorization
fields.

## Known limitations

Stated plainly rather than left to be discovered:

- **Rate limiting is per process.** Behind multiple replicas it needs Redis or
  the database.
- **The job runner is single-node.** Job claiming is safe across processes, but
  there is no distributed scheduler.
- **No account lockout.** Repeated failures are rate-limited by IP, not locked.
- **No email verification or password reset**, because there is no mail
  transport — deliberate, since the product sends nothing.
- **No 2FA.**
- **Exports are stored unencrypted on disk.** Protect the volume.

## Deployment guidance

1. Generate a fresh `SESSION_SECRET`; never reuse the example.
2. Change `DEMO_USER_PASSWORD`, or delete the demo user.
3. Serve over HTTPS — `Secure` cookies depend on it.
4. Set `APP_URL` to the real origin, or the CSRF origin check will reject
   legitimate requests.
5. Restrict database network access.
6. Put the export directory on a volume you control, and set a retention
   policy.
7. Leave `RESPECT_ROBOTS_TXT=true`.
8. Set `HTTP_USER_AGENT` to identify you with a working contact address.

## Local development

`.env` is gitignored and must never be committed. So are `storage/` and
`*.xlsx`, because a generated workbook contains personal data.

Use the synthetic demo dataset. There is no reason to put real student data in
a development database, and every reason not to.
