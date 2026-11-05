# stats.py: uncertainty and significance for every headline number on the site.
#
# The unit of independence here is the platform, not the sentence or the document: one company's
# lawyers write all of its documents, and a platform that revises weekly would otherwise count
# hundreds of times. So intervals come from a cluster bootstrap that resamples platforms with
# replacement, and tests are run across platforms.
#
#   python stats.py      (after export.py; writes build/data/stats.json)

import json
import re
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, f1_score
from sklearn.model_selection import GroupKFold, StratifiedKFold, cross_val_predict
from sklearn.pipeline import make_pipeline

from anon import MERGE, code, strip_names
from classify import HEDGE, kind

rng = np.random.default_rng(20261104)
B = 4000
db = sqlite3.connect("fineprint.db")
OUT = Path("build/data")
ci = lambda xs: [round(float(np.percentile(xs, 2.5)), 3), round(float(np.percentile(xs, 97.5)), 3)]

V = pd.read_sql("select id, platform, doc, date, message, n_words from versions", db)
V["tech"] = V.message.str.startswith("Apply technical")
x_start = V[V.platform == "X"].date.min()
V["who"] = V.platform.map(lambda p: MERGE.get(p, p))


def in_force(day):
    v = V[(V.date <= day) & ~V.tech]
    if day >= x_start:
        v = v[v.platform != "Twitter"]
    return v.sort_values("date").groupby(["platform", "doc"]).tail(1)


# ------------------------------------------------------------- 1. growth of AI language
# AI vocabulary only: terms that name the technology. "train" and "model" are left out because
# both are common in non-AI senses (train staff, business model).
AI_RX = re.compile(r"machine[- ]learning|artificial intelligence|\bAI\b|generative (?:AI|artificial)|large language models?|\bLLMs?\b|neural network", re.I)
quarters = [str(q) for q in pd.period_range("2022Q3", "2026Q3", freq="Q")]
q_end = {q: pd.Period(q).end_time.strftime("%Y-%m-%d") for q in quarters}
hits = {}
for vid in V.id:
    hits[vid] = len(AI_RX.findall(db.execute("select text from versions where id=?", (int(vid),)).fetchone()[0]))
V["ai_terms"] = V.id.map(hits)
# the headline measure, the same one the chapter 1 chart plots: sentences that mention AI
n_ai_sent = dict(db.execute("select version_id, count(*) from ai_sentences group by version_id").fetchall())
V["ai"] = V.id.map(lambda v: n_ai_sent.get(v, 0))

# per platform per quarter: AI mentions and words in force
rows = []
for q in quarters:
    live = in_force(q_end[q])
    for who, g in live.groupby("who"):
        rows.append({"q": q, "who": who, "ai": int(g.ai.sum()), "terms": int(g.ai_terms.sum()), "w": int(g.n_words.sum())})
P = pd.DataFrame(rows)
first, last = quarters[:4], quarters[-4:]
plats = sorted(P.who.unique())
A = {w: P[P.who == w] for w in plats}


def growth(sample, col="ai"):
    d = pd.concat([A[w] for w in sample])
    rate = lambda qs: np.mean([1e4 * d[d.q == q][col].sum() / max(1, d[d.q == q].w.sum()) for q in qs])
    return rate(last) / max(rate(first), 1e-9), rate(first), rate(last)


g, r0, r1 = growth(plats)
boot = [growth(rng.choice(plats, len(plats)))[0] for _ in range(1000)]
g_terms = growth(plats, "terms")[0]       # robustness: count AI terms instead of AI sentences
# without the single biggest contributor, to show the rise isn't one company
contrib = P[P.q.isin(last)].groupby("who").ai.sum().sort_values(ascending=False)
g_drop = growth([w for w in plats if w != contrib.index[0]])[0]
per_plat = []
for w in plats:
    d = A[w]
    f = 1e4 * d[d.q.isin(first)].ai.sum() / max(1, d[d.q.isin(first)].w.sum()); l = 1e4 * d[d.q.isin(last)].ai.sum() / max(1, d[d.q.isin(last)].w.sum())
    if d[d.q.isin(first)].w.sum() and d[d.q.isin(last)].w.sum():
        per_plat.append((w, f, l))
up = sum(l > f for _, f, l in per_plat); down = sum(l < f for _, f, l in per_plat)
sign_p = stats.binomtest(up, up + down, 0.5, alternative="greater").pvalue
growth_out = {"ratio": round(g, 1), "ci": [round(x, 1) for x in ci(boot)], "rate_first": round(r0, 2), "rate_last": round(r1, 2),
              "without_top": {"platform": contrib.index[0], "ratio": round(g_drop, 1)}, "ratio_terms": round(g_terms, 1),
              "platforms_up": int(up), "platforms_down": int(down), "platforms_compared": len(per_plat), "sign_test_p": float(f"{sign_p:.2g}"),
              "per_platform": [{"platform": w, "first": round(f, 2), "last": round(l, 2)} for w, f, l in sorted(per_plat, key=lambda r: -r[2])]}
print("growth", {k: v for k, v in growth_out.items() if k != "per_platform"})

# ------------------------------------------------------------- 2. hedging: clauses vs the rest of the SAME policy
# Comparing clauses with all other sentences mixes platforms with different house styles. Here each
# platform's training clauses are compared with the other sentences in its own current documents,
# and the test is across platforms (Wilcoxon signed-rank on the per-platform difference).
clauses = {c["sentence"] for c in json.load(open("build/data.json"))["clauses"]}
AIS = pd.read_sql("select version_id, platform, sentence, hedges, words from ai_sentences", db)
latest = in_force("2026-12-31")
hed = lambda s: len(HEDGE.findall(s))
pairs = []
for who, g in latest.groupby("who"):
    cl = AIS[AIS.sentence.isin(clauses) & AIS.platform.map(lambda p: MERGE.get(p, p)).eq(who)].drop_duplicates("sentence")
    cl = cl[cl.words.between(5, 80)]
    if cl.empty:
        continue
    other = [s for vid in g.id for (s,) in db.execute("select sentence from sentences where version_id=?", (int(vid),))]
    other = [s for s in other if 5 <= len(s.split()) <= 80 and s not in clauses]
    rc = 100 * cl.sentence.map(hed).sum() / cl.words.sum()
    ro = 100 * sum(map(hed, other)) / sum(len(s.split()) for s in other)
    pairs.append({"platform": who, "clause": round(rc, 2), "other": round(ro, 2), "n_clause": int(len(cl))})
H = pd.DataFrame(pairs)
w = stats.wilcoxon(H.clause, H.other, alternative="greater")
hb = []
for _ in range(B):
    s = H.sample(len(H), replace=True, random_state=int(rng.integers(1e9)))
    hb.append(s.clause.mean() / s.other.mean())
hedge_out = {"platforms": len(H), "higher_in_clause": int((H.clause > H.other).sum()), "ratio_of_means": round(H.clause.mean() / H.other.mean(), 2),
             "ci": [round(x, 2) for x in ci(hb)], "wilcoxon_p": float(f"{w.pvalue:.2g}"), "pairs": pairs}
print("hedging", {k: v for k, v in hedge_out.items() if k != "pairs"})

# ------------------------------------------------------------- 3. the classifier, evaluated honestly
lab = pd.read_csv("labels.csv")
full = pd.read_sql("select sentence from ai_sentences", db).drop_duplicates("sentence")
look = {s[:200]: s for s in full.sentence}
lab["raw"] = [look[s[:200]] for s in lab.sentence]
lab["text"] = lab.raw.map(strip_names)
lab["who"] = lab.platform.map(lambda p: MERGE.get(p, p))
y = lab.label.values
pipe = lambda: make_pipeline(TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True), LogisticRegression(C=4, class_weight="balanced", max_iter=2000))
rule = np.array([kind(s) == "train" for s in lab.raw]).astype(int)

f1s, diffs, briers = [], [], []
for k in range(20):
    p = cross_val_predict(pipe(), lab.text, y, cv=StratifiedKFold(5, shuffle=True, random_state=k), method="predict_proba")[:, 1]
    f1s.append(f1_score(y, p >= 0.5)); briers.append(brier_score_loss(y, p))
    if k == 0:
        p0 = p
# paired bootstrap over labelled sentences: model vs keyword rule on the same examples
for _ in range(B):
    i = rng.integers(0, len(y), len(y))
    diffs.append(f1_score(y[i], p0[i] >= 0.5) - f1_score(y[i], rule[i]))
# grouped by platform: train on some companies, test on companies the model has never seen
pg = cross_val_predict(pipe(), lab.text, y, cv=GroupKFold(5), groups=lab.who, method="predict_proba")[:, 1]
bins = np.linspace(0, 1, 6)
calib = []
for a, b in zip(bins[:-1], bins[1:]):
    m = (p0 >= a) & (p0 < b + (b == 1))
    if m.sum():
        calib.append({"bin": [round(a, 1), round(b, 1)], "n": int(m.sum()), "predicted": round(float(p0[m].mean()), 2), "observed": round(float(y[m].mean()), 2)})
model_out = {"n_labelled": int(len(y)), "n_positive": int(y.sum()), "f1_mean": round(float(np.mean(f1s)), 3), "f1_sd": round(float(np.std(f1s)), 3),
             "f1_range": [round(min(f1s), 3), round(max(f1s), 3)], "rule_f1": round(float(f1_score(y, rule)), 3),
             "f1_gain_ci": [round(x, 3) for x in ci(diffs)], "p_model_not_better": round(float(np.mean(np.array(diffs) <= 0)), 4),
             "f1_unseen_platforms": round(float(f1_score(y, pg >= 0.5)), 3), "brier": round(float(np.mean(briers)), 3),
             "brier_baseline": round(float(y.mean() * (1 - y.mean())), 3), "calibration": calib}
print("model", {k: v for k, v in model_out.items() if k != "calibration"})

# ------------------------------------------------------------- 4. length and readability trends
R = json.load(open(OUT / "readability.json"))["quarters"]
words = [q["words_total"] for q in R]
tau_w = stats.kendalltau(range(len(words)), words)
ease_key = next(k for k in R[0] if "ease" in k)
eases = [q[ease_key] for q in R]
tau_e = stats.kendalltau(range(len(eases)), eases)
trend_out = {"words_tau": round(tau_w.statistic, 2), "words_p": float(f"{tau_w.pvalue:.2g}"), "ease_tau": round(tau_e.statistic, 2), "ease_p": float(f"{tau_e.pvalue:.2g}"),
             "words_first": words[0], "words_last": words[-1]}
print("trend", trend_out)

# ------------------------------------------------------------- 5. the summary numbers the pages quote
meta = json.load(open(OUT / "meta.json")); arr = json.load(open(OUT / "arrival.json"))
growth_out["up_or_down"] = growth_out["platforms_up"] + growth_out["platforms_down"]
summary = {"meta": {"versions": meta["versions"], "sentences": meta["sentences"], "platforms": len(meta["platforms"])},
           "arrival": {"n": len(arr["arrival"]), "never": len(arr["never"])},
           "readability": {"hours": round(json.load(open(OUT / "readability.json"))["hours_to_read_all"])},
           "placement": {"median_clause": json.load(open(OUT / "placement.json"))["median_clause"]},
           "churn": {"n": json.load(open(OUT / "churn.json"))["n"], "ai_share": json.load(open(OUT / "churn.json"))["ai_share"]}}

json.dump({**summary, "growth": growth_out, "hedging": hedge_out, "model": model_out, "trend": trend_out,
           "method": {"bootstrap": "cluster bootstrap over platforms", "seed": 20261104}},
          open(OUT / "stats.json", "w"), separators=(",", ":"))
print("wrote build/data/stats.json")
