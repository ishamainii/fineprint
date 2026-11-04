# extract.py
# Pulls every version of each platform's Privacy Policy and Terms of Service out of the
# Open Terms Archive git history and saves them into a sqlite db.
#
# usage: python extract.py path/to/pga-versions
#
# OTA commits look like "Record new changes of LinkedIn Privacy Policy" (a real change on the
# site) or "Apply technical or declaration upgrade on ..." (they changed how they scrape it,
# not the policy). Keeping the message so I can drop the second kind later.

import re
import sqlite3
import subprocess
import sys
from pathlib import Path

DOCS = ["Privacy Policy", "Terms of Service"]


def git(repo, *args):
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True, check=True).stdout


def split_sentences(text):
    # markdown -> plain-ish text, then a simple sentence split.
    # not perfect (abbreviations like "e.g." get split) but good enough for keyword work
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)      # [link text](url) -> link text
    text = re.sub(r"[#*_>`|]", " ", text)
    out = []
    for block in re.split(r"\n\s*\n", text):
        block = " ".join(block.split())
        if not block:
            continue
        for s in re.split(r"(?<=[.!?])\s+(?=[A-Z\"“(])", block):
            if len(s) > 3:
                out.append(s)
    return out


def main(repo):
    db = sqlite3.connect("fineprint.db")
    db.executescript("""
        drop table if exists versions;
        drop table if exists sentences;
        create table versions (id integer primary key, platform text, doc text, commit_hash text,
                               date text, message text, text text, n_words integer);
        create table sentences (version_id integer, pos integer, n_total integer, sentence text);
    """)

    platforms = sorted(p.name for p in Path(repo).iterdir() if p.is_dir() and not p.name.startswith("."))
    for platform in platforms:
        for doc in DOCS:
            path = f"{platform}/{doc}.md"
            if not (Path(repo) / path).exists():
                continue
            log = git(repo, "log", "--reverse", "--format=%H|%aI|%s", "--", path).strip().splitlines()
            for line in log:
                h, date, msg = line.split("|", 2)
                try:
                    text = git(repo, "show", f"{h}:{path}")
                except subprocess.CalledProcessError:
                    continue   # file deleted in this commit
                cur = db.execute("insert into versions (platform, doc, commit_hash, date, message, text, n_words) values (?,?,?,?,?,?,?)",
                                 (platform, doc, h, date[:10], msg, text, len(text.split())))
                sents = split_sentences(text)
                db.executemany("insert into sentences values (?,?,?,?)",
                               [(cur.lastrowid, i, len(sents), s) for i, s in enumerate(sents)])
            print(f"{platform:12} {doc:17} {len(log)} versions")
    db.commit()
    n = db.execute("select count(*) from versions").fetchone()[0]
    print("total versions:", n)


if __name__ == "__main__":
    main(sys.argv[1])
