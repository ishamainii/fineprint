Promise.all([load("hedging"), load("meta")]).then(([h, m]) => {
  barChart(document.getElementById("overall"), [
    { label: "Training clauses", value: h.clause_rate },
    { label: "Everything else", value: h.other_rate, color: C("--muted") }], { max: 5, fmt: v => `${v} per 100 words`, label: "hedge words per 100 words" });
  document.getElementById("overallNote").textContent =
    `${h.n_clauses} training clauses against ${h.n_other.toLocaleString()} other sentences. That's ${(h.clause_rate / h.other_rate).toFixed(1)} times the hedging.`;

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
  const base = 2.19, maxRate = 15;
  const box = document.getElementById("suspects");
  box.innerHTML = d.arrival.map((a, i) => `<button data-i="${i}">Platform ${a.code}</button>`).join("");
  const ask = i => {
    const a = d.arrival[i], words = a.text.split(/\s+/).length;
    const hits = (a.text.match(rx) || []).length, rate = hits / words * 100;
    box.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-pressed", String(j === i)));
    const st = document.getElementById("statement");
    st.innerHTML = noir.redact(esc(a.text).replace(rx, '<span class="ev">$1</span>')) + `<small style="display:block;font-family:var(--type);font-size:12.5px;margin-top:8px">Platform ${a.code}, ${esc(a.category)}, ${a.doc.toLowerCase()}</small>`;
    const evs = [...st.querySelectorAll(".ev")];
    evs.forEach((e, k) => setTimeout(() => { e.classList.add("lit"); noir.fx.beep(k / evs.length); }, 350 + k * 260));
    const m = document.getElementById("meter");
    m.querySelector("i").style.width = `${Math.min(100, rate / maxRate * 100)}%`;
    m.style.backgroundImage = `linear-gradient(90deg, transparent calc(${base / maxRate * 100}% - 1px), var(--ink) 0 calc(${base / maxRate * 100}% + 1px), transparent 0)`;
    document.getElementById("meterNote").textContent = `${hits} evasion${hits === 1 ? "" : "s"} in ${words} words: ${rate.toFixed(1)} per 100, against ${base} for the rest of the policy.`;
  };
  box.querySelectorAll("button").forEach(b => b.addEventListener("click", () => ask(+b.dataset.i)));
  ask(1);
});
