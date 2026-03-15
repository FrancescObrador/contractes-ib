export interface Contract {
  codi_expedient: string;
  denominacio: string;
  tipus_contracte: string;
  procediment: string;
  nom_organ: string;
  identificacio_adjudicatari: string;
  denominacio_adjudicatari: string;
  import_adjudicacio_sense: string; // stored as string for compat
  import_adjudicacio_amb_iva: string; // stored as string for compat
  data_adjudicacio_contracte: string;
  data_formalitzacio_contracte: string;
  data_publicacio_anunci: string;
  ofertes_rebudes: number;
  numero_lot: string;
  pressupost_licitacio_sense: number;
  pressupost_licitacio_amb: number;
  resultat: string;
  enllac_publicacio: string;
  es_pime: string;
  financiacio_ue: string;
}

export interface CompanyAggregation {
  identificacio_adjudicatari: string;
  denominacio_adjudicatari: string;
  total: string;
  num_contracts: string;
  total_current_year?: string;
}

export interface OrganAggregation {
  nom_organ: string;
  total: string;
  num_contracts: string;
  total_current_year?: string;
}

export interface YearlyAggregation {
  year: string;
  total: string;
  num_contracts: string;
}

export interface CompanyYearAggregation {
  denominacio_adjudicatari: string;
  identificacio_adjudicatari: string;
  year: string;
  total: string;
  num_contracts: string;
}

export interface OrganYearAggregation {
  nom_organ: string;
  year: string;
  total: string;
  num_contracts: string;
}

export interface ProcedureAggregation {
  procediment: string;
  total: string;
  amount: string;
}

export interface ContractTypeAggregation {
  tipus_contracte: string;
  total: string;
  amount: string;
}

export interface ThresholdBucket {
  range_start: number;
  range_end: number;
  label: string;
  count: number;
}

export interface CpvAggregation {
  codi_cpv: string;
  total: string;
  num_contracts: string;
}

export interface ContractFilters {
  year?: string;
  tipus_contracte?: string;
  procediment?: string;
  amountMin?: string;
  amountMax?: string;
  nom_organ?: string;
  search?: string;
  nif?: string;
  awardee_name?: string;
  page?: number;
  pageSize?: number;
  orderBy?: string;
  orderDir?: "ASC" | "DESC";
}

export interface MinorRiskEntityAggregation {
  name: string;
  amount: string;
  num_contracts: string;
}

export interface MinorBandSummary {
  total_minor_under_15k: number;
  risk_band_14900_15000: number;
  risk_band_14900_15000_amount: number;
}

export interface MinorShareYear {
  year: string;
  total_contracts: number;
  minor_contracts: number;
  total_amount: number;
  minor_amount: number;
  minor_contracts_share: number;
  minor_amount_share: number;
}
