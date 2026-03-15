export const CAIB_CSV_URL =
  "https://intranet.caib.es/opendatacataleg/dataset/c992354b-7546-4280-a144-6211f6ecfed4/resource/34ea0416-90fb-43cc-a866-4933cc6ce6e1/download/contractes_ca.csv";

export const CAIB_DATASET_URL =
  "https://intranet.caib.es/opendatacataleg/dataset/c992354b-7546-4280-a144-6211f6ecfed4";

// Data source is updated quarterly; 6h cache is fine for production.
export const REVALIDATE_SECONDS = 21600; // 6 hours cache
export const API_ROUTE_S_MAXAGE_SECONDS = 21600; // 6 hours CDN cache
export const API_ROUTE_STALE_WHILE_REVALIDATE_SECONDS = 86400; // 24 hours

export const DEFAULT_PAGE_SIZE = 50;

export const MINOR_CONTRACT_THRESHOLD = 15000;

export const CONTRACT_TYPES = [
  "Serveis",
  "Subministraments",
  "Obres",
  "Concessió de serveis",
  "Administratiu especial",
  "Altra legislació sectorial",
  "Privat d'Administració Pública",
  "Concessió d'obres",
] as const;

export const PROCEDURE_TYPES = [
  "Contracte menor",
  "Obert",
  "Obert simplificat abreujat",
  "Obert Simplificat",
  "Negociat sense publicitat",
  "Restringit",
  "Tramitació amb mesures de gestió eficient",
  "Negociat amb publicitat",
  "Licitació amb negociació",
  "Diàleg competitiu",
] as const;

export const SITE_NAME = "contractes.ib";
export const SITE_DESCRIPTION =
  "Contractació pública a les Illes Balears: cercador de contractes públics i anàlisi d'adjudicacions per empreses, organismes i persones.";
export const SITE_URL = "https://contractes.ib";
export const GITHUB_URL = "https://github.com/gerardgimenezadsuar/contractes-cat";
export const CREATOR_NAME = "Ciència de Dades";
export const CREATOR_URL = "https://cienciadedades.cat";
