# classify.py
# Finds the AI sentences in every policy version and tags them.
#   train   = says data/content is used to train or fine-tune AI / ML models
#   ai      = mentions AI or machine learning but not training
# Plus a few language measures for each AI sentence: hedge words, opt-out wording,
# reading ease, and how far into the document it sits.
#
# I kept the patterns strict on purpose (a training verb AND an AI word in the same
# sentence) so false positives are rare. The cost is some misses where the two are split
# across sentences. I hand-checked the first training sentence for every platform (see check.md).

import re
import sqlite3
import pandas as pd

AI = re.compile(r"artificial intelligence|\bA\.?I\.?\b(?!-?\s*(?:supported)\b)|generative|machine[- ]learning|"
                r"large language model|\bLLMs?\b|neural network|\bAI[- ](?:model|feature|tool|system)", re.I)
TRAIN = re.compile(r"\b(?:train(?:s|ed|ing)?|fine[- ]?tun\w*)\b", re.I)
MODEL = re.compile(r"\bmodels?\b", re.I)
OPTOUT = re.compile(r"opt[- ]?out|\bobject\b|right to object|turn (?:it )?off|withdraw|settings?\b", re.I)
HEDGES = ["may", "might", "could", "can", "such as", "including", "for example", "e.g.", "among other",
          "from time to time", "as appropriate", "where permitted", "to improve", "to develop", "certain"]
HEDGE = re.compile(r"\b(" + "|".join(re.escape(h) for h in HEDGES) + r")\b", re.I)


def syllables(word):
    word = word.lower().strip(".,;:()\"'")
    groups = re.findall(r"[aeiouy]+", word)
    n = len(groups) - (1 if word.endswith("e") and len(groups) > 1 else 0)
    return max(1, n)


def reading_ease(s):
    # Flesch reading ease. 60-70 = plain English, under 30 = very hard (college grad level)
    words = re.findall(r"[A-Za-z']+", s)
    if not words:
        return None
    syl = sum(syllables(w) for w in words)
    return 206.835 - 1.015 * len(words) - 84.6 * syl / len(words)    # one sentence, so words/sentence = len(words)


def kind(s):
    if not AI.search(s):
        return None
    if TRAIN.search(s):
        return "train"
    return "ai"


def main():
    db = sqlite3.connect("fineprint.db")
    rows = db.execute("""select v.id, v.platform, v.doc, v.date, v.commit_hash, v.message, s.pos, s.n_total, s.sentence
                         from sentences s join versions v on v.id = s.version_id""")
    out = []
    for vid, platform, doc, date, h, msg, pos, n, s in rows:
        k = kind(s)
        if k:
            out.append(dict(version_id=vid, platform=platform, doc=doc, date=date, commit_hash=h, pos=pos, n_total=n,
                            depth=pos / max(1, n - 1), sentence=s, kind=k,
                            hedges=len(HEDGE.findall(s)), words=len(s.split()),
                            optout=bool(OPTOUT.search(s)), ease=reading_ease(s)))
    ai = pd.DataFrame(out)
    ai.to_sql("ai_sentences", db, if_exists="replace", index=False)
    print(ai.groupby("kind").size())
    print(ai.groupby("platform")["kind"].value_counts().unstack(fill_value=0).tail(30))


if __name__ == "__main__":
    main()
