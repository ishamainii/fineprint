# export.py
# builds every dataset the site uses, already anonymised, into site/data/*.json
#
# anonymising: each platform gets a letter (shuffled, not alphabetical) and one of five broad
# categories. Twitter and X are one service across a rename, so they're merged into one history.
# Company and product names inside quoted text are replaced with [company] / [product], and no
# links to individual archived commits are published (they would give the platform away).

import json
import math
import random
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, precision_recall_curve
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import make_pipeline

from classify import HEDGE, kind, reading_ease

OUT = Path("build/data"); OUT.mkdir(parents=True, exist_ok=True)   # public, anonymised
db = sqlite3.connect("fineprint.db")

from anon import CATEGORY, CODE, MERGE, NAMES, PRODUCTS, _name, cat, code, redact

def dump(name, obj):
    json.dump(obj, open(OUT / f"{name}.json", "w"), separators=(",", ":"), default=str)
    print(f"  {name}.json  {(OUT / f'{name}.json').stat().st_size / 1024:.0f} KB")


# ---------------------------------------------------------------- base tables
V = pd.read_sql("select id, platform, doc, date, message, n_words from versions", db)
V["tech"] = V.message.str.startswith("Apply technical")
V["code"] = V.platform.map(code)
x_start = V[V.platform == "X"].date.min()
AI = pd.read_sql("select version_id, pos, n_total, sentence, kind, hedges, words, optout, ease from ai_sentences", db)
clauses = {c["sentence"] for c in json.load(open("build/data.json"))["clauses"]}

def in_force(day):
    """versions in force on `day`: latest per platform+doc, with the old Twitter docs retired once X starts"""
    v = V[(V.date <= day) & ~V.tech]     # maintenance re-scrapes can be glitched (one captured a policy at ~7x its real length)
    if day >= x_start:
        v = v[v.platform != "Twitter"]
    return v.sort_values("date").groupby(["platform", "doc"]).tail(1)

texts = {}
def text(vid):
    if vid not in texts:
        texts[vid] = db.execute("select text from versions where id=?", (int(vid),)).fetchone()[0]
    return texts[vid]

def sents(vid):
    return [r[0] for r in db.execute("select sentence from sentences where version_id=? order by pos", (int(vid),))]

quarters = [str(q) for q in pd.period_range("2022Q3", "2026Q3", freq="Q")]
q_end = {q: pd.Period(q).end_time.strftime("%Y-%m-%d") for q in quarters}
platforms = sorted(set(code(p) for p in V.platform))
meta = {"platforms": [{"code": c, "category": cat([p for p in CATEGORY if code(p) == c][0])} for c in platforms],
        "versions": int(len(V)), "sentences": int(db.execute("select count(*) from sentences").fetchone()[0]),
        "quarters": quarters}
print("exporting")
dump("meta", meta)

# ---------------------------------------------------------------- 1. arrival
first = json.load(open("build/data.json"))["first"]
arrival = []
for r in first:
    c = code(r["platform"])
    if any(a["code"] == c for a in arrival):           # Twitter + X merged: keep the earliest
        continue
    tracked = V[V.platform.map(code) == c].date.min()
    arrival.append({"code": c, "category": cat(r["platform"]), "date": r["date"], "tracked": tracked,
                    "present_at_start": r["date"] == tracked, "doc": r["doc"], "text": redact(r["sentence"])[:700]})
never = [{"code": c, "category": m["category"], "tracked": V[V.code == c].date.min()} for m in meta["platforms"]
         for c in [m["code"]] if c not in {a["code"] for a in arrival}]
growth = []
for q in quarters:
    live = in_force(q_end[q]); sub = AI[AI.version_id.isin(live.id)]
    growth.append({"q": q, "ai_per_10k": round(1e4 * len(sub) / live.n_words.sum(), 2),
                   "train_per_10k": round(1e4 * sub.sentence.isin(clauses).sum() / live.n_words.sum(), 2),
                   "platforms_with_clause": int(sum(a["date"] <= q_end[q] for a in arrival))})
dump("arrival", {"arrival": sorted(arrival, key=lambda a: a["date"]), "never": never, "growth": growth})

# ---------------------------------------------------------------- 2. vocabulary over time
TERMS = {
    "machine learning": r"machine[- ]learning", "artificial intelligence": r"artificial intelligence", "AI": r"\bAI\b",
    "generative AI": r"generative (?:AI|artificial)", "large language model": r"large language models?|\bLLMs?\b",
    "train": r"\btrain(?:s|ed|ing)?\b", "model(s)": r"\bmodels?\b", "algorithm": r"\balgorithm", "automated": r"\bautomat",
    "personalize": r"\bpersonali[sz]", "publicly available": r"publicly available", "legitimate interest": r"legitimate interests?",
    "consent": r"\bconsent", "opt out": r"opt[- ]out", "biometric": r"\bbiometric", "face / facial": r"\bfac(?:e|ial) (?:recognition|geometry|data|scan)",
    "children": r"\bchild(?:ren)?\b|\bminors?\b", "delete": r"\bdelet", "third part(y/ies)": r"third[- ]part", "partners": r"\bpartners?\b",
    "advertis(e/ing)": r"\badverti[sz]", "location": r"\blocation", "safety": r"\bsafety\b", "research": r"\bresearch",
}
TERMS_RX = {k: re.compile(v, re.I) for k, v in TERMS.items()}
tok = lambda s: re.findall(r"[a-z][a-z'-]{2,}", re.sub(r"<br|https?://\S+", " ", s.lower()))
STOP = set("the and our you your for with that this are from not may can will any use such other into have has its their when what about which more also these those how where who all them they been was were but than only some each own out there would could should under through over both within without upon".split())
trend = {k: [] for k in TERMS}
uni = defaultdict(lambda: [0] * len(quarters)); words_q = []
for qi, q in enumerate(quarters):
    live = in_force(q_end[q]); w = int(live.n_words.sum()); words_q.append(w)
    blob = "\n".join(text(v) for v in live.id)
    for k, rx in TERMS_RX.items():
        trend[k].append(round(1e4 * len(rx.findall(blob)) / w, 2))
    if qi == len(quarters) - 1:     # how many documents use each word in the latest quarter
        docfreq = Counter(t for v in live.id for t in set(tok(text(v))))
    for t, n in Counter(tok(blob)).items():
        if t not in STOP:
            uni[t][qi] = n
totals = {t: sum(v) for t, v in uni.items()}
keep = sorted(totals, key=totals.get, reverse=True)[:2500]
brands = [n.lower().replace(" ", "") for n in NAMES + PRODUCTS]
keep = [t for t in keep if not any(b in t.replace("'", "") for b in brands)]
explorer = {t: [round(1e4 * n / w, 2) for n, w in zip(uni[t], words_q)] for t in keep}
# biggest risers: rate in last 4 quarters vs first 4
rise = sorted(((t, (np.mean(v[-4:]) + 0.05) / (np.mean(v[:4]) + 0.05)) for t, v in explorer.items()
               if np.mean(v[-4:]) > 1.5 and docfreq[t] >= 5), key=lambda r: -r[1])[:15]   # used by 5+ documents, so no one-off foreign passages
dump("vocabulary", {"terms": trend, "explorer": explorer, "risers": [{"term": t, "x": round(x, 1)} for t, x in rise]})

# ---------------------------------------------------------------- 3. hedging / modality
MAYS = re.compile(r"\b(may|might|could|can)\b", re.I); WILLS = re.compile(r"\b(will|shall|must|do not|does not|never)\b", re.I)
modal = []
for q in quarters:
    live = in_force(q_end[q]); blob = "\n".join(text(v) for v in live.id); w = live.n_words.sum()
    sub = AI[AI.version_id.isin(live.id)].drop_duplicates("sentence"); aw = max(1, sub.words.sum())
    sj = " ".join(sub.sentence)
    modal.append({"q": q, "may_all": round(1e3 * len(MAYS.findall(blob)) / w, 1), "will_all": round(1e3 * len(WILLS.findall(blob)) / w, 1),
                  "may_ai": round(1e3 * len(MAYS.findall(sj)) / aw, 1), "will_ai": round(1e3 * len(WILLS.findall(sj)) / aw, 1),
                  "hedge_ai": round(100 * sub.hedges.sum() / aw, 2)})
latest = in_force("2026-12-31")
plain = pd.DataFrame({"s": [s for v in latest.id for s in sents(v)]})
plain = plain[plain.s.str.split().str.len().between(5, 80) & ~plain.s.isin(set(AI.sentence))]
fair = AI[AI.sentence.isin(clauses)].drop_duplicates("sentence"); fair = fair[fair.words.between(5, 80)]
hedge_words = Counter(m.lower() for s in fair.sentence for m in HEDGE.findall(s))
hedge_plain = Counter(m.lower() for s in plain.s for m in HEDGE.findall(s))
fw, pw = fair.words.sum(), plain.s.str.split().str.len().sum()
per_word = [{"word": h, "clauses": round(1e3 * hedge_words[h] / fw, 1), "other": round(1e3 * hedge_plain[h] / pw, 1)} for h in hedge_words if hedge_words[h] >= 3]
dump("hedging", {"modal": modal, "per_word": sorted(per_word, key=lambda r: -r["clauses"]),
                 "clause_rate": round(100 * fair.hedges.sum() / fw, 2), "other_rate": round(100 * plain.s.map(lambda s: len(HEDGE.findall(s))).sum() / pw, 2),
                 "n_clauses": int(len(fair)), "n_other": int(len(plain))})

# ---------------------------------------------------------------- 4. readability + length
_ease = {}
def doc_ease(vid):
    if vid not in _ease:
        es = [e for e in (reading_ease(s) for s in sents(vid) if 5 <= len(s.split()) <= 80) if e is not None]
        _ease[vid] = float(np.median(es)) if es else None
    return _ease[vid]
read_q = []
for q in quarters:
    live = in_force(q_end[q])
    read_q.append({"q": q, "ease": round(float(np.median([e for e in (doc_ease(v) for v in live.id) if e is not None])), 1),
                   "words_median": int(live.n_words.median()), "words_total": int(live.n_words.sum()), "docs": int(len(live))})
length = []
for (c, d), g in V[~V.tech].assign(code=V.platform.map(code)).sort_values("date").groupby(["code", "doc"]):
    g = g[~((g.platform == "Twitter") & (g.date >= x_start))]
    length.append({"code": c, "doc": d, "points": [[r.date, int(r.n_words)] for r in g.itertuples()]})
minutes = {r["code"] + "|" + r["doc"]: round(r["points"][-1][1] / 238, 1) for r in length}   # ~238 wpm adult silent reading
total_minutes = round(sum(m for m in minutes.values()) / 60, 1)
dump("readability", {"quarters": read_q, "length": length, "hours_to_read_all": total_minutes})

# ---------------------------------------------------------------- 5. placement
depth_ai, depth_cl, heads = [], [], Counter()
for r in latest.itertuples():
    sub = AI[AI.version_id == r.id]
    depth_ai += list(sub.pos / sub.n_total.clip(lower=2).sub(1))
    depth_cl += list((sub[sub.sentence.isin(clauses)].pos / sub[sub.sentence.isin(clauses)].n_total.clip(lower=2).sub(1)))
    raw = text(r.id); lines = raw.splitlines(); hidx = [(i, l.lstrip("#").strip()) for i, l in enumerate(lines) if l.startswith("#")]
    for s in sub.sentence:
        probe = s[:40]
        li = next((i for i, l in enumerate(lines) if probe[:25] in " ".join(l.split())), None)
        if li is None:
            continue
        h = [t for i, t in hidx if i <= li]
        if h:
            heads[re.sub(r"[^a-z ]", "", redact(h[-1]).lower()).strip()[:60]] += 1
hist = lambda xs: [int(((np.array(xs) >= i / 10) & (np.array(xs) < (i + 1) / 10 + (i == 9))).sum()) for i in range(10)]
dump("placement", {"ai": hist(depth_ai), "clauses": hist(depth_cl), "median_ai": round(float(np.median(depth_ai)), 2),
                   "median_clause": round(float(np.median(depth_cl)), 2),
                   "headings": [{"h": h, "n": n} for h, n in heads.most_common(14) if h]})

# ---------------------------------------------------------------- 6. churn
rev = []
for (p, d), g in V[~V.tech].sort_values("date").groupby(["platform", "doc"]):
    prev = None
    for r in g.itertuples():
        cur = set(sents(r.id))
        if prev is not None:
            add, rem = len(cur - prev), len(prev - cur)
            ai_touch = bool({s for s in cur ^ prev} & set(AI.sentence))
            rev.append({"code": code(p), "doc": d, "date": r.date, "added": add, "removed": rem, "ai": ai_touch})
        prev = cur
R = pd.DataFrame(rev)
R = R[(R.added + R.removed) > 0]
R["q"] = pd.PeriodIndex(R.date, freq="Q").astype(str)
per_q = R.groupby("q").agg(revisions=("date", "size"), ai=("ai", "sum")).reindex(quarters, fill_value=0).reset_index()
size = (R.added + R.removed)
per_platform = R.groupby("code").size().sort_values(ascending=False)
dump("churn", {"per_q": per_q.to_dict("records"), "n": int(len(R)),
               "size_quantiles": {k: int(size.quantile(v)) for k, v in [("p25", .25), ("median", .5), ("p75", .75), ("p90", .9), ("max", 1)]},
               "size_hist": np.histogram(np.log10(size.clip(lower=1)), bins=np.arange(0, 4.01, 0.25))[0].tolist(),
               "per_platform": [{"code": c, "n": int(n)} for c, n in per_platform.items()],
               "ai_share": round(float(R.ai.mean()), 3)})

# ---------------------------------------------------------------- 7. templates (shared wording across platforms)
U = AI.merge(V[["id", "platform"]], left_on="version_id", right_on="id").drop_duplicates(["platform", "sentence"])
U["code"] = U.platform.map(code)
U = U.drop_duplicates(["code", "sentence"])
vec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1).fit(U.sentence)
X = vec.transform(U.sentence); sim = cosine_similarity(X)
codes = sorted(U.code.unique()); idx = {c: np.where(U.code.values == c)[0] for c in codes}
M = [[round(float(sim[np.ix_(idx[a], idx[b])].max()), 2) if a != b else None for b in codes] for a in codes]
pairs = []
for i in range(len(U)):
    for j in range(i + 1, len(U)):
        if U.code.iat[i] != U.code.iat[j] and sim[i, j] > 0.5:
            pairs.append({"a": U.code.iat[i], "b": U.code.iat[j], "sim": round(float(sim[i, j]), 2), "ta": redact(U.sentence.iat[i])[:400], "tb": redact(U.sentence.iat[j])[:400]})
pairs = sorted(pairs, key=lambda p: -p["sim"])
seen, top = set(), []
for p in pairs:
    k = tuple(sorted((p["a"], p["b"])))
    if k not in seen:
        seen.add(k); top.append(p)
dump("templates", {"codes": codes, "matrix": M, "pairs": top[:14], "n_pairs": len(pairs)})

