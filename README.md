# The Fine Print

A data investigation into how social platforms rewrote their privacy policies and terms of service
for the age of AI: 2,283 archived documents from 25 platforms, 2022 to 2026.

Live site: https://ishamainii.github.io/fineprint/

The site has an overview and nine explorations: **arrival** (when AI-training clauses appeared),
**vocabulary** (how the language shifted, with a word explorer), **hedging**, **length** and readability,
**placement** (where the clauses sit), **churn** (how often documents change), **templates**
(shared wording), a **model lab** (the classifier, running live in the browser) and **methods**.

Platforms are anonymised on the site (letters + broad category; company and product names in quotes
replaced). The source data is public, so the analysis is fully reproducible.

## Measured results
- **Search:** a SQLite FTS5 index over 937,131 sentences answers queries in under 3 ms versus
  ~2.5 s for a regex scan, over 800× faster with the same matches (`search.py`, results in `build/data/benchmark.json`).
- **Classifier:** TF-IDF + logistic regression, trained on 133 hand-labelled sentences with names redacted:
  F1 0.89 ± 0.01 (ten repeats of 5-fold CV) vs 0.77 for a keyword rule; recall 0.69 → 0.89 (`export_model.py`).

## Pipeline
```bash
git clone https://github.com/OpenTermsArchive/pga-versions     # source data, CC BY-SA 4.0
python extract.py ../pga-versions    # every version -> fineprint.db (sqlite)
python classify.py                   # AI sentences + language measures
python search.py                     # FTS5 index + benchmark
python timeline.py                   # first training clause per platform (build/data.json, has real names, not published)
python export.py                     # anonymised datasets -> build/data/
python export_model.py               # classifier trained on redacted text -> build/data/model.json
python site_src/build.py             # assembles site/ from site_src/
cd site && python -m http.server
```
`anon.py` holds the anonymising rules. `labels_public.csv` has my hand labels with names redacted.
Python (pandas, scikit-learn, sqlite3); the site is plain HTML, CSS and JavaScript with hand-drawn SVG charts.
