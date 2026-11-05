# The Fine Print

A data investigation into how social platforms rewrote their privacy policies and terms of service
for the age of AI: 2,283 archived documents from 25 platforms, 2022 to 2026.

Live site: https://ishamainii.github.io/fineprint/

The site has an overview and nine explorations: **arrival** (when AI-training clauses appeared),
**vocabulary** (how the language shifted, with a word explorer), **hedging**, **length** and readability,
**placement** (where the clauses sit), **churn** (how often documents change), **templates**
(shared wording), a **model lab** (the classifier, running live in the browser) and **methods**.

Platforms are named. The classifier is trained on text with company and product names blacked out,
so it learns how a training clause is worded rather than which company wrote it. The source data is
public, so the analysis is fully reproducible.

Every headline number has an interval or a test (stats.py): a cluster bootstrap that resamples
whole platforms, a sign test for the direction of change, a Wilcoxon signed-rank test for the
within-platform hedging gap, Kendall's tau for trends, and grouped cross-validation that holds out
whole companies to show how the classifier does on platforms it has never seen.

## Measured results
- **Search:** a SQLite FTS5 index over 937,131 sentences answers queries in under 3 ms versus
  ~2.5 s for a regex scan, over 800× faster with the same matches (`search.py`, results in `build/data/benchmark.json`).
- **Classifier:** TF-IDF + logistic regression, trained on 133 hand-labelled sentences with names redacted:
  F1 0.887 ± 0.021 (20 repeats of 5-fold CV) vs 0.766 for a keyword rule; paired-bootstrap 95% CI for
  the gain −0.006 to 0.19. Holding out whole platforms, F1 drops to 0.69: the model partly learns house
  style, so for new companies the keyword rule is safer (`export_model.py`, `stats.py`).
- **AI language in force:** 15× the first year's rate (95% CI 8.5–30.1×, cluster bootstrap); up at 12
  of the 14 platforms where it moved (sign test p = 0.0065).
- **Hedging:** training clauses hedge 2.05× as much as their own platform's other sentences (95% CI
  1.51–2.61×; Wilcoxon signed-rank p = 0.0034, 12 platforms).

## Pipeline
```bash
git clone https://github.com/OpenTermsArchive/pga-versions     # source data, CC BY-SA 4.0
python extract.py ../pga-versions    # every version -> fineprint.db (sqlite)
python classify.py                   # AI sentences + language measures
python search.py                     # FTS5 index + benchmark
python timeline.py                   # first training clause per platform (build/data.json, has real names, not published)
python export.py                     # datasets for the site -> build/data/
python export_model.py               # classifier trained on name-stripped text -> build/data/model.json
python stats.py                       # intervals and tests -> build/data/stats.json
python site_src/build.py             # assembles site/ from site_src/
cd site && python -m http.server
```
`anon.py` holds the naming rules (PUBLIC = True publishes real names). `labels_public.csv` has my hand labels with names redacted.
Python (pandas, scikit-learn, sqlite3); the site is plain HTML, CSS and JavaScript with hand-drawn SVG charts.
