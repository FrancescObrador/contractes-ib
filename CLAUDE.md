# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install          # Install dependencies
pnpm ingest           # Download CAIB CSV and build data/caib/contracts.json
pnpm ingest-historic  # Scrape pre-2017 contracts → data/caib/contracts-historic.json (resumable, ~2h)
pnpm dev              # Start dev server at http://localhost:3000
pnpm build            # Run ingest then production build (pnpm ingest && next build)
pnpm lint             # Run ESLint
pnpm doctor           # React Doctor checks
```

No test framework is configured — there are no unit tests.

**Important:** `pnpm dev` does NOT run ingest automatically. You must run `pnpm ingest` at least once before starting the dev server, otherwise the app will show empty data.

### CLI package

```bash
# From packages/contractes-cli/
node --check bin/contractes.js   # Syntax check
node bin/contractes.js --help    # Run locally

# Test against local dev server:
CONTRACTES_API_BASE=http://localhost:3000 node bin/contractes.js search-contracts --search salut
```

## Environment variables

```
TURSO_URL=libsql://<db-name>-<org>.turso.io
TURSO_TOKEN=<db-token>       # or TURSO_AUTH_TOKEN
```

Without these, BORME data (company administrators, person search) is silently disabled — the site still works without them.

## Architecture

**Monorepo** with `pnpm-workspace.yaml`:
- `/` — Next.js 16 web app (App Router, Server Components)
- `packages/contractes-cli/` — Standalone CLI published to npm as `@gerardgimenezadsuar/contractes-cli`

### Data sources

1. **CAIB CSV (static file)** — All contract data from the Govern de les Illes Balears open data portal.
   - Source URL: `https://intranet.caib.es/opendatacataleg/dataset/c992354b-7546-4280-a144-6211f6ecfed4/resource/34ea0416-90fb-43cc-a866-4933cc6ce6e1/download/contractes_ca.csv`
   - Format: semicolon-separated, comma decimal, UTF-8, ~16 MB, updated quarterly
   - `scripts/ingest.mjs` downloads it and saves a cleaned `data/caib/contracts.json`
   - `src/lib/caib-data.ts` loads `contracts.json` at startup (module-level singleton)
   - All queries in `src/lib/api.ts` are pure JavaScript array operations — no network calls at runtime

2. **Historic contracts (static file, committed to repo)** — Pre-2017 contract data scraped from the legacy CAIB platform.
   - Source: `https://plataformadecontractacio.caib.es` (HTML-only, no API)
   - Coverage: June 2008 – July 23, 2017 (~13,926 contracts)
   - `scripts/ingest-historic.mjs` scrapes and writes `data/caib/contracts-historic.json`
   - This file is **committed to the repo** (data never changes — the platform was frozen in 2017)
   - Only needs to be regenerated if the scraper logic changes: `pnpm ingest-historic` (resumable, ~2–3h)
   - `src/lib/caib-data.ts` loads it automatically if present and prepends it to the main array
   - **Data quality note:** NIF is rarely published in the pre-2017 platform. When a company name is available but NIF is missing, a synthetic identifier `NOM:COMPANY_NAME` is used so the contract passes the `isAwarded` filter. When award amount is missing, the tender budget (`pressupost_licitacio_sense`) is used as a proxy.

3. **Turso (libsql)** — BORME (Spanish company registry) data for administrator/person history. Lives in `src/lib/borme.ts`. In-process cache with TTL. Gracefully degrades if missing config or when reads are throttled.

### Key files

- `scripts/ingest.mjs` — Downloads CAIB CSV, parses it, writes `data/caib/contracts.json`
- `scripts/ingest-historic.mjs` — Scrapes pre-2017 contracts from the legacy CAIB platform, writes `data/caib/contracts-historic.json`. Resumable via `data/caib/contracts-historic-progress.json`.
- `src/lib/caib-data.ts` — Loads and merges `contracts-historic.json` (if present) + `contracts.json` into a single in-memory singleton (server-side only)
- `src/lib/api.ts` — All data-fetching functions as JS array operations over the cached data. This is the main business logic layer. Server-side only.
- `src/lib/types.ts` — Shared TypeScript interfaces (`Contract`, `CompanyAggregation`, `ContractFilters`, etc.)
- `src/lib/borme.ts` — Turso client and BORME queries (admin history, person search/profiles)
- `src/lib/company-identity.ts` — Handles masked NIF identifiers (some companies use `**` in their ID)
- `src/config/constants.ts` — CAIB CSV URL, cache durations, filter lists (contract types, procedure types), site metadata

### Data notes

- **No CPV codes** in CAIB data. `fetchCpvDistribution()` always returns `[]`. CPV filters are ignored in company/contract queries.
- **No `nom_departament_ens`, `nom_ambit`, `lloc_execucio`, `durada_contracte`** fields.
- `es_pime` and `financiacio_ue` are `"Sí"` / `"No"` strings.
- Amounts in CAIB data use comma as decimal separator; `ingest.mjs` converts them to floats.
- `import_adjudicacio_sense` and `import_adjudicacio_amb_iva` are stored as numbers in JSON but converted to strings in the `Contract` type for UI compatibility.
- **Historic contracts (pre-2017):** `identificacio_adjudicatari` may be a synthetic `NOM:…` key (not a real NIF). `import_adjudicacio_sense` may equal `pressupost_licitacio_sense` (budget proxy). `es_pime` and `financiacio_ue` are always `"No"`. `ofertes_rebudes` is always `0`. The `font` field is `"historic"` (not part of the TypeScript interface but present in the JSON).

### App routes

- `/` — Dashboard (KPIs, top companies, top organs, yearly trend)
- `/empreses` — Company ranking with search/pagination
- `/empreses/[id]` — Company detail (yearly evolution, contracts)
- `/contractes` — Contract explorer with filters
- `/analisi` — Analysis of minor contracts (≤15k EUR threshold)
- `/organismes/[id]` — Contracting organ detail
- `/persones` — Person search (via BORME/Turso)
- `/persones/[name]` — Person profile (companies they administered, linked contracts)

### API routes

The app exposes internal API routes under `/api/` that the CLI calls:
- `/api/contractes` — Contract search
- `/api/empreses` — Company search/ranking
- `/api/organismes` — Organ search
- `/api/persones` — Person search (proxies to Turso)
- `/api/persones_network` — Person-company network data

### Company identity

Some companies have masked NIFs (contain `**`). Use `buildCompanyIdentityKey(id, name)` from `src/lib/company-identity.ts` to build consistent keys, and `buildCompanyHref(id, name)` to generate links that include the `?name=` query param for masked companies.

### CLI architecture

`packages/contractes-cli/bin/contractes.js` is a single-file ESM CLI with no dependencies. It calls the Next.js API routes (default: `https://www.contractes.cat`, overridable via `CONTRACTES_API_BASE`). Keep the `attribution` command output stable — agents rely on it.

### Build / deployment

`pnpm build` runs `node scripts/ingest.mjs && next build`. On Vercel, every deployment automatically downloads a fresh copy of the CAIB CSV so the data is always current at build time. Since the CSV is updated quarterly, this is sufficient.

`contracts-historic.json` is committed to the repo and does not need to be regenerated on each deployment — the pre-2017 data is static. If the scraper logic ever changes, run `pnpm ingest-historic` locally and commit the updated file.
