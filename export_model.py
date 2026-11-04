# export_model.py: trains the clause classifier on REDACTED text (company and product names
# replaced) so the model published with the site never contains a name, then exports it for the
# browser with its cross-validated scores.
import json
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, f1_score, precision_recall_curve, precision_score, recall_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import make_pipeline

from anon import NAMES, PRODUCTS, redact
from classify import kind

OUT = Path("build/data")
db = sqlite3.connect("fineprint.db")
AI = pd.read_sql("select sentence from ai_sentences", db)


def dump(name, obj):
    json.dump(obj, open(OUT / f"{name}.json", "w"), separators=(",", ":"), default=str)


# ---------------------------------------------------------------- 8. model lab
lab = pd.read_csv("labels.csv")
full = AI.drop_duplicates("sentence")
look = {s[:200]: s for s in full.sentence}
lab["raw"] = [look[s[:200]] for s in lab.sentence]
lab["text"] = lab.raw.map(redact)          # train on redacted text
y = lab.label.values
pipe = make_pipeline(TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True), LogisticRegression(C=4, class_weight="balanced", max_iter=2000))
proba = cross_val_predict(pipe, lab.text, y, cv=StratifiedKFold(5, shuffle=True, random_state=0), method="predict_proba")[:, 1]
prec, rec, thr = precision_recall_curve(y, proba)
rule = np.array([kind(s) == "train" for s in lab.raw]).astype(int)   # the rule never needed names either way
pipe.fit(lab.text, y)
tv, lr = pipe.named_steps["tfidfvectorizer"], pipe.named_steps["logisticregression"]
vocab = {t: [int(i), round(float(tv.idf_[i]), 4), round(float(lr.coef_[0][i]), 4)] for t, i in tv.vocabulary_.items()}
coef = lr.coef_[0]; fn = tv.get_feature_names_out()
clean_feat = [i for i in np.argsort(coef) if not any(n.lower() in fn[i] for n in NAMES + PRODUCTS)]
dump("model", {"vocab": vocab, "intercept": round(float(lr.intercept_[0]), 4),
               "pr": [[round(float(p), 3), round(float(r), 3), round(float(t), 3)] for p, r, t in zip(prec[:-1], rec[:-1], thr)],
               "proba": [[round(float(p), 3), int(t)] for p, t in zip(proba, y)],
               "rule_cm": confusion_matrix(y, rule).tolist(),
               "top_pos": [[fn[i], round(float(coef[i]), 2)] for i in clean_feat[::-1][:14]],
               "top_neg": [[fn[i], round(float(coef[i]), 2)] for i in clean_feat[:14]],
               "examples": [{"text": t[:300], "label": int(l), "p": round(float(p), 2)} for t, l, p in zip(lab.text, y, proba)],
               "scores": {"model_f1": round(f1_score(y, proba >= 0.5), 3), "model_p": round(precision_score(y, proba >= 0.5), 3), "model_r": round(recall_score(y, proba >= 0.5), 3),
                          "model_f1_repeats": [round(f1_score(y, cross_val_predict(pipe, lab.text, y, cv=StratifiedKFold(5, shuffle=True, random_state=k))), 3) for k in range(10)],
                          "rule_f1": round(f1_score(y, rule), 3), "rule_p": round(precision_score(y, rule), 3), "rule_r": round(recall_score(y, rule), 3)}})
print(json.dumps(json.load(open(OUT / "model.json"))["scores"]))
# (the letter -> platform key is deliberately not printed or saved)
