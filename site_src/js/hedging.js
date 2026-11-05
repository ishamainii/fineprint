Promise.all([load("hedging"), load("meta")]).then(([h, m]) => {
  barChart(document.getElementById("overall"), [
    { label: "Training clauses", value: h.clause_rate },
    { label: "Everything else", value: h.other_rate, color: C("--muted") }], { max: 5, fmt: v => `${v} per 100 words`, label: "hedge words per 100 words" });
  document.getElementById("overallNote").textContent =
    `Pooled across platforms instead of paired: ${h.n_clauses} training clauses against ${h.n_other.toLocaleString()} other sentences, ${(h.clause_rate / h.other_rate).toFixed(1)} times the hedging. The paired test above is the one to trust; this is shown because it's the number most people would compute first.`;

  const rows = h.per_word.slice(0, 9), W = 640, row = 36, l = 140, max = Math.max(...rows.flatMap(r => [r.clauses, r.other]));
  let s = "";
  rows.forEach((r, i) => {
    const y = i * row, w = v => v / max * (W - l - 50);
    s += `<text x="${l - 10}" y="${y + 18}" font-size="13" text-anchor="end" fill="${C("--text")}">${esc(r.word)}</text>` +
         `<rect x="${l}" y="${y + 4}" width="${w(r.clauses)}" height="12" fill="${C("--accent")}"/><text x="${l + w(r.clauses) + 5}" y="${y + 14}" font-size="11" fill="${C("--muted")}">${r.clauses}</text>` +
         `<rect x="${l}" y="${y + 18}" width="${w(r.other)}" height="12" fill="${C("--muted")}" opacity=".6"/><text x="${l + w(r.other) + 5}" y="${y + 28}" font-size="11" fill="${C("--muted")}">${r.other}</text>`;
  });
  document.getElementById("perword").innerHTML = svgEl(W, rows.length * row + 4, s, "hedge words compared");

  const M = h.modal;
  lineChart(document.getElementById("modal"), { x: M.map(r => r.q), series: [
    { name: "may-type, all", values: M.map(r => r.may_all), color: C("--text") },
    { name: "will-type, all", values: M.map(r => r.will_all), color: C("--muted") },
    { name: "may-type, AI", values: M.map(r => r.may_ai), strong: true },
    { name: "will-type, AI", values: M.map(r => r.will_ai), color: C("--accent") } ], label: "modal verbs over time" });
});

// the interrogation: each confessed platform's clause, read back with the hedges lit
load("arrival").then(d => {
  const HEDGE = ["from time to time", "as appropriate", "where permitted", "for example", "among other", "such as", "including", "to improve", "to develop", "certain", "might", "could", "may", "can"];
  const rx = new RegExp(`\\b(${HEDGE.join("|")})\\b`, "gi");
  const maxRate = 15;
  const box = document.getElementById("suspects");
  box.innerHTML = d.arrival.map((a, i) => `<button data-i="${i}">${a.code}</button>`).join("");
  const ask = i => {
    const a = d.arrival[i], words = a.text.split(/\s+/).length;
    const hits = (a.text.match(rx) || []).length, rate = hits / words * 100, base = PAIRS[a.code]?.other ?? 2.19;
    box.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-pressed", String(j === i)));
    const st = document.getElementById("statement");
    st.innerHTML = noir.redact(esc(a.text).replace(rx, '<span class="ev">$1</span>')) + `<small style="display:block;font-family:var(--mono);font-size:12.5px;margin-top:8px">${a.code}, ${esc(a.category)}, ${a.doc.toLowerCase()}</small>`;
    const evs = [...st.querySelectorAll(".ev")];
    evs.forEach((e, k) => setTimeout(() => { e.classList.add("lit"); noir.fx.beep(k / evs.length); }, 350 + k * 260));
    const m = document.getElementById("meter");
    m.querySelector("i").style.width = `${Math.min(100, rate / maxRate * 100)}%`;
    m.style.backgroundImage = `linear-gradient(90deg, transparent calc(${base / maxRate * 100}% - 1px), var(--bone) 0 calc(${base / maxRate * 100}% + 1px), transparent 0)`;
    document.getElementById("meterNote").textContent = `${hits} hedge${hits === 1 ? "" : "s"} in ${words} words: ${rate.toFixed(1)} per 100, against ` + (PAIRS[a.code] ? `${base} in ${a.code}'s own other sentences.` : `${base} across all current policies (this exact clause is no longer in ${a.code}'s current documents).`);
  };
  box.querySelectorAll("button").forEach(b => b.addEventListener("click", () => ask(+b.dataset.i)));
  ask(1);
});

// the paired comparison: one row per platform, its own sentences against its clauses
let PAIRS = {};
load("stats").then(S => {
  const P = S.hedging.pairs.slice().sort((a, b) => (b.clause - b.other) - (a.clause - a.other)), W = 660, row = 26, l = 120, max = Math.max(...P.flatMap(p => [p.clause, p.other])) * 1.08;
  const x = v => l + v / max * (W - l - 50);
  let s = "";
  [0, 2, 4, 6, 8, 10].filter(v => v < max).forEach(v => { s += `<line x1="${x(v)}" x2="${x(v)}" y1="0" y2="${P.length * row}" stroke="${C("--line")}"/><text x="${x(v)}" y="${P.length * row + 14}" font-size="11" text-anchor="middle" fill="${C("--muted")}">${v}</text>`; });
  P.forEach((p, i) => {
    const y = i * row + 13, up = p.clause > p.other;
    PAIRS[p.platform] = p;
    s += `<text x="${l - 10}" y="${y + 4}" font-size="12.5" text-anchor="end" fill="${C("--text")}">${esc(p.platform)}</text>` +
         `<line x1="${x(p.other)}" x2="${x(p.clause)}" y1="${y}" y2="${y}" stroke="${up ? C("--accent") : C("--muted")}" stroke-width="2" opacity=".8"/>` +
         `<circle cx="${x(p.other)}" cy="${y}" r="4.5" fill="${C("--muted")}"/><circle cx="${x(p.clause)}" cy="${y}" r="5.5" fill="${C("--accent")}"><title>${esc(p.platform)}: ${p.clause} vs ${p.other} per 100 words, ${p.n_clause} clause sentence(s)</title></circle>`;
  });
  document.getElementById("paired").innerHTML = svgEl(W, P.length * row + 20, s, "Hedges per 100 words in each platform's training clauses and in its other sentences");
  document.querySelector('#suspects button[aria-pressed="true"]')?.click();
});
