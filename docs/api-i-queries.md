# APIs i consultes al dataset

## Fonts de dades

### 1. CAIB CSV (font principal, 2017–present)

- **URL:** `https://intranet.caib.es/opendatacataleg/dataset/c992354b-7546-4280-a144-6211f6ecfed4/resource/34ea0416-90fb-43cc-a866-4933cc6ce6e1/download/contractes_ca.csv`
- **Cobertura:** Juliol 2017 – present
- **Format:** CSV separats per punt i coma, decimals amb coma, UTF-8, ~16 MB
- **Actualització:** Trimestral. En cada desplegament a Vercel es baixa automàticament.
- **Ingestió:** `scripts/ingest.mjs` el descarrega, el parseja i escriu `data/caib/contracts.json` (gitignored).
- **Càrrega en memòria:** `src/lib/caib-data.ts` carrega el JSON en un singleton de mòdul la primera vegada que es necessita. Totes les consultes posteriors usen la mateixa referència en memòria.

### 2. Contractes històrics (font estàtica, 2008–2017)

- **Font:** `https://plataformadecontractacio.caib.es` (plataforma llegada de la CAIB, només HTML)
- **Cobertura:** Juny 2008 – 23 juliol 2017 (~13.926 contractes)
- **Ingestió:** `scripts/ingest-historic.mjs` fa scraping paginat i escriu `data/caib/contracts-historic.json`.
- **Persistència:** El fitxer JSON **està commitat al repositori** — les dades mai canvien (la plataforma va quedar congelada el 2017). No cal regenerar-lo en cada desplegament.
- **Càrrega:** `src/lib/caib-data.ts` el carrega automàticament si existeix i el preposa a l'array principal.
- **Qualitat de dades:**
  - El NIF de l'adjudicatari rarament es publica. Quan hi ha nom d'empresa però no NIF, s'usa un identificador sintètic `NOM:NOM_EMPRESA` per tal que el contracte passi el filtre `isAwarded`.
  - Quan no hi ha import adjudicat, s'usa el pressupost de licitació (`pressupost_licitacio_sense`) com a valor aproximat.
  - `es_pime`, `financiacio_ue` sempre `"No"`. `ofertes_rebudes` sempre `0`.
  - El camp `font: "historic"` és present al JSON però no forma part de la interfície TypeScript `CaibContract`.

### 3. Turso / BORME (font secundària, opcional)

- Base de dades libsql allotjada a Turso.
- Conté dades del Registre Mercantil (BORME): historial d'administradors, cerca de persones i perfils.
- Es configura amb `TURSO_URL` i `TURSO_TOKEN`. Si no hi ha credencials, el sistema degrada silenciosament i les funcions de persones no retornen res.
- Codi a `src/lib/borme.ts`. Inclou caché en memòria amb TTL.

---

## Model de dades

### `CaibContract` (raw, intern)

Estructura directa del JSON ingerit. Els imports ja són `number` (el CSV original usa coma com a decimal).

| Camp | Tipus | Descripció | Disponible pre-2017 |
|------|-------|------------|:---:|
| `nom_organ` | `string` | Òrgan contractant | ✅ |
| `year` | `number` | Any (derivat de les dates) | ✅ |
| `codi_expedient` | `string` | Codi únic de l'expedient | ✅ |
| `denominacio` | `string` | Nom del contracte | ✅ |
| `tipus_contracte` | `string` | Tipus (Serveis, Obres, etc.) | ✅ |
| `procediment` | `string` | Procediment (Contracte menor, Obert, etc.) | ✅ |
| `identificacio_adjudicatari` | `string` | NIF/CIF (o sintètic `NOM:…` per a històrics sense NIF) | ⚠️ parcial |
| `denominacio_adjudicatari` | `string` | Nom de l'empresa adjudicatària | ⚠️ parcial |
| `import_adjudicacio_sense` | `number` | Import adjudicat sense IVA (€); pot ser el pressupost com a proxy | ⚠️ proxy |
| `import_adjudicacio_amb_iva` | `number` | Import adjudicat amb IVA (€) | ⚠️ proxy |
| `pressupost_licitacio_sense` | `number` | Pressupost de licitació sense IVA | ✅ |
| `data_adjudicacio_contracte` | `string` | Data d'adjudicació (ISO) | ⚠️ parcial |
| `data_formalitzacio_contracte` | `string` | Data de formalització (ISO) | ⚠️ parcial |
| `data_publicacio_anunci` | `string` | Data de publicació (ISO) | ⚠️ parcial |
| `ofertes_rebudes` | `number` | Nombre d'ofertes rebudes | ❌ (sempre 0) |
| `numero_lot` | `string` | Número de lot | ❌ (sempre buit) |
| `resultat` | `string` | Resultat | ✅ |
| `enllac_publicacio` | `string` | URL de publicació | ✅ |
| `es_pime` | `string` | `"Sí"` o `"No"` | ❌ (sempre "No") |
| `financiacio_ue` | `string` | `"Sí"` o `"No"` | ❌ (sempre "No") |

### `Contract` (públic, retornat per l'API)

Com `CaibContract`, però `import_adjudicacio_sense` i `import_adjudicacio_amb_iva` s'exposen com a `string` per compatibilitat amb la UI.

**Criteri "adjudicat":** Un contracte es considera vàlid si té `identificacio_adjudicatari`, `denominacio_adjudicatari` i `import_adjudicacio_sense > 0`. Els contractes pre-2017 sense nom d'empresa no passen aquest filtre i queden exclosos de rànquings i estadístiques.

---

## Capa de consultes (`src/lib/api.ts`)

**No hi ha xarxa en runtime.** Totes les funcions fan operacions pures sobre l'array en memòria (`getContracts()`). No hi ha SQL ni crides HTTP.

### Ordenació de dates

La funció `bestDate()` tria la millor data disponible per a un contracte, per ordre de preferència:
1. `data_adjudicacio_contracte`
2. `data_formalitzacio_contracte`
3. `data_publicacio_anunci`

### Estadístiques globals

| Funció | Retorna |
|--------|---------|
| `fetchTotalContracts()` | Nombre total de contractes adjudicats |
| `fetchTotalAmount()` | Import total adjudicat (€) |
| `fetchUniqueCompanies()` | Nombre d'empreses úniques |
| `fetchYearlyTrend()` | `YearlyAggregation[]` — total i nombre per any |

### Empreses

| Funció | Paràmetres rellevants | Descripció |
|--------|-----------------------|------------|
| `fetchTopCompanies(limit, opts?)` | `minYear`, `maxYear`, `organ` | Top empreses per import total |
| `fetchCompanies(offset, limit, search?, cpv?, sort?)` | `sort`: `total-desc/asc`, `contracts-desc/asc`, `name-asc/desc`, `current_year-desc/asc` | Llista paginada i buscable d'empreses |
| `fetchCompaniesCount(search?)` | — | Total d'empreses (per a paginació) |
| `fetchCompanyDetail(id, name?)` | `id`: NIF/CIF; `name`: fallback per NIFs emmascarats | Agregació i evolució anual d'una empresa |
| `fetchCompanyContracts(id, name?, offset, limit)` | — | Contractes d'una empresa, ordenats per data desc |
| `fetchCompanyContractsCount(id, name?)` | — | Nombre de contractes d'una empresa |
| `fetchCompanyLastAwardDate(id, name?)` | — | Última data d'adjudicació |
| `fetchCompanyTopOrgans(id, name?, limit)` | — | Òrgans que més han contractat l'empresa |

> **NIFs emmascarats:** Alguns NIF contenen `**`. Usar `buildCompanyIdentityKey(id, name)` de `src/lib/company-identity.ts` per construir claus consistents.

### Òrgans

| Funció | Paràmetres rellevants | Descripció |
|--------|-----------------------|------------|
| `fetchTopOrgans(limit, opts?)` | `minYear`, `maxYear` | Top òrgans per import total |
| `fetchOrgans(offset, limit, search?, opts?)` | `includeCurrentYear`, `sort` | Llista paginada d'òrgans |
| `fetchOrgansCount(search?)` | — | Total d'òrgans |
| `fetchOrganDetail(organ)` | `organ`: nom exacte | Agregació i evolució anual |
| `fetchOrganContracts(organ, offset, limit, filters?)` | `filters.year` | Contractes d'un òrgan |
| `fetchOrganContractsCount(organ)` | — | Nombre de contractes |
| `fetchOrganLastAwardDate(organ)` | — | Última data d'adjudicació |
| `fetchOrganTopCompanies(organ, limit)` | — | Empreses que més han contractat amb l'òrgan |

### Explorador de contractes

```ts
fetchContracts(filters: ContractFilters): Promise<Contract[]>
fetchContractsCount(filters: ContractFilters): Promise<number>
```

**`ContractFilters`:**

| Paràmetre | Tipus | Descripció |
|-----------|-------|------------|
| `year` | `string` | Filtre per any |
| `tipus_contracte` | `string` | Filtre per tipus exacte |
| `procediment` | `string` | Filtre per procediment exacte |
| `amountMin` | `string` | Import mínim (€, parseFloat) |
| `amountMax` | `string` | Import màxim (€, parseFloat) |
| `nom_organ` | `string` | Filtre per nom exacte de l'òrgan |
| `nif` | `string` | Filtre per NIF/CIF exacte |
| `awardee_name` | `string` | Cerca parcial (case-insensitive) al nom de l'empresa |
| `search` | `string` | Cerca parcial a `denominacio`, `denominacio_adjudicatari`, `nom_organ`, `codi_expedient` |
| `page` | `number` | Pàgina (1-indexed) |
| `pageSize` | `number` | Mida de pàgina (default: 50) |
| `orderBy` | `string` | `"date"` o qualsevol string que contingui `"import"` |
| `orderDir` | `"ASC" \| "DESC"` | Ordre |

### Persones (via BORME)

```ts
fetchContractsByAwardees(filters: AwardeeContractFilters): Promise<Contract[]>
fetchContractsByAwardeesCount(filters)
fetchContractsByAwardeesSummary(filters)  // { total, totalAmount }
```

**`AwardeeContractFilters`** (intern):

| Paràmetre | Descripció |
|-----------|------------|
| `nifs` | Array de NIFs a incloure |
| `names` | Array de noms parcials a incloure |
| `nifDateWindows` | Finestres temporals per NIF: `[{ nif, dateFrom?, dateTo? }]` |
| `nom_organ` | Filtre per òrgan (exacte) |
| `dateFrom` / `dateTo` | Filtre global de dates (ISO: `YYYY-MM-DD`) |
| `page`, `pageSize` | Paginació |
| `orderDir` | `"ASC"` o `"DESC"` per data |

### Anàlisi de contractes menors

| Funció | Descripció |
|--------|------------|
| `fetchThresholdDistribution()` | Distribució en cubells de 500 € (0–15.000 €) de contractes menors |
| `fetchMinorBandSummary()` | Resum de la banda de risc (14.900–15.000 €) |
| `fetchTopOrgansInMinorRiskBand(limit)` | Òrgans amb més contractes a la banda de risc |
| `fetchTopCompaniesInMinorRiskBand(limit)` | Empreses amb més contractes a la banda de risc |
| `fetchMinorShareYearly()` | Evolució anual de la proporció de contractes menors |

### Distribucions

| Funció | Descripció |
|--------|------------|
| `fetchProcedureDistribution()` | Nombre i import per procediment |
| `fetchContractTypeDistribution()` | Nombre i import per tipus de contracte |
| `fetchCpvDistribution()` | Retorna sempre `[]` (CAIB no té codis CPV) |

---

## API HTTP (`/api/`)

Totes les rutes retornen `{ data, total? }` en JSON (GET) o CSV si `format=csv`. Caché: `s-maxage=21600` (6 h), `stale-while-revalidate=86400` (24 h).

### `GET /api/contractes`

| Paràmetre | Descripció |
|-----------|------------|
| `year` | Any (string) |
| `tipus_contracte` | Tipus exacte |
| `procediment` | Procediment exacte |
| `amountMin` / `amountMax` | Import mínim/màxim |
| `nom_organ` | Nom exacte de l'òrgan |
| `nif` | NIF exacte |
| `awardee_name` | Cerca parcial per nom d'empresa |
| `search` | Cerca global (denominació, empresa, òrgan, expedient) |
| `page` | Pàgina (default: 1) |
| `sort` | `date-desc` (default), `date-asc`, `amount-desc`, `amount-asc` |
| `format` | `csv` per descarregar |

**Resposta JSON:** `{ data: Contract[], total: number }`

### `GET /api/empreses`

| Paràmetre | Descripció |
|-----------|------------|
| `search` | Cerca per nom o NIF (mínim 2 caràcters) |
| `page` | Pàgina (default: 1) |
| `includeTotal` | `0` per ometre el camp `total` (default: inclòs) |
| `format` | `csv` per descarregar |

**Resposta JSON:** `{ data: CompanyAggregation[], total?: number }`

### `GET /api/organismes`

| Paràmetre | Descripció |
|-----------|------------|
| `search` | Cerca per nom (mínim 2 caràcters) |
| `page` | Pàgina (default: 1) |
| `limit` | Mida de pàgina (màx. 100, default: 50) |
| `includeTotal` | `0` per ometre el `total` |
| `includeCurrentYear` | `0` per ometre `total_current_year` |
| `format` | `csv` per descarregar |

**Resposta JSON:** `{ data: OrganAggregation[], total?: number }`

### `GET /api/organismes/top-empreses`

| Paràmetre | Descripció |
|-----------|------------|
| `organ` | Nom exacte de l'òrgan (obligatori) |
| `limit` | Nombre d'empreses (1–50, default: 10) |

**Resposta JSON:** `{ data: CompanyAggregation[] }`

### `GET /api/persones`

| Paràmetre | Descripció |
|-----------|------------|
| `search` | Cerca per nom (mínim 3 caràcters) |
| `page` | Pàgina (default: 1) |

**Resposta JSON:** `{ data: Person[], total: number }` (via Turso/BORME)

### `GET /api/persones/[name]/contractes`

| Paràmetre | Descripció |
|-----------|------------|
| `nifs` | NIFs separats per coma (si buit, es carrega el perfil des de BORME) |
| `nif_windows` | Finestres per NIF: `NIF,YYYY-MM-DD,YYYY-MM-DD;...` |
| `nom_organ` | Filtre per òrgan (exacte) |
| `date_from` / `date_to` | Filtre de dates (ISO) |
| `sort` | `date-desc` (default), `date-asc`, `amount-desc`, `amount-asc` |
| `page` | Pàgina |

**Resposta JSON:** `{ data: Contract[], total: number, totalAmount: number }`

---

## Valors de referència

### Tipus de contracte (`tipus_contracte`)

**2017–present (CSV CAIB):** `Serveis`, `Subministraments`, `Obres`, `Concessió de serveis`, `Administratiu especial`, `Altra legislació sectorial`, `Privat d'Administració Pública`, `Concessió d'obres`

**Pre-2017 (plataforma llegada):** `Serveis`, `Subministraments`, `Obres`, `Gestió de serveis públics`, `Concessió d'obres`, `Concessió de serveis`, `Col·laboració publicoprivada`, `Administratiu especial`, `Altres`

### Procediments (`procediment`)

**2017–present:** `Contracte menor`, `Obert`, `Obert simplificat abreujat`, `Obert Simplificat`, `Negociat sense publicitat`, `Restringit`, `Tramitació amb mesures de gestió eficient`, `Negociat amb publicitat`, `Licitació amb negociació`, `Diàleg competitiu`

**Pre-2017:** `Negociat sense Publicitat`, `Obert`, `Restringit`, `Negociat amb Publicitat`, entre altres (nomenclatura de la legislació anterior a la LCSP 2017).

### Llindar de contracte menor
`15.000 €` (constant `MINOR_CONTRACT_THRESHOLD`)
