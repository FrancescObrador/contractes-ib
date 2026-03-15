#!/usr/bin/env node
/**
 * CAIB Historic Contracts Scraper
 *
 * Scrapes pre-2017 public contract data from the Balearic Islands legacy
 * contracting platform (plataformadecontractacio.caib.es).
 *
 * Covers June 2008 – July 23, 2017.
 * 13,926 contracts across 2,786 listing pages (5 per page).
 *
 * Usage:
 *   node scripts/ingest-historic.mjs
 *   pnpm ingest-historic
 *
 * Resume: re-run after interruption — progress is saved every 50 contracts.
 *
 * Output: data/caib/contracts-historic.json
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(ROOT, "data", "caib");
const OUTPUT_PATH = join(OUTPUT_DIR, "contracts-historic.json");
const PROGRESS_PATH = join(OUTPUT_DIR, "contracts-historic-progress.json");

const BASE_URL = "https://plataformadecontractacio.caib.es";
const DELAY_MS = 350;   // ms between requests (~3 req/s)
const SAVE_EVERY = 50;  // save progress every N detail pages

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function get(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const req = protocol.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith("http")
          ? res.headers.location
          : BASE_URL + res.headers.location;
        return get(loc, retries).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", (err) => {
      if (retries > 0) {
        setTimeout(() => get(url, retries - 1).then(resolve, reject), 1000);
      } else {
        reject(err);
      }
    });
    req.on("timeout", () => {
      req.destroy();
      if (retries > 0) {
        setTimeout(() => get(url, retries - 1).then(resolve, reject), 1000);
      } else {
        reject(new Error("timeout"));
      }
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Encoding & HTML entity decoding
// ---------------------------------------------------------------------------

/**
 * Decode an ISO-8859-15 buffer to a UTF-8 JS string.
 * Node's "latin1" covers ISO-8859-1; 8859-15 differs only in 8 code points,
 * the only relevant one being 0xA4 (¤ in Latin-1, € in 8859-15).
 */
function decodeIso(buf) {
  let s = buf.toString("latin1");
  s = s.replace(/\u00a4/g, "€"); // ¤ → €
  return decodeEntities(s);
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&Agrave;/g, "À").replace(/&agrave;/g, "à")
    .replace(/&Aacute;/g, "Á").replace(/&aacute;/g, "á")
    .replace(/&Egrave;/g, "È").replace(/&egrave;/g, "è")
    .replace(/&Eacute;/g, "É").replace(/&eacute;/g, "é")
    .replace(/&Igrave;/g, "Ì").replace(/&igrave;/g, "ì")
    .replace(/&Iacute;/g, "Í").replace(/&iacute;/g, "í")
    .replace(/&Ograve;/g, "Ò").replace(/&ograve;/g, "ò")
    .replace(/&Oacute;/g, "Ó").replace(/&oacute;/g, "ó")
    .replace(/&Ugrave;/g, "Ù").replace(/&ugrave;/g, "ù")
    .replace(/&Uacute;/g, "Ú").replace(/&uacute;/g, "ú")
    .replace(/&Ccedil;/g, "Ç").replace(/&ccedil;/g, "ç")
    .replace(/&Ntilde;/g, "Ñ").replace(/&ntilde;/g, "ñ")
    .replace(/&middot;/g, "·")
    .replace(/&euro;/g, "€")
    .replace(/&laquo;/g, "«").replace(/&raquo;/g, "»")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Strip the contracting organ's active-period suffix: "(06/2008-31/12/2010)".
 */
function stripOrgPeriod(s) {
  return s.replace(/\s*\(\d{2}\/\d{4}[^)]*\)\s*$/, "").trim();
}

/**
 * Parse a Spanish number string like "65.327,72" to a JS number.
 */
function parseNum(s) {
  if (!s) return NaN;
  return parseFloat(s.trim().replace(/\./g, "").replace(",", "."));
}

/**
 * Parse "DD/MM/YYYY" → "YYYY-MM-DD", or return "".
 */
function parseDate(s) {
  if (!s) return "";
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

function extractYear(d) {
  const m = (d || "").match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Normalize contract type to match post-2017 CSV values.
 */
function normalizeType(s) {
  const t = s.trim().replace(/\.$/, "");
  const map = {
    "Obres": "Obres",
    "Serveis": "Serveis",
    "Subministrament": "Subministraments",
    "Subministraments": "Subministraments",
    "Gestió de serveis públics": "Gestió de serveis públics",
    "Concessió d'obra pública": "Concessió d'obres",
    "Concessió d'obres": "Concessió d'obres",
    "Concessió de serveis": "Concessió de serveis",
    "Col·laboració publicoprivada": "Col·laboració publicoprivada",
    "Administratiu especial": "Administratiu especial",
    "Altres": "Altres",
  };
  return map[t] || t;
}

/**
 * Build a deterministic synthetic NIF from a company name.
 * Prefixed with "NOM:" to signal it's name-derived, not a real NIF.
 * Max 50 chars total.
 */
function syntheticNif(name) {
  const norm = name.toUpperCase().replace(/[^A-ZÀÁÈÉÍÏÒÓÚÜÇ0-9 ]/g, "").replace(/\s+/g, " ").trim();
  return ("NOM:" + norm).slice(0, 50);
}

// ---------------------------------------------------------------------------
// Parse a single listing page → array of { id, title, organ, tipus }
// ---------------------------------------------------------------------------

async function parseListingPage(pagina) {
  const url = `${BASE_URL}/LicitacionesHistoricas.jsp?idTipoContrato=&idOrganoContratacion=-1&pagina=${pagina}&idi=ca&baja=`;
  const buf = await get(url);
  const html = decodeIso(buf);

  const items = [];
  // Match each <li> block containing a contract link
  const liRe = /<li>\s*<a href="Licitacion\.jsp\?id=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>\s*<br\/?>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/g;
  let m;
  while ((m = liRe.exec(html)) !== null) {
    const id = parseInt(m[1], 10);
    const title = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const p = m[3];

    const organM = p.match(/Òrgan de contractació[^:]*:?\s*([^<]+)/);
    const organ = organM ? stripOrgPeriod(organM[1].trim()) : "";

    const typeM = p.match(/Tipus de contracte[^:]*:?\s*([^<.]+)/);
    const tipus = typeM ? normalizeType(typeM[1]) : "";

    items.push({ id, title, organ, tipus });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Parse a single contract detail page
// ---------------------------------------------------------------------------

async function parseDetailPage(id) {
  const url = `${BASE_URL}/Licitacion.jsp?id=${id}&idOrganoContratacion=-1&idi=ca&baja=&historico=true`;
  const buf = await get(url);
  const html = decodeIso(buf);

  // Error pages
  if (
    html.includes("no ha pogut processar") ||
    html.includes("j_security_check") ||
    html.includes("Mòdul d'autenticació")
  ) {
    return null;
  }

  // Extract the main content div
  const infoM = html.match(/<div id="info"[^>]*>([\s\S]*?)(?=<div id="eines">|$)/);
  const info = infoM ? infoM[1] : html;

  /**
   * Extract the value after a bold label like:
   *   <span style='...'>Label text:</span>&nbsp;Value<br/>
   * Both ' and " quotes are used in style attributes.
   */
  function lbl(labelRe) {
    const re = new RegExp(
      `<span[^>]*>\\s*${labelRe}\\s*:?\\s*</span>\\s*&nbsp;\\s*([^<]+)`,
      "i"
    );
    const m = info.match(re);
    return m ? m[1].trim() : "";
  }

  const organ = stripOrgPeriod(lbl("Òrgan de contractació"));
  const tipus = normalizeType(lbl("Tipus de contracte"));
  const procediment = lbl("Procediment");
  const expedient = lbl("Núm\\.? d'expedient");

  // Budget
  const budgetSenseStr = lbl("Pressupost de licitació \\(IVA exclòs\\)");
  const budgetAmbStr   = lbl("Pressupost de licitació \\(IVA inclòs\\)");
  const pressupost_licitacio_sense = parseNum(budgetSenseStr.replace(/\s*(Euros|€)/i, "")) || 0;
  const pressupost_licitacio_amb   = parseNum(budgetAmbStr.replace(/\s*(Euros|€)/i, "")) || 0;

  // Dates
  const dataPublicacioRaw = lbl("Data de publicació");
  const dataPublicacio = parseDate(dataPublicacioRaw);

  // Provisional award section
  const adjProv     = lbl("Adjudicatari provisional");
  const dataAdjProv = parseDate(lbl("Data de l'adjudicació provisional"));

  // "Més informació" free-text section
  let dataAdj       = dataAdjProv;
  let denominacioAdj = adjProv;
  let nifAdj        = "";
  let importSense   = NaN;
  let importAmb     = NaN;
  let dataFormal    = "";

  const mesM = info.match(/Més informació[\s\S]*?<p>([\s\S]*?)<\/p>/i);
  if (mesM) {
    const mi = mesM[1];

    const dateM = mi.match(/Data d'adjudicació:?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (dateM) dataAdj = parseDate(dateM[1]);

    const formalM = mi.match(/Data de formalització:?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (formalM) dataFormal = parseDate(formalM[1]);

    const empM = mi.match(/Empresa adjudicatària:([^.<\n]+)/i);
    if (empM) denominacioAdj = empM[1].trim();

    const nifM = mi.match(/NIF[/]?CIF:?\s*([A-Z0-9-]+)/i) || mi.match(/\bNIF:?\s*([A-Z0-9-]+)/i);
    if (nifM) nifAdj = nifM[1].trim();

    // "import sense Iva: 65.327,72 €"
    const sensM = mi.match(/import sense (?:Iva|IVA):?\s*([\d.,]+)\s*(?:€|Euros?)/i);
    if (sensM) importSense = parseNum(sensM[1]);

    const totM = mi.match(/Total:?\s*([\d.,]+)\s*(?:€|Euros?)/i);
    if (totM) importAmb = parseNum(totM[1]);
  }

  // Title from <h3>
  const h3M = info.match(/<h3>\s*([\s\S]*?)\s*<\/h3>/);
  const title = h3M ? h3M[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";

  // If we have company name but no NIF, generate a synthetic identifier
  if (!nifAdj && denominacioAdj) {
    nifAdj = syntheticNif(denominacioAdj);
  }

  // Use budget as amount fallback only when we have a company name
  const finalImportSense = isNaN(importSense)
    ? (denominacioAdj ? pressupost_licitacio_sense : 0)
    : importSense;
  const finalImportAmb = isNaN(importAmb)
    ? (denominacioAdj ? pressupost_licitacio_amb || finalImportSense : 0)
    : importAmb;

  // Best year
  const year =
    extractYear(dataAdj) ||
    extractYear(dataFormal) ||
    extractYear(dataPublicacio);

  // Link to the detail page
  const enllac = `${BASE_URL}/Licitacion.jsp?id=${id}&idOrganoContratacion=-1&idi=ca&baja=&historico=true`;

  return {
    organ,
    expedient,
    title,
    tipus,
    procediment,
    pressupost_licitacio_sense,
    pressupost_licitacio_amb,
    dataPublicacio,
    dataAdj,
    dataFormal,
    denominacioAdj,
    nifAdj,
    importSense: finalImportSense,
    importAmb: finalImportAmb,
    year,
    enllac,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("CAIB Historic Contracts Scraper");
  console.log("================================");
  console.log(`Source: ${BASE_URL}/LicitacionesHistoricas.jsp`);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load or init progress
  let progress = {
    idsCollected: false,
    ids: [],         // [{ id, title, organ, tipus }]
    processed: {},   // id → contract object | null (null = error/skip)
    errors: [],
  };

  if (existsSync(PROGRESS_PATH)) {
    try {
      progress = JSON.parse(readFileSync(PROGRESS_PATH, "utf-8"));
      const done = Object.keys(progress.processed).length;
      console.log(`\nResuming from existing progress:`);
      console.log(`  IDs collected: ${progress.idsCollected ? "yes" : "no"} (${progress.ids.length})`);
      console.log(`  Detail pages processed: ${done}`);
    } catch {
      console.log("Could not read progress file — starting fresh.");
    }
  }

  // -------------------------------------------------------------------------
  // Phase 1 — collect all contract IDs from listing pages
  // -------------------------------------------------------------------------
  if (!progress.idsCollected) {
    console.log("\nPhase 1: Collecting contract IDs from listing pages…");

    // Determine total pages from first listing page
    const firstBuf = await get(
      `${BASE_URL}/LicitacionesHistoricas.jsp?idTipoContrato=&idOrganoContratacion=-1&pagina=0&idi=ca&baja=`
    );
    const firstHtml = decodeIso(firstBuf);
    const totalM = firstHtml.match(/S'han trobat un total de<strong>&nbsp;(\d+)&nbsp;expedients<\/strong>/);
    const total = totalM ? parseInt(totalM[1], 10) : 13926;
    const totalPages = Math.ceil(total / 5);
    console.log(`  Total contracts reported: ${total}  →  ${totalPages} pages`);

    const allItems = [];

    // Page 0 is already downloaded
    const firstItems = await parseListingPage(0);
    allItems.push(...firstItems);

    for (let p = 1; p < totalPages; p++) {
      try {
        const items = await parseListingPage(p);
        allItems.push(...items);
      } catch (e) {
        console.error(`  Page ${p} error: ${e.message}`);
        progress.errors.push({ phase: "listing", page: p, error: e.message });
      }
      await sleep(DELAY_MS);

      if (p % 200 === 0) {
        console.log(`  Page ${p}/${totalPages}  IDs so far: ${allItems.length}`);
        // Save intermediate progress
        progress.ids = allItems;
        writeFileSync(PROGRESS_PATH, JSON.stringify(progress));
      }
    }

    progress.ids = allItems;
    progress.idsCollected = true;
    writeFileSync(PROGRESS_PATH, JSON.stringify(progress));
    console.log(`  Done. Collected ${allItems.length} IDs.`);
    await sleep(DELAY_MS);
  } else {
    console.log(`\nPhase 1: Skipped — ${progress.ids.length} IDs already collected.`);
  }

  // -------------------------------------------------------------------------
  // Phase 2 — fetch each detail page
  // -------------------------------------------------------------------------
  console.log("\nPhase 2: Fetching detail pages…");

  const processedSet = new Set(Object.keys(progress.processed).map(Number));
  const remaining = progress.ids.filter((item) => !processedSet.has(item.id));

  console.log(`  To process: ${remaining.length}  (${processedSet.size} already done)`);

  for (let i = 0; i < remaining.length; i++) {
    const item = remaining[i];
    try {
      const detail = await parseDetailPage(item.id);
      if (detail && detail.year) {
        progress.processed[item.id] = {
          nom_organ:                  detail.organ  || item.organ,
          data_publicacio_anunci:     detail.dataPublicacio,
          year:                       detail.year,
          codi_expedient:             detail.expedient,
          enllac_publicacio:          detail.enllac,
          denominacio:                detail.title  || item.title,
          tipus_contracte:            detail.tipus  || item.tipus,
          procediment:                detail.procediment,
          pressupost_licitacio_sense: detail.pressupost_licitacio_sense,
          numero_lot:                 "",
          resultat:                   "Adjudicació provisional",
          data_adjudicacio_contracte: detail.dataAdj,
          data_formalitzacio_contracte: detail.dataFormal,
          identificacio_adjudicatari: detail.nifAdj,
          denominacio_adjudicatari:   detail.denominacioAdj,
          es_pime:                    "No",
          import_adjudicacio_amb_iva: detail.importAmb,
          import_adjudicacio_sense:   detail.importSense,
          ofertes_rebudes:            0,
          financiacio_ue:             "No",
          font:                       "historic",
        };
      } else {
        // Unusable — no year or error page
        progress.processed[item.id] = null;
      }
    } catch (e) {
      progress.errors.push({ phase: "detail", id: item.id, error: e.message });
      progress.processed[item.id] = null;
    }

    if ((i + 1) % SAVE_EVERY === 0) {
      writeFileSync(PROGRESS_PATH, JSON.stringify(progress));
      const pct = (((processedSet.size + i + 1) / progress.ids.length) * 100).toFixed(1);
      console.log(
        `  ${i + 1}/${remaining.length} this run  (${processedSet.size + i + 1} total, ${pct}%)`
      );
    }

    await sleep(DELAY_MS);
  }

  // Final progress save
  writeFileSync(PROGRESS_PATH, JSON.stringify(progress));

  // -------------------------------------------------------------------------
  // Phase 3 — write output JSON
  // -------------------------------------------------------------------------
  console.log("\nPhase 3: Writing output…");

  const contracts = Object.values(progress.processed)
    .filter((c) => c !== null && c !== undefined && c.year)
    .sort((a, b) => a.year - b.year || a.data_adjudicacio_contracte.localeCompare(b.data_adjudicacio_contracte));

  const withCompany = contracts.filter((c) => c.identificacio_adjudicatari && c.denominacio_adjudicatari);
  const withAmount  = contracts.filter((c) => c.import_adjudicacio_sense > 0);

  writeFileSync(OUTPUT_PATH, JSON.stringify(contracts));

  const sizeMB = (Buffer.byteLength(JSON.stringify(contracts)) / 1024 / 1024).toFixed(2);

  console.log(`\nResults:`);
  console.log(`  Total contracts written: ${contracts.length}`);
  console.log(`  With company data:       ${withCompany.length}`);
  console.log(`  With award amount:       ${withAmount.length}`);
  console.log(`  Errors:                  ${progress.errors.length}`);
  console.log(`  File size:               ${sizeMB} MB`);
  console.log(`  Output: ${OUTPUT_PATH}`);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Scraper failed:", err);
  process.exit(1);
});
