# search.py
# Step A: make word search over the policy sentences fast.
#
# Baseline = what I was doing before: loop over every sentence and run a regex,
# or a sql LIKE '%...%' (which also has to read every row).
# Index = SQLite FTS5 full-text index. It stores, for every word, the list of rows that
# contain it (an inverted index), so a query only touches the rows that can match.
#
# usage: python search.py            (builds the index once, then benchmarks)

import re
import sqlite3
import statistics
import time

QUERIES = {
    # name: (fts5 query, equivalent regex for the baseline)
    "train + AI": ('train* AND ("artificial intelligence" OR "machine learning" OR generative)',
                   (r"\btrain\w*", r"artificial intelligence|machine learning|generative")),
    "opt out":    ('"opt out"', (r"\bopt[- ]out\b",)),
    "public content": ('"publicly available information"', (r"\bpublicly available information\b",)),
}


def build_index(db):
    db.execute("drop table if exists sent_fts")
    db.execute("create virtual table sent_fts using fts5(sentence, content='sentences', content_rowid='rowid')")
    t = time.perf_counter()
    db.execute("insert into sent_fts(rowid, sentence) select rowid, sentence from sentences")
    db.commit()
    print(f"built FTS5 index over {db.execute('select count(*) from sentences').fetchone()[0]:,} sentences "
          f"in {time.perf_counter() - t:.1f}s")


def timed(fn, reps=3):
    times, out = [], None
    for _ in range(reps):
        t = time.perf_counter(); out = fn(); times.append(time.perf_counter() - t)
    return statistics.median(times), out


def main():
    db = sqlite3.connect("fineprint.db")
    if not db.execute("select name from sqlite_master where name='sent_fts'").fetchone():
        build_index(db)

    all_sents = [r[0] for r in db.execute("select sentence from sentences")]   # baseline gets the data in memory, to be fair

    results = []
    print(f"\n{'query':16} {'regex scan':>11} {'sql LIKE':>10} {'FTS5':>9} {'speedup':>8}  hits")
    for name, (fts, rx) in QUERIES.items():
        pats = [re.compile(p, re.I) for p in rx]   # every pattern has to match, same as AND in fts
        t_rx, hits_rx = timed(lambda: sum(1 for s in all_sents if all(p.search(s) for p in pats)), reps=1)
        like = "%" + name.split(" + ")[0].replace("public content", "publicly available information") + "%"
        t_like, _ = timed(lambda: db.execute("select count(*) from sentences where sentence like ?", (like,)).fetchone()[0], reps=1)
        t_fts, hits_fts = timed(lambda: db.execute("select count(*) from sent_fts where sent_fts match ?", (fts,)).fetchone()[0])
        print(f"{name:16} {t_rx*1000:9.0f}ms {t_like*1000:8.0f}ms {t_fts*1000:7.1f}ms {t_rx/t_fts:7.0f}x  {hits_fts:,} (regex {hits_rx:,})")
        results.append(dict(query=name, regex_ms=round(t_rx * 1000), like_ms=round(t_like * 1000), fts_ms=round(t_fts * 1000, 1),
                            speedup=round(t_rx / t_fts), hits_fts=hits_fts, hits_regex=hits_rx))
    import json
    json.dump({"sentences": len(all_sents), "queries": results}, open("build/data/benchmark.json", "w"))


if __name__ == "__main__":
    main()
