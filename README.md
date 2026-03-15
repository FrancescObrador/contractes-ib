# contractes.ib

Anàlisi independent de la contractació pública a les Illes Balears.

**Aquesta no és una web oficial del govern.** Les dades provenen del [Portal de Dades Obertes del Govern de les Illes Balears (CAIB)](https://intranet.caib.es/opendatacataleg/) i es mostren amb finalitat informativa.

## Funcionalitats

- **Dashboard** amb indicadors clau: total de contractes, import total adjudicat, nombre d'empreses
- **Rànquing d'empreses** per import total de contractes adjudicats, amb cerca i paginació
- **Detall d'empresa** amb evolució anual i llistat de contractes
- **Explorador de contractes** amb filtres per any, tipus, procediment, import i òrgan de contractació
- **Anàlisi** del llindar de contractes menors (15.000 EUR), distribucions per tipus i procediment

## Stack tecnològic

- [Next.js](https://nextjs.org) 16 (App Router, Server Components)
- [Tailwind CSS](https://tailwindcss.com) 4
- [Recharts](https://recharts.org) per a gràfiques
- TypeScript
- Dades: CSV estàtic del portal de dades obertes CAIB (actualitzat trimestralment)

## Desenvolupament

```bash
pnpm install
pnpm ingest    # Descarrega el CSV i genera data/caib/contracts.json
pnpm dev
```

Obre [http://localhost:3000](http://localhost:3000) al navegador.

Cal executar `pnpm ingest` almenys una vegada abans de `pnpm dev`. Sense `data/caib/contracts.json` el site mostra dades buides.

### Variables d'entorn (BORME/Turso)

Per mostrar l'històric d'administradors des de Turso (sense fitxers JSON estàtics), configura:

```bash
TURSO_URL=libsql://<db-name>-<org>.turso.io
TURSO_TOKEN=<db-token>
```

També es suporta `TURSO_AUTH_TOKEN` com a alternativa a `TURSO_TOKEN`.

## Font de dades

Les dades de contractació provenen del conjunt de dades [Contractes de la Comunitat Autònoma de les Illes Balears](https://intranet.caib.es/opendatacataleg/dataset/c992354b-7546-4280-a144-6211f6ecfed4) publicat pel Govern de les Illes Balears (CAIB).

- **Format:** CSV separat per punt i coma, separador decimal coma, UTF-8
- **Mida:** ~16 MB (~70.000+ registres)
- **Actualització:** Trimestral
- **URL directa:** `https://intranet.caib.es/opendatacataleg/dataset/c992354b-7546-4280-a144-6211f6ecfed4/resource/34ea0416-90fb-43cc-a866-4933cc6ce6e1/download/contractes_ca.csv`

## Desplegament

Desplegat a [Vercel](https://vercel.com). Per desplegar la teva pròpia instància:

```bash
pnpm run build   # Equivalent a: node scripts/ingest.mjs && next build
```

A Vercel, cada desplegament descarrega automàticament el CSV actualitzat.

## CLI (`@gerardgimenezadsuar/contractes-cli`)

El repositori inclou una CLI perquè persones i agents puguin consultar dades sense UI:

```bash
npx @gerardgimenezadsuar/contractes-cli help
npx @gerardgimenezadsuar/contractes-cli search-contracts --search "neteja" --year 2025
npx @gerardgimenezadsuar/contractes-cli search-companies --search "ferrovial"
```

Documentació de la CLI:

- [`packages/contractes-cli/README.md`](packages/contractes-cli/README.md)

## Descobribilitat per agents (ChatGPT/Claude)

- `llms.txt` al root del repo (lectura a GitHub)
- `public/llms.txt` publicat a `https://contractes.ib/llms.txt`
- README de la CLI amb exemples copy-paste
- Metadata NPM (`keywords`, `description`) per millorar la cerca

## Llicència

AGPL-3.0. Consulta el fitxer [LICENSE](LICENSE) per a més detalls.
