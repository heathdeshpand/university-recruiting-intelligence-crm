# University Recruiting Intelligence CRM

A university recruiting intelligence CRM that discovers public university data
sources, resolves fragmented student records into single candidate identities,
identifies explainable recruiting signals, selectively enriches only
high-signal candidates, and exports recruiter-ready workbooks.

> **Status: in active development.** See [Project status](#project-status) for
> exactly what works today. Nothing in this README describes functionality that
> is not implemented.

## The pipeline

```
University → Source Discovery → Source Registry → Data Collection →
Normalization → Entity Resolution → Signal Extraction → Discovery Scoring →
Selective Enrichment → Final Scoring → CRM → Spreadsheet Export
```

## Quick start

```bash
npm install
cp .env.example .env     # then edit DATABASE_URL and SESSION_SECRET
npm run db:migrate
npm run db:seed
npm run dev
```

Full setup instructions, including PostgreSQL configuration, are in
[docs/local-development.md](docs/local-development.md).

## Project status

| Area | State |
| --- | --- |
| Project foundation, auth, database schema | Implemented |
| Configuration layer (signals, scoring rules) | Implemented |
| Synthetic demo dataset | Implemented |
| University and source registry | In progress |
| Source discovery, collection, normalization | In progress |
| Entity resolution, signals, scoring | In progress |
| Enrichment, CRM, exports, analytics | In progress |

This README is expanded as each phase lands.

## Licence

See [LICENSE](LICENSE).
