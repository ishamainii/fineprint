# timeline.py
# For each platform: the first archived version that contains a training clause
# (flagged by the model, kept only if the keyword rule OR my hand label agrees, so the
# timeline doesn't rest on the model alone), plus the language measures over time.
# Writes site/data.json for the website.

import json
import sqlite3

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline

from classify import kind

db = sqlite3.connect("fineprint.db")
ai = pd.read_sql("select * from ai_sentences", db)
versions = pd.read_sql("select id, platform, doc, date, message, n_words from versions", db)
lab = pd.read_csv("labels.csv")
full = ai.drop_duplicates("sentence")
lookup = {s[:200]: s for s in full.sentence}
lab["text"] = [lookup[s[:200]] for s in lab.sentence]

model = make_pipeline(TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True),
                      LogisticRegression(C=4, class_weight="balanced", max_iter=2000)).fit(lab.text, lab.label)
uniq = full[["sentence"]].copy()
uniq["model"] = model.predict(uniq.sentence)
uniq["rule"] = [kind(s) == "train" for s in uniq.sentence]
hand = dict(zip(lab.text, lab.label))
uniq["hand"] = uniq.sentence.map(hand)
# a sentence counts as a training clause if the hand label says so, or (no hand label) model and rule agree
uniq["clause"] = uniq.hand.fillna(((uniq.model == 1) & uniq.rule).astype(float)).astype(bool)
ai = ai.merge(uniq[["sentence", "clause"]], on="sentence")

first = (ai[ai.clause].sort_values("date").groupby("platform").first().reset_index()
         [["platform", "doc", "date", "commit_hash", "sentence", "optout", "hedges", "words", "ease", "depth"]])
first["url"] = "https://github.com/OpenTermsArchive/pga-versions/commit/" + first.commit_hash
tracked = versions.groupby("platform").date.min()
never = sorted(set(versions.platform) - set(first.platform))

# language of training clauses vs every other sentence in the same documents
clauses = ai[ai.clause].drop_duplicates("sentence")
fair = clauses[clauses.words.between(5, 80)]     # same length filter as the baseline below
summary = {
    "versions": int(len(versions)), "platforms": int(versions.platform.nunique()),
    "unique_clauses": int(len(clauses)),
    "clause_hedges_per_100_words": round(100 * fair.hedges.sum() / fair.words.sum(), 1),
    "clause_optout_share": round(float(clauses.optout.mean()), 2),
    "clause_reading_ease": round(float(fair.ease.median()), 1),
    "clauses_compared": int(len(fair)),
    "clause_median_depth": round(float(clauses.depth.median()), 2),
}
# baseline: ordinary sentences in the latest version of every document (5-80 words, to skip headings and tables)
from classify import HEDGE, reading_ease
latest = versions.groupby(["platform", "doc"]).id.max().tolist()
plain = pd.read_sql(f"select sentence from sentences where version_id in ({','.join(map(str, latest))})", db).sentence
plain = plain[plain.str.split().str.len().between(5, 80)]
summary["all_hedges_per_100_words"] = round(100 * plain.map(lambda x: len(HEDGE.findall(x))).sum() / plain.str.split().str.len().sum(), 1)
summary["all_reading_ease"] = round(float(plain.map(reading_ease).median()), 1)

rows = []
for r in first.to_dict("records"):
    r["tracked_since"] = tracked[r["platform"]]
    r["present_at_start"] = r["date"] == tracked[r["platform"]]     # clause was already there when tracking began
    rows.append(r)
cl = (ai[ai.clause].sort_values("date").drop_duplicates("sentence")[["platform", "doc", "date", "commit_hash", "sentence"]])
cl["url"] = "https://github.com/OpenTermsArchive/pga-versions/commit/" + cl.commit_hash
out = {"summary": summary, "never": never, "first": rows,
       "clauses": cl.drop(columns="commit_hash").to_dict("records")}
json.dump(out, open("build/data.json", "w"), indent=1, default=str)   # private: real names, never published
print(json.dumps(summary, indent=1))
print(first[["platform", "doc", "date"]].to_string(index=False))
print("no training clause found:", never)
