# model.py
# Step C: can a model spot "we use your data to train AI" sentences better than my keyword rule?
#
# Ground truth = labels.csv, 133 unique AI sentences I labelled by hand (1 = the platform or a
# partner uses people's data to train / develop / improve AI or ML models, incl. legal basis or
# opt-out for it; 0 = everything else, e.g. AI features, rules for users, bans on scraping).
# The labels are mine, so the sample is in labels.csv for anyone to re-check.
#
# baseline: keyword rule from classify.py (AI word + "train"/"fine-tune" in the same sentence)
# model:    tf-idf on words + word pairs -> logistic regression, 5-fold stratified CV
#           (every prediction is made by a model that never saw that sentence)

import re
import sqlite3
import time

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, precision_score, recall_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import make_pipeline

from classify import kind

db = sqlite3.connect("fineprint.db")
full = pd.read_sql("select sentence from ai_sentences", db).drop_duplicates("sentence")
lab = pd.read_csv("labels.csv")
# labels.csv keeps a 260-char preview; match back to the full sentence
lookup = {s[:200]: s for s in full.sentence}
lab["text"] = [lookup[s[:200]] for s in lab.sentence]
y = lab.label.values


def report(name, pred):
    print(f"{name:28} precision {precision_score(y, pred):.2f}  recall {recall_score(y, pred):.2f}  F1 {f1_score(y, pred):.2f}")
    return f1_score(y, pred)


rule = np.array([kind(s) == "train" for s in lab.text]).astype(int)
f_rule = report("keyword rule", rule)

model = make_pipeline(TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True),
                      LogisticRegression(C=4, class_weight="balanced", max_iter=2000))
cv = StratifiedKFold(5, shuffle=True, random_state=0)
scores = []
for seed in range(10):      # repeat CV with different splits so one lucky split doesn't decide it
    cv = StratifiedKFold(5, shuffle=True, random_state=seed)
    scores.append(f1_score(y, cross_val_predict(model, lab.text, y, cv=cv)))
pred = cross_val_predict(model, lab.text, y, cv=StratifiedKFold(5, shuffle=True, random_state=0))
report("tf-idf + logistic (CV)", pred)
print(f"model F1 over 10 CV repeats: {np.mean(scores):.2f} ± {np.std(scores):.2f}")

missed = lab[(y == 1) & (rule == 0) & (pred == 1)]
print(f"\ntraining clauses the rule missed but the model caught: {len(missed)}")
for s in missed.text.head(4):
    print("  -", s[:150])

# what the model learned: the words that push hardest toward "training clause"
model.fit(lab.text, y)
vec, clf = model.named_steps["tfidfvectorizer"], model.named_steps["logisticregression"]
top = np.argsort(clf.coef_[0])[-12:][::-1]
print("\nstrongest signals:", ", ".join(vec.get_feature_names_out()[top]))

# speed: score every unique AI sentence
t = time.perf_counter(); p = model.predict(full.sentence); dt = time.perf_counter() - t
print(f"\nscored {len(full)} unique AI sentences in {dt*1000:.0f} ms; flagged {p.sum()} as training clauses (rule flagged {sum(kind(s)=='train' for s in full.sentence)})")
