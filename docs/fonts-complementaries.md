# Fonts de dades complementàries de contractació pública a les Illes Balears

> Investigació realitzada el març de 2026.
> El sistema actual usa el **dataset CSV de contractes de la CAIB** (portal dades obertes GOIB) i **Turso/BORME** (historial d'administradors). Aquest document recull altres fonts que podrien complementar-lo.

---

## Resum executiu

El dataset CSV actual cobreix els contractes **adjudicats** del Govern de les Illes Balears i el seu sector públic instrumental des del **juliol de 2017**. Hi ha almenys quatre fonts complementàries d'alt valor:

1. **PCSP estatal (ATOM/XML)** — inclou CPV codes, etapa de licitació i entitats locals que no apareixen al CSV de la CAIB.
2. **Socrata API del catàleg GOIB** — alternativa d'accés programàtic incremental al mateix dataset.
3. **Plataforma CAIB pre-2017** — historial de contractes 2008–2017 sense API (requereix scraping).
4. **Portal de Transparència CAIB (contractes menors)** — descàrrega CSV/Excel de contractes menors, possible complement o solapament parcial.

---

## 1. Plataforma de Contractació de la CAIB (2008–2017)

**URL:** https://plataformadecontractacio.caib.es

### Dades disponibles
- Licitacions i adjudicacions des del **juny de 2008 fins al 23 de juliol de 2017**
- Expedients de la CAIB, Consells Insulars, ajuntaments i UIB
- Contractes menors, programats, acords marc, sistemes dinàmics

### API / descàrrega
Únicament navegació web HTML. **No hi ha API ni exportació estructurada.** Caldria scraping.

### Valor afegit
Cobreix el **període historic pre-2017** absent del CSV actual. Si s'incorporés, la sèrie temporal es podria allargar fins al 2008.

### Complexitat d'integració: Alta (scraping)

---

## 2. Portal de Transparència de la CAIB — Activitat Contractual i Contractes Menors

**URLs:**
- Activitat contractual: https://www.caib.es/sites/transparencia/ca/activitat_contractual/
- Contractes menors: https://www.caib.es/sites/transparencia/ca/contractes_menors/

### Dades disponibles
- Tots els contractes adjudicats, deserts, amb renúncia o desistiment (des del juliol 2017)
- Contractes menors de la CAIB i del sector públic instrumental
- *Nota: subministraments i serveis < 5.000 € no es publiquen*

### API / descàrrega
**Sí.** Descàrrega directa en:
- CSV
- Excel (XLSX)
- ODF

Actualització trimestral.

### Valor afegit
Possiblement la **mateixa font** que el dataset CSV del portal de dades obertes (o molt similar). Cal comparar els camps per confirmar si n'aporta columnes addicionals o una segmentació diferent dels contractes menors. Si el dataset de transparència inclou camps que el CSV actual no té, seria una substitució directa de la font.

### Complexitat d'integració: Baixa (descàrrega CSV directa)

---

## 3. Catàleg de Dades Obertes GOIB — Socrata API

**URL del dataset:** https://catalegdades.caib.cat/es/w/c6cj-u385/
**Endpoint SODA:** `https://catalegdades.caib.cat/resource/j2yj-e83g.json`
**Documentació tècnica:** https://dev.socrata.com/foundry/catalegdades.caib.cat/j2yj-e83g

### Dades disponibles
Adjudicataris de contractes públics del Govern de les Illes Balears i sector públic instrumental, des del juliol de 2017. Probablement les mateixes dades del CSV actual, però accessibles via API REST.

### API / descàrrega
**Sí.** La plataforma és **Socrata** (Tyler Technologies), que ofereix:
- **SODA (Socrata Open Data API)**: REST + SoQL (SQL-like) per filtrar i agregar
- Formats: JSON, CSV, XML, GeoJSON
- Accés a subsets de dades sense baixar el CSV complet

### Exemple de consulta SoQL
```
GET https://catalegdades.caib.cat/resource/j2yj-e83g.json
  ?$where=data_adjudicacio_contracte > '2024-01-01'
  &$limit=1000
  &$offset=0
```

### Valor afegit
Permet **consultes incrementals** (per data, per organisme, etc.) sense haver de baixar el CSV de ~16 MB complet cada vegada. Útil per a sincronitzacions freqüents o per a consultes específiques sense ingestió completa.

### Complexitat d'integració: Baixa (API REST estàndard)

---

## 4. Plataforma de Contractació del Sector Públic (PCSP) estatal

**URL:** https://contrataciondelestado.es
**Dades obertes (Ministeri Hisenda):** https://www.hacienda.gob.es/es-ES/GobiernoAbierto/Datos%20Abiertos/Paginas/licitaciones_plataforma_contratacion.aspx

### Dades disponibles
- **Licitacions obertes i tancades** de totes les administracions (no només les adjudicades)
- **Adjudicacions, modificats, pròrrogues, encàrrecs a mitjans propis**
- **Consultes preliminars de mercat** (des de 2022)
- **Totes les entitats de les Illes Balears des del juliol de 2017:** Govern de les Illes Balears, Consell de Mallorca, Consell de Menorca, Consell d'Eivissa, Consell de Formentera, ajuntaments i Autoritat Portuària de Balears
- **CPV codes** (vocabulari comú de contractació europeu) — que el dataset CSV de la CAIB **no té**

### API / descàrrega
**Sí.** Formats:
- **Feeds ATOM 1.0 + XML (CODICE)** per descàrrega massiva, organitzats per any i mes
- Eina open source per transformar-los: **OpenPLACSP** (EUPL 1.2) — [manual PDF](https://contrataciondelestado.es/datosabiertos/DGPE_PLACSP_OpenPLACSP_v.1.3.pdf)

### Valor afegit
**La font amb major potencial d'enriquiment:**

| Camp | CSV CAIB actual | PCSP |
|------|----------------|------|
| Contractes adjudicats | ✅ | ✅ |
| Licitacions no adjudicades | ❌ | ✅ |
| CPV codes | ❌ | ✅ |
| Consells Insulars | ❌ | ✅ |
| Ajuntaments | ❌ | ✅ |
| Autoritat Portuària | ❌ | ✅ |
| Etapa de licitació (plecs, terminis) | ❌ | ✅ |
| Totes les ofertes (no només adjudicatari) | ❌ | ✅ |

### Complexitat d'integració: Alta (XML/CODICE, volum gran)

---

## 5. Consells Insulars — Portals propis

### 5a. Consell de Mallorca
- **Perfil contractant:** https://seu.conselldemallorca.net/es/perfil
- **Transparència:** https://transparencia.conselldemallorca.cat/
- **Dataset propi:** No identificat. Les licitacions es publiquen a la PCSP estatal des d'abril de 2018.
- **Valor afegit directe:** Baix. La via d'integració és la PCSP (punt 4).

### 5b. Consell Insular de Menorca (CIME)
- **Transparència:** https://transparencia.cime.es/
- **Dataset propi:** Fitxers Excel de contractes formalitzats per als anys 2021 i 2022.
- **Valor afegit directe:** Molt limitat (cobertura temporal reduïda). La via principal és la PCSP.

### 5c. Consell Insular d'Eivissa
- **Transparència:** https://transparencia.conselldeivissa.es/
- **Contractes menors:** https://www.conselldeivissa.es/ca/web/transparència/llistat-de-contractes-menors
- **Dataset propi:** Llistats HTML per trimestres, sense descàrrega estructurada.
- **Valor afegit directe:** Baix. La via és la PCSP.

### 5d. Consell Insular de Formentera
- **URL:** https://consellinsulardeformentera.cat/
- **Dataset propi:** No identificat. Publica a la PCSP des d'abril de 2018.
- **Valor afegit directe:** Baix. La via és la PCSP.

---

## 6. Registre de Contractes del Sector Públic (Ministeri d'Hisenda)

**URL:** https://www.hacienda.gob.es/es-ES/Areas%20Tematicas/Contratacion/Junta%20Consultiva%20de%20Contratacion%20Administrativa/Paginas/Registro%20publico%20de%20contratos.aspx

### Dades disponibles
Estadístiques **agregades** per comunitat autònoma, tipus d'administració, import i tipologia. Des de 2013.

### API / descàrrega
Sí, però en format estadístic (CSV/Excel de totals). **No inclou registres individuals** de contractes.

### Valor afegit
Útil per a **benchmarking i comparatives** entre administracions i anys, però no per a integració a nivell de contracte individual.

### Complexitat d'integració: Baixa, però ús limitat

---

## 7. Registre de Contractes de la CAIB (Junta Consultiva)

**URL:** https://www.caib.es/sites/jcca/ca/informacio_general-4414/

### Dades disponibles
Registre intern de contractes comunicats per les entitats contractants. S'hi informen adjudicacions, modificats, pròrrogues i extinció.

### API / descàrrega
**No.** Les dades es publiquen en memòries anuals en format PDF/web.

### Valor afegit
Molt baix per a integració tècnica. Les dades agregades arriben al Registre estatal (punt 6) via Ministeri d'Hisenda.

---

## 8. Autoritat Portuària de Balears

**Portal licitació:** https://seu.portsdebalears.gob.es/contratae/
**Referència datos.gob.es:** https://datos.gob.es/ca/catalogo/ea0001301-contratos-de-la-autoritat-portuaria-de-baleares

Organisme de titularitat estatal (Ministeri de Transports). Publica les seves licitacions a la PCSP estatal. No té dataset propi descarregable.

### Valor afegit
Entitat que **no apareix al CSV de la CAIB** (per ser estatal). Es pot accedir a les seves dades via la PCSP (punt 4).

---

## 9. Gobierto Contratación (agregador privat)

**URL:** https://contratos.gobierto.es
**Balears:** https://contratos.gobierto.es/licitaciones-en/islas-baleares
**CAIB:** https://contratos.gobierto.es/adjudicadores/gobierno-de-las-islas-baleares

Plataforma privada que agrega i normalitza dades de la PCSP estatal i plataformes autonòmiques.

### API / descàrrega
Sí. Ofereix una SQL API de datasets i informes descarregables.

### Valor afegit
No és una font primària nova, però proporciona dades **ja normalitzades i amb CPV codes** sense haver de processar els fitxers XML de la PCSP. Útil per a validació creuada i per a entendre el model de dades de la PCSP. Té un model freemium.

---

## 10. BOIB (Butlletí Oficial de les Illes Balears)

**URL:** https://www.caib.es/eboibfront/
**Dataset dades obertes:** https://intranet.caib.es/opendatacataleg/dataset/publicacions-butlleti-oficial-illes-balears

Publica anuncis de licitació, formalitzacions i adjudicacions. El dataset de dades obertes és un RSS parcial (últimes 50 publicacions), actualitzat diàriament.

### Valor afegit
Molt baix per a integració estructurada. El contingut és HTML/PDF no estructurat. Podria ser útil com a font de darrera instància per a entitats que no publiquen a la PCSP ni al CSV.

---

## Taula resum de valoració

| Font | API/Descàrrega | Format | Cobertura territorial | Valor afegit | Complexitat |
|------|:---:|--------|----------------------|:---:|:---:|
| PCSP estatal (ATOM/XML) | ✅ | XML CODICE | Totes les AAPP Balears | ⭐⭐⭐⭐⭐ | Alta |
| Socrata API GOIB | ✅ | JSON/CSV | CAIB + sector instrumental | ⭐⭐⭐ | Baixa |
| Portal Transparència CAIB | ✅ CSV/Excel | CSV, XLSX | CAIB + sector instrumental | ⭐⭐ | Baixa |
| Plataforma CAIB 2008–2017 | ❌ scraping | HTML | CAIB | ⭐⭐⭐ (históric) | Alta |
| Consell Menorca (Excel) | Parcial | XLSX | Menorca | ⭐ | Mitjana |
| Registre Contractes estatal | ✅ CSV | CSV agregat | Totes CCAA | ⭐ (stats) | Baixa |
| Gobierto Contratación | ✅ SQL API | JSON | Estatal (Balears) | ⭐⭐ | Baixa |
| Autoritat Portuària Balears | Via PCSP | XML | Port de Balears | ⭐⭐ | Alta (via PCSP) |
| Consell Mallorca, Eivissa, Formentera | Via PCSP | — | Cada Consell | ⭐⭐ | Alta (via PCSP) |
| Registre CAIB (JCCA) | ❌ | PDF | CAIB | ⭐ | Molt alta |
| BOIB | Parcial (RSS) | HTML/RSS | CAIB | ⭐ | Molt alta |

---

## Recomanacions prioritàries

### Prioritat 1 — PCSP estatal (ATOM/XML)
La font amb major valor afegit. Permet afegir:
- **CPV codes** (ara absents del dataset)
- **Entitats locals** (Consells Insulars, ajuntaments)
- **Etapa de licitació** (no només adjudicació)
- **Totes les ofertes** (no només l'adjudicatari)

Cal processar els fitxers ATOM/CODICE. L'eina **OpenPLACSP** (open source, EUPL 1.2) ja existeix per transformar-los. El filtratge per `id_organo_contratacion` que comenci per `A04` (Illes Balears) reduiria el volum.

**Referència:** https://www.hacienda.gob.es/es-ES/GobiernoAbierto/Datos%20Abiertos/Paginas/licitaciones_plataforma_contratacion.aspx

---

### Prioritat 2 — Socrata API del catàleg GOIB
Accés programàtic incremental al dataset existent, sense baixar el CSV complet (~16 MB) cada vegada. Útil si en el futur es vol sincronitzar amb major freqüència que trimestral o fer consultes puntuals.

**Endpoint:** `https://catalegdades.caib.cat/resource/j2yj-e83g.json`

---

### Prioritat 3 — Portal de Transparència CAIB (contractes menors)
Verificar si el fitxer de contractes menors del portal de transparència aporta camps o administracions addicionals respecte al CSV actual. Si inclou el camp `es_pime` separat o nous camps de classificació, pot ser un suplement de la font actual.

**URL descàrrega:** https://www.caib.es/sites/transparencia/ca/contractes_menors/

---

### Prioritat 4 — Plataforma CAIB 2008–2017 (scraping)
Per a un projecte d'extensió historic que allargui la sèrie temporal fins al 2008. Requereix scraping web i normalització dels camps (el model de dades és diferent). Esforç considerable, però el valor és clar per a anàlisis de llarg recorregut.

**URL:** https://plataformadecontractacio.caib.es
