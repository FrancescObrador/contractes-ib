#!/usr/bin/env node
/**
 * CAIB Contracts Ingest Script
 *
 * Downloads the CAIB public contracts CSV and saves a cleaned JSON file
 * to data/caib/contracts.json for use by the Next.js app.
 *
 * Usage: node scripts/ingest.mjs
 *        pnpm ingest
 */

import { createWriteStream, mkdirSync, writeFileSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const CAIB_CSV_URL =
  "https://intranet.caib.es/opendatacataleg/dataset/c992354b-7546-4280-a144-6211f6ecfed4/resource/34ea0416-90fb-43cc-a866-4933cc6ce6e1/download/contractes_ca.csv";

const OUTPUT_DIR = join(ROOT, "data", "caib");
const OUTPUT_PATH = join(OUTPUT_DIR, "contracts.json");

/** Download a URL and return the full body as a Buffer */
function download(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const req = protocol.get(url, { timeout: 120000 }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log(`Redirecting to: ${res.headers.location}`);
        return download(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

/**
 * Parse a numeric string that may use comma as decimal separator.
 * Returns NaN if unparseable.
 */
function parseNum(raw) {
  if (!raw || raw.trim() === "") return NaN;
  return parseFloat(raw.trim().replace(",", "."));
}

/**
 * Extract a 4-digit year from a YYYY-MM-DD date string.
 * Returns null if the string is empty or unparseable.
 */
function extractYear(dateStr) {
  if (!dateStr || dateStr.trim() === "") return null;
  const m = dateStr.trim().match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Split a CSV line by semicolon, respecting quoted fields.
 * The CAIB CSV uses semicolons but field values shouldn't normally contain
 * semicolons; however we handle basic quoting anyway.
 */
function splitLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ";" && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

async function main() {
  console.log("CAIB Contracts Ingest");
  console.log("====================");
  console.log(`Source: ${CAIB_CSV_URL}`);
  console.log("Downloading CSV...");

  const startTime = Date.now();
  const buffer = await download(CAIB_CSV_URL);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB in ${elapsed}s`
  );

  const text = buffer.toString("utf-8");
  const lines = text.split(/\r?\n/);
  console.log(`Total lines (including header): ${lines.length}`);

  // Skip header row (index 0)
  const dataLines = lines.slice(1);

  const contracts = [];
  let skippedUnadjudicated = 0;
  let skippedParseError = 0;

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    if (!line.trim()) continue; // skip empty lines

    const cols = splitLine(line);

    // Columns (0-indexed):
    // 0  ÒRGAN CONTRACTACIÓ
    // 1  DATA DARRER ANUNCI PLATAFORMA
    // 2  EXPEDIENT
    // 3  ENLLAÇ
    // 4  TÍTOL
    // 5  TIPUS CONTRACTE
    // 6  PROCEDIMENT CONTRACTACIÓ
    // 7  PRESSUPOST EXPEDIENT
    // 8  PRESSUPOST EXPEDIENT SENSE IMPOSTS
    // 9  MODIFICACIONS IMPORT (ignore)
    // 10 MODIFICACIONS TERMINI (ignore)
    // 11 PRÒRROGA D'ALTRE EXPEDIENT (ignore)
    // 12 LOT
    // 13 PRESSUPOST LOT (ignore)
    // 14 PRESSUPOST LOT SENSE IMPOSTS (ignore)
    // 15 RESULTAT ADJUDICACIÓ
    // 16 DATA ACORD ADJUDICACIÓ
    // 17 DATA FORMALITZACIÓ
    // 18 CIF ADJUDICATARI
    // 19 NOM ADJUDICATARI
    // 20 ADJUDICATARI ÉS PIME
    // 21 IMPORT ADJUDICACIÓ
    // 22 IMPORT ADJUDICACIÓ SENSE IVA
    // 23 OFERTES REBUDES
    // 24 TIPUS TRAMITACIÓ (ignore)
    // 25 FINANCIACIÓ UE
    // 26 FONS QUE EL FINANCIA (ignore)

    const nom_organ = (cols[0] || "").trim();
    const data_publicacio_anunci = (cols[1] || "").trim();
    const codi_expedient = (cols[2] || "").trim();
    const enllac_publicacio = (cols[3] || "").trim();
    const denominacio = (cols[4] || "").trim();
    const tipus_contracte = (cols[5] || "").trim();
    const procediment = (cols[6] || "").trim();
    // col 7 pressupost_licitacio_amb — parsed but not exposed in final schema
    const pressupost_licitacio_sense = parseNum(cols[8]);
    const numero_lot = (cols[12] || "").trim();
    const resultat = (cols[15] || "").trim();
    const data_adjudicacio_contracte = (cols[16] || "").trim();
    const data_formalitzacio_contracte = (cols[17] || "").trim();
    const identificacio_adjudicatari = (cols[18] || "").trim();
    const denominacio_adjudicatari = (cols[19] || "").trim();
    const es_pime_raw = (cols[20] || "").trim();
    const import_adjudicacio_amb_iva = parseNum(cols[21]);
    const import_adjudicacio_sense = parseNum(cols[22]);
    const ofertes_rebudes_raw = parseInt((cols[23] || "").trim(), 10);
    const financiacio_ue_raw = (cols[25] || "").trim();

    // Filter: skip unadjudicated rows
    if (!identificacio_adjudicatari || !denominacio_adjudicatari) {
      skippedUnadjudicated++;
      continue;
    }
    if (!(import_adjudicacio_sense > 0)) {
      skippedUnadjudicated++;
      continue;
    }

    // Determine year from best available date
    const year =
      extractYear(data_adjudicacio_contracte) ||
      extractYear(data_formalitzacio_contracte) ||
      extractYear(data_publicacio_anunci);

    if (!year) {
      skippedParseError++;
      continue;
    }

    const es_pime = es_pime_raw === "Sí" ? "Sí" : "No";
    const financiacio_ue = financiacio_ue_raw === "Sí" ? "Sí" : "No";
    const ofertes_rebudes = Number.isFinite(ofertes_rebudes_raw)
      ? ofertes_rebudes_raw
      : 0;

    contracts.push({
      nom_organ,
      data_publicacio_anunci,
      year,
      codi_expedient,
      enllac_publicacio,
      denominacio,
      tipus_contracte,
      procediment,
      pressupost_licitacio_sense: isNaN(pressupost_licitacio_sense)
        ? 0
        : pressupost_licitacio_sense,
      numero_lot,
      resultat,
      data_adjudicacio_contracte,
      data_formalitzacio_contracte,
      identificacio_adjudicatari,
      denominacio_adjudicatari,
      es_pime,
      import_adjudicacio_amb_iva: isNaN(import_adjudicacio_amb_iva)
        ? 0
        : import_adjudicacio_amb_iva,
      import_adjudicacio_sense: isNaN(import_adjudicacio_sense)
        ? 0
        : import_adjudicacio_sense,
      ofertes_rebudes,
      financiacio_ue,
    });
  }

  console.log(`\nParsing results:`);
  console.log(`  Contracts kept:         ${contracts.length.toLocaleString()}`);
  console.log(
    `  Skipped (unadjudicated): ${skippedUnadjudicated.toLocaleString()}`
  );
  console.log(
    `  Skipped (parse error):  ${skippedParseError.toLocaleString()}`
  );

  // Ensure output directory exists
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Write JSON
  console.log(`\nWriting to: ${OUTPUT_PATH}`);
  writeFileSync(OUTPUT_PATH, JSON.stringify(contracts), "utf-8");

  const stat = statSync(OUTPUT_PATH);
  console.log(
    `File size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`
  );
  console.log("Done.");
}

main().catch((err) => {
  console.error("Ingest failed:", err);
  process.exit(1);
});
