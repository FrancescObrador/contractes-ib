/**
 * api.ts — CAIB data access layer
 *
 * All functions load data from the in-memory JSON cache (populated by
 * `scripts/ingest.mjs` via `src/lib/caib-data.ts`) and perform pure
 * JavaScript array operations.  No network requests are made at runtime.
 *
 * Function signatures are kept identical to the previous Socrata-based
 * implementation so that all pages and API routes continue to work.
 */

import { getContracts, type CaibContract } from "./caib-data";
import type {
  Contract,
  CompanyAggregation,
  OrganAggregation,
  YearlyAggregation,
  CompanyYearAggregation,
  OrganYearAggregation,
  ProcedureAggregation,
  ContractTypeAggregation,
  ThresholdBucket,
  ContractFilters,
  MinorRiskEntityAggregation,
  MinorBandSummary,
  MinorShareYear,
} from "./types";
import { DEFAULT_PAGE_SIZE, MINOR_CONTRACT_THRESHOLD } from "@/config/constants";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface AwardeeContractFilters {
  nifs?: string[];
  names?: string[];
  nifDateWindows?: Array<{ nif: string; dateFrom?: string; dateTo?: string }>;
  page?: number;
  pageSize?: number;
  orderBy?: string;
  orderDir?: "ASC" | "DESC";
  nom_organ?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface AwardeeContractsSummary {
  total: number;
  totalAmount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Contracts that have been awarded (have an adjudicatari and positive amount). */
const AWARDED = (c: CaibContract): boolean =>
  c.identificacio_adjudicatari !== "" &&
  c.denominacio_adjudicatari !== "" &&
  c.import_adjudicacio_sense > 0;

/** Convert a CaibContract to the public Contract interface. */
function toContract(c: CaibContract): Contract {
  return {
    codi_expedient: c.codi_expedient,
    denominacio: c.denominacio,
    tipus_contracte: c.tipus_contracte,
    procediment: c.procediment,
    nom_organ: c.nom_organ,
    identificacio_adjudicatari: c.identificacio_adjudicatari,
    denominacio_adjudicatari: c.denominacio_adjudicatari,
    import_adjudicacio_sense: String(c.import_adjudicacio_sense),
    import_adjudicacio_amb_iva: String(c.import_adjudicacio_amb_iva),
    data_adjudicacio_contracte: c.data_adjudicacio_contracte,
    data_formalitzacio_contracte: c.data_formalitzacio_contracte,
    data_publicacio_anunci: c.data_publicacio_anunci,
    ofertes_rebudes: c.ofertes_rebudes,
    numero_lot: c.numero_lot,
    pressupost_licitacio_sense: c.pressupost_licitacio_sense,
    pressupost_licitacio_amb: c.pressupost_licitacio_sense, // approximate
    resultat: c.resultat,
    enllac_publicacio: c.enllac_publicacio,
    es_pime: c.es_pime,
    financiacio_ue: c.financiacio_ue,
  };
}

/** Return the best available date string for a contract (for sorting). */
function bestDate(c: CaibContract): string {
  return (
    c.data_adjudicacio_contracte ||
    c.data_formalitzacio_contracte ||
    c.data_publicacio_anunci ||
    ""
  );
}

/** Compare two date strings descending (later dates first). */
function compareDateDesc(a: string, b: string): number {
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

/** Compare two date strings ascending. */
function compareDateAsc(a: string, b: string): number {
  return -compareDateDesc(a, b);
}

/**
 * Build a company aggregation map keyed by identificacio_adjudicatari.
 * Only awarded contracts are included.
 */
function groupByCompany(contracts: CaibContract[]): Map<
  string,
  {
    identificacio_adjudicatari: string;
    denominacio_adjudicatari: string;
    total: number;
    count: number;
    yearlyMap: Map<number, { total: number; count: number }>;
  }
> {
  const map = new Map<
    string,
    {
      identificacio_adjudicatari: string;
      denominacio_adjudicatari: string;
      total: number;
      count: number;
      yearlyMap: Map<number, { total: number; count: number }>;
    }
  >();

  for (const c of contracts) {
    const key = c.identificacio_adjudicatari;
    if (!map.has(key)) {
      map.set(key, {
        identificacio_adjudicatari: key,
        denominacio_adjudicatari: c.denominacio_adjudicatari,
        total: 0,
        count: 0,
        yearlyMap: new Map(),
      });
    }
    const entry = map.get(key)!;
    entry.total += c.import_adjudicacio_sense;
    entry.count += 1;
    // Yearly breakdown
    const yr = entry.yearlyMap.get(c.year) || { total: 0, count: 0 };
    yr.total += c.import_adjudicacio_sense;
    yr.count += 1;
    entry.yearlyMap.set(c.year, yr);
  }
  return map;
}

/**
 * Build an organ aggregation map keyed by nom_organ.
 */
function groupByOrgan(contracts: CaibContract[]): Map<
  string,
  {
    nom_organ: string;
    total: number;
    count: number;
    yearlyMap: Map<number, { total: number; count: number }>;
  }
> {
  const map = new Map<
    string,
    {
      nom_organ: string;
      total: number;
      count: number;
      yearlyMap: Map<number, { total: number; count: number }>;
    }
  >();

  for (const c of contracts) {
    const key = c.nom_organ;
    if (!map.has(key)) {
      map.set(key, {
        nom_organ: key,
        total: 0,
        count: 0,
        yearlyMap: new Map(),
      });
    }
    const entry = map.get(key)!;
    entry.total += c.import_adjudicacio_sense;
    entry.count += 1;
    const yr = entry.yearlyMap.get(c.year) || { total: 0, count: 0 };
    yr.total += c.import_adjudicacio_sense;
    yr.count += 1;
    entry.yearlyMap.set(c.year, yr);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Summary stats
// ---------------------------------------------------------------------------

export async function fetchTotalContracts(): Promise<number> {
  const contracts = getContracts();
  return contracts.filter(AWARDED).length;
}

export async function fetchTotalAmount(): Promise<number> {
  const contracts = getContracts();
  return contracts
    .filter(AWARDED)
    .reduce((sum, c) => sum + c.import_adjudicacio_sense, 0);
}

export async function fetchUniqueCompanies(): Promise<number> {
  const contracts = getContracts();
  const cifs = new Set(
    contracts.filter(AWARDED).map((c) => c.identificacio_adjudicatari)
  );
  return cifs.size;
}

// ---------------------------------------------------------------------------
// Top companies
// ---------------------------------------------------------------------------

export async function fetchTopCompanies(
  limit: number,
  opts?: { minYear?: number; maxYear?: number; organ?: string }
): Promise<CompanyAggregation[]> {
  let contracts = getContracts().filter(AWARDED);

  if (opts?.minYear != null) {
    contracts = contracts.filter((c) => c.year >= opts.minYear!);
  }
  if (opts?.maxYear != null) {
    contracts = contracts.filter((c) => c.year <= opts.maxYear!);
  }
  if (opts?.organ) {
    const organ = opts.organ.toLowerCase();
    contracts = contracts.filter((c) =>
      c.nom_organ.toLowerCase().includes(organ)
    );
  }

  const map = groupByCompany(contracts);
  const entries = Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  return entries.map((e) => ({
    identificacio_adjudicatari: e.identificacio_adjudicatari,
    denominacio_adjudicatari: e.denominacio_adjudicatari,
    total: String(e.total),
    num_contracts: String(e.count),
  }));
}

// ---------------------------------------------------------------------------
// Yearly trend
// ---------------------------------------------------------------------------

export async function fetchYearlyTrend(): Promise<YearlyAggregation[]> {
  const contracts = getContracts().filter(AWARDED);
  const yearMap = new Map<number, { total: number; count: number }>();

  for (const c of contracts) {
    const entry = yearMap.get(c.year) || { total: 0, count: 0 };
    entry.total += c.import_adjudicacio_sense;
    entry.count += 1;
    yearMap.set(c.year, entry);
  }

  return Array.from(yearMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, { total, count }]) => ({
      year: String(year),
      total: String(total),
      num_contracts: String(count),
    }));
}

// ---------------------------------------------------------------------------
// Companies list (paginated, searchable)
// ---------------------------------------------------------------------------

export type CompanySort =
  | "total-desc"
  | "total-asc"
  | "contracts-desc"
  | "contracts-asc"
  | "name-asc"
  | "name-desc"
  | "current_year-desc"
  | "current_year-asc";

export async function fetchCompanies(
  offset: number,
  limit: number,
  search?: string,
  _cpv?: string[], // CPV not available in CAIB data — ignored
  sort: CompanySort = "total-desc"
): Promise<CompanyAggregation[]> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const contracts = getContracts().filter(AWARDED);
  const map = groupByCompany(contracts);

  let entries = Array.from(map.values());

  if (search) {
    const q = search.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.denominacio_adjudicatari.toLowerCase().includes(q) ||
        e.identificacio_adjudicatari.toLowerCase().includes(q)
    );
  }

  // Build current-year totals if needed for sorting
  const needsCurrentYear = sort.startsWith("current_year");
  let currentYearTotals: Map<string, number> | null = null;
  if (needsCurrentYear) {
    currentYearTotals = new Map();
    for (const c of contracts.filter((c) => c.year === currentYear)) {
      if (!AWARDED(c)) continue;
      const prev = currentYearTotals.get(c.identificacio_adjudicatari) ?? 0;
      currentYearTotals.set(c.identificacio_adjudicatari, prev + c.import_adjudicacio_sense);
    }
  }

  switch (sort) {
    case "total-asc":       entries.sort((a, b) => a.total - b.total); break;
    case "contracts-desc":  entries.sort((a, b) => b.count - a.count); break;
    case "contracts-asc":   entries.sort((a, b) => a.count - b.count); break;
    case "name-asc":        entries.sort((a, b) => a.denominacio_adjudicatari.localeCompare(b.denominacio_adjudicatari, "ca")); break;
    case "name-desc":       entries.sort((a, b) => b.denominacio_adjudicatari.localeCompare(a.denominacio_adjudicatari, "ca")); break;
    case "current_year-desc": entries.sort((a, b) => (currentYearTotals!.get(b.identificacio_adjudicatari) ?? 0) - (currentYearTotals!.get(a.identificacio_adjudicatari) ?? 0)); break;
    case "current_year-asc":  entries.sort((a, b) => (currentYearTotals!.get(a.identificacio_adjudicatari) ?? 0) - (currentYearTotals!.get(b.identificacio_adjudicatari) ?? 0)); break;
    default:                entries.sort((a, b) => b.total - a.total); break; // total-desc
  }

  const currentYearContractsForPage = needsCurrentYear ? null : (() => {
    const cyContracts = contracts.filter((c) => c.year === currentYear);
    const cyMap = groupByCompany(cyContracts);
    return cyMap;
  })();

  return entries.slice(offset, offset + limit).map((e) => {
    const cyTotal = currentYearTotals
      ? (currentYearTotals.get(e.identificacio_adjudicatari) ?? 0)
      : (currentYearContractsForPage?.get(e.identificacio_adjudicatari)?.total ?? 0);
    return {
      identificacio_adjudicatari: e.identificacio_adjudicatari,
      denominacio_adjudicatari: e.denominacio_adjudicatari,
      total: String(e.total),
      num_contracts: String(e.count),
      total_current_year: String(cyTotal),
    };
  });
}

export async function fetchCompaniesCount(
  search?: string,
  _cpv?: string[]
): Promise<number> {
  const contracts = getContracts().filter(AWARDED);
  const map = groupByCompany(contracts);
  let entries = Array.from(map.values());

  if (search) {
    const q = search.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.denominacio_adjudicatari.toLowerCase().includes(q) ||
        e.identificacio_adjudicatari.toLowerCase().includes(q)
    );
  }

  return entries.length;
}

export async function fetchCompanyIdsPage(
  offset = 0,
  limit = DEFAULT_PAGE_SIZE
): Promise<string[]> {
  const contracts = getContracts().filter(AWARDED);
  const map = groupByCompany(contracts);
  const ids = Array.from(map.keys());
  ids.sort();
  return ids.slice(offset, offset + limit);
}

// ---------------------------------------------------------------------------
// Organs list (paginated, searchable)
// ---------------------------------------------------------------------------

export type OrganSort =
  | "total-desc"
  | "total-asc"
  | "contracts-desc"
  | "contracts-asc"
  | "name-asc"
  | "name-desc"
  | "current_year-desc"
  | "current_year-asc";

export async function fetchOrgans(
  offset: number,
  limit: number,
  search?: string,
  opts?: { includeCurrentYear?: boolean; minYear?: number; maxYear?: number; sort?: OrganSort }
): Promise<OrganAggregation[]> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const sort: OrganSort = opts?.sort ?? "total-desc";

  const contracts = getContracts().filter(AWARDED);
  const map = groupByOrgan(contracts);

  let entries = Array.from(map.values());

  if (search) {
    const q = search.toLowerCase();
    entries = entries.filter((e) =>
      e.nom_organ.toLowerCase().includes(q)
    );
  }

  const needsCurrentYear = sort.startsWith("current_year") || opts?.includeCurrentYear;
  const currentYearMap = needsCurrentYear
    ? groupByOrgan(contracts.filter((c) => c.year === currentYear))
    : null;

  switch (sort) {
    case "total-asc":         entries.sort((a, b) => a.total - b.total); break;
    case "contracts-desc":    entries.sort((a, b) => b.count - a.count); break;
    case "contracts-asc":     entries.sort((a, b) => a.count - b.count); break;
    case "name-asc":          entries.sort((a, b) => a.nom_organ.localeCompare(b.nom_organ, "ca")); break;
    case "name-desc":         entries.sort((a, b) => b.nom_organ.localeCompare(a.nom_organ, "ca")); break;
    case "current_year-desc": entries.sort((a, b) => (currentYearMap!.get(b.nom_organ)?.total ?? 0) - (currentYearMap!.get(a.nom_organ)?.total ?? 0)); break;
    case "current_year-asc":  entries.sort((a, b) => (currentYearMap!.get(a.nom_organ)?.total ?? 0) - (currentYearMap!.get(b.nom_organ)?.total ?? 0)); break;
    default:                  entries.sort((a, b) => b.total - a.total); break; // total-desc
  }

  const page = entries.slice(offset, offset + limit);

  // Optionally include current year totals
  if (opts?.includeCurrentYear) {
    const resolvedCurrentYearMap = currentYearMap ?? groupByOrgan(contracts.filter((c) => c.year === currentYear));

    return page.map((e) => {
      const cy = resolvedCurrentYearMap.get(e.nom_organ);
      return {
        nom_organ: e.nom_organ,
        total: String(e.total),
        num_contracts: String(e.count),
        total_current_year: cy ? String(cy.total) : "0",
      };
    });
  }

  return page.map((e) => ({
    nom_organ: e.nom_organ,
    total: String(e.total),
    num_contracts: String(e.count),
  }));
}

export async function fetchOrgansCount(search?: string): Promise<number> {
  const contracts = getContracts().filter(AWARDED);
  const map = groupByOrgan(contracts);
  let entries = Array.from(map.values());

  if (search) {
    const q = search.toLowerCase();
    entries = entries.filter((e) =>
      e.nom_organ.toLowerCase().includes(q)
    );
  }

  return entries.length;
}

export async function fetchOrganNamesPage(
  offset = 0,
  limit = DEFAULT_PAGE_SIZE
): Promise<string[]> {
  const contracts = getContracts().filter(AWARDED);
  const map = groupByOrgan(contracts);
  const names = Array.from(map.keys());
  names.sort();
  return names.slice(offset, offset + limit);
}

// ---------------------------------------------------------------------------
// Organ detail
// ---------------------------------------------------------------------------

export async function fetchOrganDetail(organ: string): Promise<{
  organ: OrganAggregation;
  yearly: OrganYearAggregation[];
}> {
  const contracts = getContracts()
    .filter(AWARDED)
    .filter((c) => c.nom_organ === organ);

  let total = 0;
  let count = 0;
  const yearMap = new Map<number, { total: number; count: number }>();

  for (const c of contracts) {
    total += c.import_adjudicacio_sense;
    count += 1;
    const yr = yearMap.get(c.year) || { total: 0, count: 0 };
    yr.total += c.import_adjudicacio_sense;
    yr.count += 1;
    yearMap.set(c.year, yr);
  }

  const yearly: OrganYearAggregation[] = Array.from(yearMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, { total: t, count: cnt }]) => ({
      nom_organ: organ,
      year: String(year),
      total: String(t),
      num_contracts: String(cnt),
    }));

  return {
    organ: {
      nom_organ: organ,
      total: String(total),
      num_contracts: String(count),
    },
    yearly,
  };
}

export async function fetchOrganContracts(
  organ: string,
  offset: number,
  limit: number,
  filters?: { year?: string }
): Promise<Contract[]> {
  let contracts = getContracts()
    .filter(AWARDED)
    .filter((c) => c.nom_organ === organ);

  if (filters?.year) {
    const yr = parseInt(filters.year, 10);
    contracts = contracts.filter((c) => c.year === yr);
  }

  contracts.sort((a, b) => compareDateDesc(bestDate(a), bestDate(b)));

  return contracts.slice(offset, offset + limit).map(toContract);
}

export async function fetchOrganRecentContracts(
  organ: string,
  limit: number
): Promise<Contract[]> {
  const contracts = getContracts()
    .filter(AWARDED)
    .filter((c) => c.nom_organ === organ);

  contracts.sort((a, b) => compareDateDesc(bestDate(a), bestDate(b)));

  return contracts.slice(0, limit).map(toContract);
}

export async function fetchOrganContractsCount(organName: string): Promise<number> {
  return getContracts()
    .filter(AWARDED)
    .filter((c) => c.nom_organ === organName).length;
}

export async function fetchOrganLastAwardDate(
  organ: string
): Promise<string | undefined> {
  const contracts = getContracts()
    .filter(AWARDED)
    .filter((c) => c.nom_organ === organ);

  if (contracts.length === 0) return undefined;

  contracts.sort((a, b) => compareDateDesc(bestDate(a), bestDate(b)));
  return bestDate(contracts[0]) || undefined;
}

export async function fetchOrganTopCompanies(
  organ: string,
  limit: number
): Promise<CompanyAggregation[]> {
  const contracts = getContracts()
    .filter(AWARDED)
    .filter((c) => c.nom_organ === organ);

  const map = groupByCompany(contracts);
  const entries = Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  return entries.map((e) => ({
    identificacio_adjudicatari: e.identificacio_adjudicatari,
    denominacio_adjudicatari: e.denominacio_adjudicatari,
    total: String(e.total),
    num_contracts: String(e.count),
  }));
}

// ---------------------------------------------------------------------------
// Top organs (for home page)
// ---------------------------------------------------------------------------

export async function fetchTopOrgans(
  limit: number,
  opts?: { minYear?: number; maxYear?: number }
): Promise<OrganAggregation[]> {
  let contracts = getContracts().filter(AWARDED);

  if (opts?.minYear != null) {
    contracts = contracts.filter((c) => c.year >= opts.minYear!);
  }
  if (opts?.maxYear != null) {
    contracts = contracts.filter((c) => c.year <= opts.maxYear!);
  }

  const map = groupByOrgan(contracts);
  return Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map((e) => ({
      nom_organ: e.nom_organ,
      total: String(e.total),
      num_contracts: String(e.count),
    }));
}

// ---------------------------------------------------------------------------
// Company detail
// ---------------------------------------------------------------------------

export async function fetchCompanyDetail(
  id: string,
  name?: string
): Promise<{
  company: CompanyAggregation;
  yearly: CompanyYearAggregation[];
}> {
  let contracts = getContracts()
    .filter(AWARDED)
    .filter((c) => c.identificacio_adjudicatari === id);

  if (name && contracts.length === 0) {
    // Fallback: search by name if id not found
    const nameLower = name.toLowerCase();
    contracts = getContracts()
      .filter(AWARDED)
      .filter((c) =>
        c.denominacio_adjudicatari.toLowerCase().includes(nameLower)
      );
  }

  const map = groupByCompany(contracts);
  const entry =
    map.get(id) || (map.size > 0 ? Array.from(map.values())[0] : null);

  if (!entry) {
    return {
      company: {
        identificacio_adjudicatari: id,
        denominacio_adjudicatari: name || "",
        total: "0",
        num_contracts: "0",
      },
      yearly: [],
    };
  }

  const yearly: CompanyYearAggregation[] = Array.from(
    entry.yearlyMap.entries()
  )
    .sort(([a], [b]) => a - b)
    .map(([year, { total, count }]) => ({
      denominacio_adjudicatari: entry.denominacio_adjudicatari,
      identificacio_adjudicatari: entry.identificacio_adjudicatari,
      year: String(year),
      total: String(total),
      num_contracts: String(count),
    }));

  return {
    company: {
      identificacio_adjudicatari: entry.identificacio_adjudicatari,
      denominacio_adjudicatari: entry.denominacio_adjudicatari,
      total: String(entry.total),
      num_contracts: String(entry.count),
    },
    yearly,
  };
}

export async function fetchCompanyContracts(
  id: string,
  name?: string,
  offset = 0,
  limit = DEFAULT_PAGE_SIZE
): Promise<Contract[]> {
  let contracts = getContracts()
    .filter(AWARDED)
    .filter((c) => c.identificacio_adjudicatari === id);

  if (name && contracts.length === 0) {
    const nameLower = name.toLowerCase();
    contracts = getContracts()
      .filter(AWARDED)
      .filter((c) =>
        c.denominacio_adjudicatari.toLowerCase().includes(nameLower)
      );
  }

  contracts.sort((a, b) => compareDateDesc(bestDate(a), bestDate(b)));
  return contracts.slice(offset, offset + limit).map(toContract);
}

export async function fetchCompanyContractsCount(
  id: string,
  companyName?: string
): Promise<number> {
  let contracts = getContracts()
    .filter(AWARDED)
    .filter((c) => c.identificacio_adjudicatari === id);

  if (companyName && contracts.length === 0) {
    const nameLower = companyName.toLowerCase();
    contracts = getContracts()
      .filter(AWARDED)
      .filter((c) =>
        c.denominacio_adjudicatari.toLowerCase().includes(nameLower)
      );
  }

  return contracts.length;
}

export async function fetchCompanyLastAwardDate(
  id: string,
  companyName?: string
): Promise<string | undefined> {
  let contracts = getContracts()
    .filter(AWARDED)
    .filter((c) => c.identificacio_adjudicatari === id);

  if (companyName && contracts.length === 0) {
    const nameLower = companyName.toLowerCase();
    contracts = getContracts()
      .filter(AWARDED)
      .filter((c) =>
        c.denominacio_adjudicatari.toLowerCase().includes(nameLower)
      );
  }

  if (contracts.length === 0) return undefined;
  contracts.sort((a, b) => compareDateDesc(bestDate(a), bestDate(b)));
  return bestDate(contracts[0]) || undefined;
}

export async function fetchCompanyTopOrgans(
  id: string,
  name?: string,
  limit = 10
): Promise<OrganAggregation[]> {
  let contracts = getContracts()
    .filter(AWARDED)
    .filter((c) => c.identificacio_adjudicatari === id);

  if (name && contracts.length === 0) {
    const nameLower = name.toLowerCase();
    contracts = getContracts()
      .filter(AWARDED)
      .filter((c) =>
        c.denominacio_adjudicatari.toLowerCase().includes(nameLower)
      );
  }

  const map = groupByOrgan(contracts);
  const entries = Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  return entries.map((e) => ({
    nom_organ: e.nom_organ,
    total: String(e.total),
    num_contracts: String(e.count),
  }));
}

// ---------------------------------------------------------------------------
// Contracts by awardees (for persones page)
// ---------------------------------------------------------------------------

export async function fetchContractsByAwardees(
  filters: AwardeeContractFilters
): Promise<Contract[]> {
  const {
    nifs,
    names,
    nifDateWindows,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    orderDir,
    nom_organ,
    dateFrom,
    dateTo,
  } = filters;

  let contracts = getContracts().filter(AWARDED);

  // Filter by NIFs or names
  if ((nifs && nifs.length > 0) || (names && names.length > 0)) {
    const nifSet = new Set(nifs || []);
    const nameLowers = (names || []).map((n) => n.toLowerCase());

    contracts = contracts.filter((c) => {
      if (nifSet.has(c.identificacio_adjudicatari)) return true;
      if (
        nameLowers.some((n) =>
          c.denominacio_adjudicatari.toLowerCase().includes(n)
        )
      )
        return true;
      return false;
    });
  }

  // NIF+date windows
  if (nifDateWindows && nifDateWindows.length > 0) {
    contracts = contracts.filter((c) => {
      return nifDateWindows.some((w) => {
        if (w.nif !== c.identificacio_adjudicatari) return false;
        const date = bestDate(c);
        if (w.dateFrom && date < w.dateFrom) return false;
        if (w.dateTo && date > w.dateTo) return false;
        return true;
      });
    });
  }

  if (nom_organ) {
    contracts = contracts.filter((c) => c.nom_organ === nom_organ);
  }

  if (dateFrom) {
    contracts = contracts.filter((c) => bestDate(c) >= dateFrom);
  }
  if (dateTo) {
    contracts = contracts.filter((c) => bestDate(c) <= dateTo);
  }

  // Sort
  if (orderDir === "ASC") {
    contracts.sort((a, b) => compareDateAsc(bestDate(a), bestDate(b)));
  } else {
    contracts.sort((a, b) => compareDateDesc(bestDate(a), bestDate(b)));
  }

  const offset = (page - 1) * pageSize;
  return contracts.slice(offset, offset + pageSize).map(toContract);
}

export async function fetchContractsByAwardeesCount(
  filters: AwardeeContractFilters
): Promise<number> {
  const { nifs, names, nifDateWindows, nom_organ, dateFrom, dateTo } = filters;

  let contracts = getContracts().filter(AWARDED);

  if ((nifs && nifs.length > 0) || (names && names.length > 0)) {
    const nifSet = new Set(nifs || []);
    const nameLowers = (names || []).map((n) => n.toLowerCase());

    contracts = contracts.filter((c) => {
      if (nifSet.has(c.identificacio_adjudicatari)) return true;
      if (
        nameLowers.some((n) =>
          c.denominacio_adjudicatari.toLowerCase().includes(n)
        )
      )
        return true;
      return false;
    });
  }

  if (nifDateWindows && nifDateWindows.length > 0) {
    contracts = contracts.filter((c) => {
      return nifDateWindows.some((w) => {
        if (w.nif !== c.identificacio_adjudicatari) return false;
        const date = bestDate(c);
        if (w.dateFrom && date < w.dateFrom) return false;
        if (w.dateTo && date > w.dateTo) return false;
        return true;
      });
    });
  }

  if (nom_organ) {
    contracts = contracts.filter((c) => c.nom_organ === nom_organ);
  }

  if (dateFrom) {
    contracts = contracts.filter((c) => bestDate(c) >= dateFrom);
  }
  if (dateTo) {
    contracts = contracts.filter((c) => bestDate(c) <= dateTo);
  }

  return contracts.length;
}

export async function fetchContractsByAwardeesSummary(
  filters: AwardeeContractFilters
): Promise<AwardeeContractsSummary> {
  const { nifs, names, nifDateWindows, nom_organ, dateFrom, dateTo } = filters;

  let contracts = getContracts().filter(AWARDED);

  if ((nifs && nifs.length > 0) || (names && names.length > 0)) {
    const nifSet = new Set(nifs || []);
    const nameLowers = (names || []).map((n) => n.toLowerCase());

    contracts = contracts.filter((c) => {
      if (nifSet.has(c.identificacio_adjudicatari)) return true;
      if (
        nameLowers.some((n) =>
          c.denominacio_adjudicatari.toLowerCase().includes(n)
        )
      )
        return true;
      return false;
    });
  }

  if (nifDateWindows && nifDateWindows.length > 0) {
    contracts = contracts.filter((c) => {
      return nifDateWindows.some((w) => {
        if (w.nif !== c.identificacio_adjudicatari) return false;
        const date = bestDate(c);
        if (w.dateFrom && date < w.dateFrom) return false;
        if (w.dateTo && date > w.dateTo) return false;
        return true;
      });
    });
  }

  if (nom_organ) {
    contracts = contracts.filter((c) => c.nom_organ === nom_organ);
  }

  if (dateFrom) {
    contracts = contracts.filter((c) => bestDate(c) >= dateFrom);
  }
  if (dateTo) {
    contracts = contracts.filter((c) => bestDate(c) <= dateTo);
  }

  const totalAmount = contracts.reduce(
    (sum, c) => sum + c.import_adjudicacio_sense,
    0
  );

  return { total: contracts.length, totalAmount };
}

// ---------------------------------------------------------------------------
// Contracts explorer (paginated, filtered)
// ---------------------------------------------------------------------------

export async function fetchContracts(
  filters: ContractFilters
): Promise<Contract[]> {
  const {
    year,
    tipus_contracte,
    procediment,
    amountMin,
    amountMax,
    nom_organ,
    search,
    nif,
    awardee_name,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    orderBy,
    orderDir = "DESC",
  } = filters;

  let contracts = getContracts().filter(AWARDED);

  if (year) {
    const yr = parseInt(year, 10);
    contracts = contracts.filter((c) => c.year === yr);
  }
  if (tipus_contracte) {
    contracts = contracts.filter(
      (c) => c.tipus_contracte === tipus_contracte
    );
  }
  if (procediment) {
    contracts = contracts.filter((c) => c.procediment === procediment);
  }
  if (amountMin) {
    const min = parseFloat(amountMin);
    if (!isNaN(min)) {
      contracts = contracts.filter((c) => c.import_adjudicacio_sense >= min);
    }
  }
  if (amountMax) {
    const max = parseFloat(amountMax);
    if (!isNaN(max)) {
      contracts = contracts.filter((c) => c.import_adjudicacio_sense <= max);
    }
  }
  if (nom_organ) {
    contracts = contracts.filter((c) => c.nom_organ === nom_organ);
  }
  if (nif) {
    contracts = contracts.filter(
      (c) => c.identificacio_adjudicatari === nif
    );
  }
  if (awardee_name) {
    const q = awardee_name.toLowerCase();
    contracts = contracts.filter((c) =>
      c.denominacio_adjudicatari.toLowerCase().includes(q)
    );
  }
  if (search) {
    const q = search.toLowerCase();
    contracts = contracts.filter(
      (c) =>
        c.denominacio.toLowerCase().includes(q) ||
        c.denominacio_adjudicatari.toLowerCase().includes(q) ||
        c.nom_organ.toLowerCase().includes(q) ||
        c.codi_expedient.toLowerCase().includes(q)
    );
  }

  // Determine sort order.
  // orderBy may contain SQL-like strings from the route; detect by content.
  const isAmountSort = orderBy && orderBy.includes("import");

  if (isAmountSort) {
    if (orderDir === "ASC") {
      contracts.sort(
        (a, b) => a.import_adjudicacio_sense - b.import_adjudicacio_sense
      );
    } else {
      contracts.sort(
        (a, b) => b.import_adjudicacio_sense - a.import_adjudicacio_sense
      );
    }
  } else {
    // date sort (default)
    if (orderDir === "ASC") {
      contracts.sort((a, b) => compareDateAsc(bestDate(a), bestDate(b)));
    } else {
      contracts.sort((a, b) => compareDateDesc(bestDate(a), bestDate(b)));
    }
  }

  const offset = (page - 1) * pageSize;
  return contracts.slice(offset, offset + pageSize).map(toContract);
}

export async function fetchContractsCount(
  filters: ContractFilters
): Promise<number> {
  const {
    year,
    tipus_contracte,
    procediment,
    amountMin,
    amountMax,
    nom_organ,
    search,
    nif,
    awardee_name,
  } = filters;

  let contracts = getContracts().filter(AWARDED);

  if (year) {
    const yr = parseInt(year, 10);
    contracts = contracts.filter((c) => c.year === yr);
  }
  if (tipus_contracte) {
    contracts = contracts.filter(
      (c) => c.tipus_contracte === tipus_contracte
    );
  }
  if (procediment) {
    contracts = contracts.filter((c) => c.procediment === procediment);
  }
  if (amountMin) {
    const min = parseFloat(amountMin);
    if (!isNaN(min)) {
      contracts = contracts.filter((c) => c.import_adjudicacio_sense >= min);
    }
  }
  if (amountMax) {
    const max = parseFloat(amountMax);
    if (!isNaN(max)) {
      contracts = contracts.filter((c) => c.import_adjudicacio_sense <= max);
    }
  }
  if (nom_organ) {
    contracts = contracts.filter((c) => c.nom_organ === nom_organ);
  }
  if (nif) {
    contracts = contracts.filter(
      (c) => c.identificacio_adjudicatari === nif
    );
  }
  if (awardee_name) {
    const q = awardee_name.toLowerCase();
    contracts = contracts.filter((c) =>
      c.denominacio_adjudicatari.toLowerCase().includes(q)
    );
  }
  if (search) {
    const q = search.toLowerCase();
    contracts = contracts.filter(
      (c) =>
        c.denominacio.toLowerCase().includes(q) ||
        c.denominacio_adjudicatari.toLowerCase().includes(q) ||
        c.nom_organ.toLowerCase().includes(q) ||
        c.codi_expedient.toLowerCase().includes(q)
    );
  }

  return contracts.length;
}

// ---------------------------------------------------------------------------
// Minor contracts analysis
// ---------------------------------------------------------------------------

export async function fetchThresholdDistribution(): Promise<ThresholdBucket[]> {
  const contracts = getContracts()
    .filter(AWARDED)
    .filter(
      (c) =>
        c.procediment === "Contracte menor" &&
        c.import_adjudicacio_sense <= MINOR_CONTRACT_THRESHOLD
    );

  // Build buckets of 500 EUR each from 0 to 15000
  const bucketSize = 500;
  const numBuckets = Math.ceil(MINOR_CONTRACT_THRESHOLD / bucketSize);
  const counts = new Array<number>(numBuckets).fill(0);

  for (const c of contracts) {
    const idx = Math.min(
      Math.floor(c.import_adjudicacio_sense / bucketSize),
      numBuckets - 1
    );
    counts[idx]++;
  }

  return counts.map((count, i) => ({
    range_start: i * bucketSize,
    range_end: (i + 1) * bucketSize,
    label: `${i * bucketSize}–${(i + 1) * bucketSize}`,
    count,
  }));
}

export async function fetchMinorBandSummary(): Promise<MinorBandSummary> {
  const contracts = getContracts().filter(AWARDED);

  const minorUnder15k = contracts.filter(
    (c) =>
      c.procediment === "Contracte menor" &&
      c.import_adjudicacio_sense < MINOR_CONTRACT_THRESHOLD
  );

  const riskBand = contracts.filter(
    (c) =>
      c.procediment === "Contracte menor" &&
      c.import_adjudicacio_sense >= 14900 &&
      c.import_adjudicacio_sense <= MINOR_CONTRACT_THRESHOLD
  );

  return {
    total_minor_under_15k: minorUnder15k.length,
    risk_band_14900_15000: riskBand.length,
    risk_band_14900_15000_amount: riskBand.reduce(
      (sum, c) => sum + c.import_adjudicacio_sense,
      0
    ),
  };
}

export async function fetchTopOrgansInMinorRiskBand(
  limit: number
): Promise<MinorRiskEntityAggregation[]> {
  const contracts = getContracts()
    .filter(AWARDED)
    .filter(
      (c) =>
        c.procediment === "Contracte menor" &&
        c.import_adjudicacio_sense >= 14900 &&
        c.import_adjudicacio_sense <= MINOR_CONTRACT_THRESHOLD
    );

  const map = groupByOrgan(contracts);
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((e) => ({
      name: e.nom_organ,
      amount: String(e.total),
      num_contracts: String(e.count),
    }));
}

export async function fetchTopCompaniesInMinorRiskBand(limit: number): Promise<
  {
    name: string;
    identificacio_adjudicatari: string;
    denominacio_adjudicatari: string;
    total: string;
    num_contracts: string;
  }[]
> {
  const contracts = getContracts()
    .filter(AWARDED)
    .filter(
      (c) =>
        c.procediment === "Contracte menor" &&
        c.import_adjudicacio_sense >= 14900 &&
        c.import_adjudicacio_sense <= MINOR_CONTRACT_THRESHOLD
    );

  const map = groupByCompany(contracts);
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((e) => ({
      name: e.denominacio_adjudicatari,
      identificacio_adjudicatari: e.identificacio_adjudicatari,
      denominacio_adjudicatari: e.denominacio_adjudicatari,
      total: String(e.total),
      num_contracts: String(e.count),
    }));
}

export async function fetchMinorShareYearly(): Promise<MinorShareYear[]> {
  const contracts = getContracts().filter(AWARDED);

  const yearMap = new Map<
    number,
    {
      total_contracts: number;
      minor_contracts: number;
      total_amount: number;
      minor_amount: number;
    }
  >();

  for (const c of contracts) {
    const entry = yearMap.get(c.year) || {
      total_contracts: 0,
      minor_contracts: 0,
      total_amount: 0,
      minor_amount: 0,
    };
    entry.total_contracts += 1;
    entry.total_amount += c.import_adjudicacio_sense;
    if (c.procediment === "Contracte menor") {
      entry.minor_contracts += 1;
      entry.minor_amount += c.import_adjudicacio_sense;
    }
    yearMap.set(c.year, entry);
  }

  return Array.from(yearMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, e]) => ({
      year: String(year),
      total_contracts: e.total_contracts,
      minor_contracts: e.minor_contracts,
      total_amount: e.total_amount,
      minor_amount: e.minor_amount,
      minor_contracts_share:
        e.total_contracts > 0 ? e.minor_contracts / e.total_contracts : 0,
      minor_amount_share:
        e.total_amount > 0 ? e.minor_amount / e.total_amount : 0,
    }));
}

// ---------------------------------------------------------------------------
// CPV distribution (CAIB has no CPV data — return empty array)
// ---------------------------------------------------------------------------

export async function fetchCpvDistribution(
  _limit: number
): Promise<
  {
    code: string;
    sector: string;
    total: number;
    num_contracts: number;
  }[]
> {
  return [];
}

// ---------------------------------------------------------------------------
// Procedure and contract type distributions
// ---------------------------------------------------------------------------

export async function fetchProcedureDistribution(): Promise<
  ProcedureAggregation[]
> {
  const contracts = getContracts().filter(AWARDED);
  const map = new Map<string, { total: number; count: number }>();

  for (const c of contracts) {
    const key = c.procediment || "Desconegut";
    const entry = map.get(key) || { total: 0, count: 0 };
    entry.total += c.import_adjudicacio_sense;
    entry.count += 1;
    map.set(key, entry);
  }

  return Array.from(map.entries())
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([procediment, { total, count }]) => ({
      procediment,
      total: String(count),
      amount: String(total),
    }));
}

export async function fetchContractTypeDistribution(): Promise<
  ContractTypeAggregation[]
> {
  const contracts = getContracts().filter(AWARDED);
  const map = new Map<string, { total: number; count: number }>();

  for (const c of contracts) {
    const key = c.tipus_contracte || "Desconegut";
    const entry = map.get(key) || { total: 0, count: 0 };
    entry.total += c.import_adjudicacio_sense;
    entry.count += 1;
    map.set(key, entry);
  }

  return Array.from(map.entries())
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([tipus_contracte, { total, count }]) => ({
      tipus_contracte,
      total: String(count),
      amount: String(total),
    }));
}
