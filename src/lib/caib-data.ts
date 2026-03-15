import { readFileSync } from "fs";
import { join } from "path";

export interface CaibContract {
  nom_organ: string;
  data_publicacio_anunci: string;
  year: number;
  codi_expedient: string;
  enllac_publicacio: string;
  denominacio: string;
  tipus_contracte: string;
  procediment: string;
  pressupost_licitacio_sense: number;
  numero_lot: string;
  resultat: string;
  data_adjudicacio_contracte: string;
  data_formalitzacio_contracte: string;
  identificacio_adjudicatari: string;
  denominacio_adjudicatari: string;
  es_pime: string; // "Sí" or "No"
  import_adjudicacio_amb_iva: number;
  import_adjudicacio_sense: number;
  ofertes_rebudes: number;
  financiacio_ue: string; // "Sí" or "No"
}

let _cache: CaibContract[] | null = null;

export function getContracts(): CaibContract[] {
  if (_cache) return _cache;
  try {
    const path = join(process.cwd(), "data", "caib", "contracts.json");
    _cache = JSON.parse(readFileSync(path, "utf-8")) as CaibContract[];
    return _cache!;
  } catch {
    console.warn("CAIB contracts data not found. Run: pnpm ingest");
    _cache = [];
    return _cache;
  }
}
