# analysis.py
# the deeper stuff for the story:
#   1. growth: platforms with a training clause by month, AI sentences per 10k words by quarter, policy length by quarter
#   2. which words set training clauses apart (log-odds with an informative dirichlet prior, Monroe et al. 2008)
#   3. the actual redline: sentences added/removed in the version where each platform's clause first shows up
# writes site/deep.json

import difflib
import json
import re
import sqlite3
from collections import Counter

import numpy as np
import pandas as pd

db = sqlite3.connect("fineprint.db")
data = json.load(open("build/data.json"))
versions = pd.read_sql("select id, platform, doc, date, message, n_words from versions", db)
versions = versions[~versions.message.str.startswith("Apply technical")]      # archive maintenance, not policy changes
ai = pd.read_sql("select version_id, sentence, kind from ai_sentences", db)
clause_set = {c["sentence"] for c in data["clauses"]}

# ---------- 1. growth ----------
quarters = pd.period_range("2022Q3", "2026Q4", freq="Q")
growth = []
for q in quarters:
    end = q.end_time.strftime("%Y-%m-%d")
    live = versions[versions.date <= end].sort_values("date").groupby(["platform", "doc"]).tail(1)   # the version in force at quarter end
    pp = live[live.doc == "Privacy Policy"]
    sub = ai[ai.version_id.isin(live.id)]
    growth.append(dict(quarter=str(q),
                       docs=int(len(live)),
                       ai_per_10k=round(1e4 * len(sub) / live.n_words.sum(), 2),
                       median_privacy_words=int(pp.n_words.median()) if len(pp) else None))

firsts = sorted(r["date"] for r in data["first"])
months = pd.period_range("2022-07", "2026-11", freq="M")
cumulative = [dict(month=str(m), platforms=sum(d[:7] <= str(m) for d in firsts)) for m in months]

# ---------- 2. distinctive words ----------
latest = versions.groupby(["platform", "doc"]).id.max().tolist()
plain = pd.read_sql(f"select sentence from sentences where version_id in ({','.join(map(str, latest))})", db).sentence
plain = plain[~plain.isin(clause_set)]
tok = lambda s: re.findall(r"[a-z][a-z'-]+", re.sub(r"<br", " ", s).lower())   # flattened tables leave "<br" behind
a = Counter(w for s in clause_set for w in tok(s))          # training clauses (each unique sentence once)
b = Counter(w for s in plain.drop_duplicates() for w in tok(s))
prior = a + b
na, nb, n0 = sum(a.values()), sum(b.values()), sum(prior.values())
rows = []
for w, p in prior.items():
    if a[w] < 4:
        continue
    alpha = p * 500 / n0     # scaled prior, so rare words don't dominate
    d = (np.log((a[w] + alpha) / (na + 500 - a[w] - alpha)) - np.log((b[w] + alpha) / (nb + 500 - b[w] - alpha)))
    var = 1 / (a[w] + alpha) + 1 / (b[w] + alpha)
    rows.append((w, d / np.sqrt(var), a[w]))
stop = {"the", "and", "our", "to", "of", "for", "or", "we", "in", "a", "your", "such", "as", "with", "that", "this", "is", "be", "by", "on", "it", "an", "are", "us"}
words = [dict(word=w, z=round(z, 1), n=n) for w, z, n in sorted(rows, key=lambda r: -r[1]) if w not in stop][:16]

# ---------- 3. redlines ----------
def sents(vid):
    return [r[0] for r in db.execute("select sentence from sentences where version_id=? order by pos", (int(vid),))]   # int(): sqlite won't bind numpy ints

redlines = []
for r in data["first"]:
    if r["present_at_start"]:
        continue
    vs = versions[(versions.platform == r["platform"]) & (versions.doc == r["doc"])].sort_values("date")
    cur = vs[vs.date == r["date"]]
    prev = vs[vs.date < r["date"]]
    if cur.empty or prev.empty:
        continue
    before, after = sents(prev.id.iloc[-1]), sents(cur.id.iloc[0])
    sm = difflib.SequenceMatcher(None, before, after, autojunk=False)
    added = [s for op, i1, i2, j1, j2 in sm.get_opcodes() if op in ("insert", "replace") for s in after[j1:j2]]
    removed = [s for op, i1, i2, j1, j2 in sm.get_opcodes() if op in ("delete", "replace") for s in before[i1:i2]]
    hit = [s for s in added if s in clause_set]
    if not hit:
        continue
    # the removed sentence most similar to the clause, if any (often the old version of the same line)
    old = max(removed, key=lambda s: difflib.SequenceMatcher(None, s, hit[0]).ratio(), default=None)   # most similar removed line
    sim = difflib.SequenceMatcher(None, old, hit[0]).ratio() if old else 0
    redlines.append(dict(platform=r["platform"], doc=r["doc"], date=r["date"], url=r["url"],
                         prev_date=prev.date.iloc[-1], n_added=len(added), n_removed=len(removed),
                         before=old if sim > 0.6 else None, sim=round(sim, 2), after=hit[0]))

# policy length change, first tracked vs latest privacy policy
pp = versions[versions.doc == "Privacy Policy"].sort_values("date")
length = (pp.groupby("platform").agg(first_date=("date", "first"), first_words=("n_words", "first"),
                                     last_words=("n_words", "last")).reset_index())
length = length[length.first_date <= "2022-12-31"]
length["change"] = (length.last_words / length.first_words - 1).round(2)

out = dict(growth=growth, cumulative=cumulative, words=words, redlines=redlines,
           length=length.sort_values("change", ascending=False).to_dict("records"))
json.dump(out, open("build/deep.json", "w"), indent=1, default=str)

print(pd.DataFrame(growth)[["quarter", "ai_per_10k", "median_privacy_words"]].iloc[::2].to_string(index=False))
print("\ndistinctive:", ", ".join(f"{w['word']}({w['z']})" for w in words))
print("\nredlines:", [(r["platform"], r["date"], r["n_added"], bool(r["before"])) for r in redlines])
print("\nlength change since 2022:\n", length.sort_values("change", ascending=False)[["platform", "first_words", "last_words", "change"]].to_string(index=False))
