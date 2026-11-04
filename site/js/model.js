// the trained model, re-implemented exactly as scikit-learn computes it:
// lowercase -> tokens of 2+ word characters -> unigrams + bigrams -> tf = 1 + ln(count)
// -> times idf -> l2 normalise -> dot with the logistic-regression weights + intercept -> sigmoid
load("model").then(m => {
  const tokens = s => s.toLowerCase().match(/\b\w\w+\b/gu) || [];
  function score(text) {
    const t = tokens(text), grams = [...t, ...t.slice(1).map((w, i) => t[i] + " " + w)];
    const counts = {}; grams.forEach(g => { if (m.vocab[g]) counts[g] = (counts[g] || 0) + 1; });
    const feats = Object.entries(counts).map(([g, n]) => ({ g, w: (1 + Math.log(n)) * m.vocab[g][1], coef: m.vocab[g][2] }));
    const norm = Math.hypot(...feats.map(f => f.w)) || 1;
    let z = m.intercept; feats.forEach(f => { f.w /= norm; f.contrib = f.w * f.coef; z += f.contrib; });
    return { p: 1 / (1 + Math.exp(-z)), feats, known: feats.length, total: grams.length };
  }
  const input = document.getElementById("input"), out = document.getElementById("out");
  const run = () => {
    const r = score(input.value), pct = Math.round(r.p * 100);
    const top = r.feats.slice().sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib)).slice(0, 8);
    out.innerHTML = `<b style="font-family:var(--type);font-size:22px;color:${r.p >= 0.5 ? "var(--red)" : "var(--ink-soft)"}">${pct}% training clause</b>` +
      `<small>Pushing toward: ${top.filter(f => f.contrib > 0).map(f => `<ins>${esc(f.g)}</ins>`).join(", ") || "nothing"}. Pushing away: ${top.filter(f => f.contrib < 0).map(f => esc(f.g)).join(", ") || "nothing"}. ` +
      `${r.known} of ${r.total} words and word pairs are in the model's vocabulary.</small>`;
  };
  input.addEventListener("input", run); run();

  // the polygraph: the needle runs calm on plain sentences and jumps on training clauses
  const cv = document.getElementById("needle"), g = cv.getContext("2d"), trace = [];
  let level = 0, target = 0, t = 0, last = -1;
  const verdict = document.getElementById("verdict");
  const judge = () => {
    const p = score(input.value).p; target = p;
    const v = p >= +thr.value ? 1 : 0;
    if (v !== last) { verdict.textContent = v ? "training clause" : "cleared"; verdict.classList.remove("slam"); void verdict.offsetWidth; verdict.classList.add("slam"); noir.fx.stamp(); last = v; }
  };
  input.addEventListener("input", judge);
  const draw = () => {
    const w = cv.width = cv.clientWidth * devicePixelRatio, h = cv.height = 150 * devicePixelRatio;
    level += (target - level) * 0.05; t += 1;
    const amp = 6 + level * 52, y = h / 2 + (Math.sin(t * 0.21) * 0.6 + Math.sin(t * 0.53 + 1) * 0.3 + (Math.random() - 0.5) * (0.4 + level)) * amp * devicePixelRatio;
    trace.push(y); if (trace.length > w / (2 * devicePixelRatio)) trace.shift();
    g.clearRect(0, 0, w, h); g.strokeStyle = "rgba(34,29,23,.12)"; g.lineWidth = 1;
    for (let k = 0; k < h; k += 16 * devicePixelRatio) { g.beginPath(); g.moveTo(0, k); g.lineTo(w, k); g.stroke(); }
    g.strokeStyle = "#b0261d"; g.lineWidth = 1.6 * devicePixelRatio; g.beginPath();
    trace.forEach((v, i) => { const x = w - (trace.length - i) * 2 * devicePixelRatio; i ? g.lineTo(x, v) : g.moveTo(x, v); }); g.stroke();
    if (t % 9 === 0 && level > 0.5) noir.fx.beep(level);
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  const EX = ["We may use information you share publicly to develop and improve artificial intelligence models, such as large language models.",
    "You can ask our AI assistant to summarise a conversation.", "You may not use our services to train a machine learning model.",
    "We use machine learning to detect spam and keep our community safe.", "Our partners may use this information to improve their AI technology."];
  document.getElementById("examples").innerHTML = EX.map((e, i) => `<button data-i="${i}">Example ${i + 1}</button>`).join("");
  document.querySelectorAll("#examples button").forEach(b => b.addEventListener("click", () => { input.value = EX[+b.dataset.i]; run(); input.dispatchEvent(new Event("input")); }));

  // threshold explorer, from cross-validated probabilities
  const P = m.proba, rc = m.rule_cm;
  const ruleP = rc[1][1] / (rc[1][1] + rc[0][1]), ruleR = rc[1][1] / (rc[1][1] + rc[1][0]);
  const thr = document.getElementById("thr");
  const update = () => {
    const t = +thr.value; document.getElementById("thrV").textContent = t.toFixed(2);
    let tp = 0, fp = 0, fn = 0, tn = 0; P.forEach(([p, y]) => p >= t ? (y ? tp++ : fp++) : (y ? fn++ : tn++));
    const pr = tp / Math.max(1, tp + fp), re = tp / Math.max(1, tp + fn), f1 = 2 * pr * re / Math.max(1e-9, pr + re);
    document.getElementById("cm").innerHTML = `<tr><th></th><th class="num">labelled clause</th><th class="num">labelled not</th></tr>` +
      `<tr><th>model says clause</th><td class="num">${tp}</td><td class="num">${fp}</td></tr><tr><th>model says not</th><td class="num">${fn}</td><td class="num">${tn}</td></tr>` +
      `<tr><th>precision / recall / F1</th><td class="num" colspan="2">${pr.toFixed(2)} / ${re.toFixed(2)} / ${f1.toFixed(2)}</td></tr>` +
      `<tr><th>keyword rule</th><td class="num" colspan="2">${ruleP.toFixed(2)} / ${ruleR.toFixed(2)} / ${(2 * ruleP * ruleR / (ruleP + ruleR)).toFixed(2)}</td></tr>`;
    // pr curve
    const W = 420, H = 300, l = 40, b = 34, tt = 10, r = 12, X = v => l + v * (W - l - r), Y = v => tt + (1 - v) * (H - tt - b);
    let s = `<line x1="${l}" x2="${W - r}" y1="${Y(0)}" y2="${Y(0)}" stroke="${C("--line")}"/><line x1="${l}" x2="${l}" y1="${Y(0)}" y2="${Y(1)}" stroke="${C("--line")}"/>`;
    [0, 0.5, 1].forEach(v => { s += `<text x="${X(v)}" y="${H - 16}" font-size="11" text-anchor="middle" fill="${C("--muted")}">${v}</text><text x="${l - 6}" y="${Y(v) + 4}" font-size="11" text-anchor="end" fill="${C("--muted")}">${v}</text>`; });
    s += `<text x="${(W + l) / 2}" y="${H - 2}" font-size="12" text-anchor="middle" fill="${C("--muted")}">recall</text><text x="12" y="${(H - b) / 2}" font-size="12" fill="${C("--muted")}" transform="rotate(-90 12 ${(H - b) / 2})" text-anchor="middle">precision</text>`;
    s += `<path d="M${m.pr.map(([p, rr]) => `${X(rr)},${Y(p)}`).join("L")}" fill="none" stroke="${C("--accent")}" stroke-width="2"/>`;
    s += `<circle cx="${X(re)}" cy="${Y(pr)}" r="6" fill="${C("--accent")}"/><rect x="${X(ruleR) - 5}" y="${Y(ruleP) - 5}" width="10" height="10" fill="${C("--cut")}"/>`;
    document.getElementById("pr").innerHTML = svgEl(W, H, s, "precision recall curve");
  };
  thr.addEventListener("input", update); update();
  thr.addEventListener("input", judge); judge();

  const rows = [...m.top_pos.slice(0, 10).map(([g, w]) => ({ label: g, value: w })), ...m.top_neg.slice(0, 8).map(([g, w]) => ({ label: g, value: Math.abs(w), color: C("--cut"), note: "(away)" }))];
  barChart(document.getElementById("weights"), rows, { fmt: v => v.toFixed(2), label: "model weights" });

  const errs = m.examples.map(e => ({ ...e, gap: Math.abs(e.p - e.label) })).sort((a, b) => b.gap - a.gap).slice(0, 8);
  document.getElementById("errors").innerHTML = `<tr><th>sentence</th><th class="num">my label</th><th class="num">model</th></tr>` +
    errs.map(e => `<tr><td>${esc(e.text)}</td><td class="num">${e.label ? "clause" : "not"}</td><td class="num">${Math.round(e.p * 100)}%</td></tr>`).join("");
});
