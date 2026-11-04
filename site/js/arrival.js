load("arrival").then(d => {
  const A = d.arrival, W = 660, row = 28, top = 30, left = 168, right = 12, H = top + A.length * row + 10;
  const t0 = +new Date("2022-06-01"), t1 = +new Date("2026-11-30");
  const x = s => left + (+new Date(s + "T00:00:00") - t0) / (t1 - t0) * (W - left - right);
  let s = "";
  for (let y = 2023; y <= 2026; y++) {
    s += `<line x1="${x(y + "-01-01")}" x2="${x(y + "-01-01")}" y1="${top - 12}" y2="${H - 4}" stroke="${C("--line")}"/>` +
         `<text x="${x(y + "-01-01") + 4}" y="${top - 16}" font-size="11" fill="${C("--muted")}">${y}</text>`;
  }
  A.forEach((a, i) => {
    const y = top + i * row + 8;
    s += `<text x="${left - 12}" y="${y + 4}" font-size="13" text-anchor="end" fill="${C("--text")}"><tspan font-weight="600">${a.code}</tspan> <tspan fill="${C("--muted")}">${esc(a.category)}</tspan></text>` +
         `<line x1="${x(a.tracked)}" x2="${W - right}" y1="${y}" y2="${y}" stroke="${C("--line")}" stroke-width="2"/>` +
         `<g class="dot" data-i="${i}" tabindex="0" role="button" aria-label="Platform ${a.code}, ${fmtDate(a.date)}" style="cursor:pointer">` +
         `<circle cx="${x(a.date)}" cy="${y}" r="6.5" fill="${a.present_at_start ? C("--bg") : C("--accent")}" stroke="${C("--accent")}" stroke-width="2"/></g>`;
  });
  document.getElementById("timeline").innerHTML = svgEl(W, H, s, "Timeline of when each platform first added AI training language");
  const show = i => {
    const a = A[i];
    document.querySelectorAll(".dot circle").forEach((c, j) => c.setAttribute("stroke-width", j === i ? 4 : 2));
    document.getElementById("reader").innerHTML = `${esc(a.text)}<small>Platform ${a.code} (${esc(a.category)}), ${a.doc.toLowerCase()}, first saved ${fmtDate(a.date)}${a.present_at_start ? ", already there when tracking began" : ""}</small>`;
  };
  document.querySelectorAll(".dot").forEach(g => {
    g.addEventListener("click", () => show(+g.dataset.i));
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(+g.dataset.i); } });
  });
  show(0);

  const G = d.growth;
  lineChart(document.getElementById("growth"), { x: G.map(g => g.q), series: [
    { name: "any AI mention", values: G.map(g => g.ai_per_10k), strong: true },
    { name: "training clauses", values: G.map(g => g.train_per_10k) } ], label: "AI sentences per 10,000 words by quarter" });
  const avg = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
  const first = avg(G.slice(0, 4).map(g => g.ai_per_10k)), last = avg(G.slice(-4).map(g => g.ai_per_10k));
  document.getElementById("growthText").textContent =
    `Averaged over the first four quarters of data, the documents in force had ${first.toFixed(1)} AI sentences per 10,000 words. Over the latest four, ${last.toFixed(1)}: about ${Math.round(last / first)} times as many. ` +
    `The steepest climb came in 2025, and the rate has eased slightly since early 2026.`;
  const N = d.never;
  document.getElementById("never").textContent = `${N.length} platforms had no training clause in their tracked documents: ` +
    N.map(n => `${n.code} (${n.category}${n.tracked > "2025-01-01" ? ", tracked only since " + fmtDate(n.tracked) : ""})`).join(", ") +
    `. Several are messaging apps, and a few have only been tracked for a short time, so "none found" isn't the same as "never will."`;
});

// the lineup: one card per platform, confession on the back
Promise.all([load("arrival"), load("meta")]).then(([d, m]) => {
  const byCode = Object.fromEntries(d.arrival.map(a => [a.code, a]));
  const all = [...d.arrival.map(a => ({ code: a.code, category: a.category })), ...d.never].sort((a, b) => a.code.localeCompare(b.code));
  const el = document.getElementById("lineup");
  el.innerHTML = all.map(p => {
    const a = byCode[p.code];
    return `<div class="suspect" tabindex="0" role="button" aria-label="Platform ${p.code}, ${esc(p.category)}${a ? ", confessed " + fmtDate(a.date) : ", no confession"}"><div class="inner">` +
      `<div class="face"><span class="letter">${p.code}</span><span class="cat">${esc(p.category)}</span>` +
      (a ? `<span class="stamp">confessed ${a.date.slice(0, 7)}</span>` : `<span class="stamp none">no confession</span>`) + `</div>` +
      `<div class="back">${a ? `<b>${a.doc}, ${fmtDate(a.date)}</b>${noir.redact(esc(a.text))}` : `<b>No training clause found</b>Nothing in the tracked privacy policy or terms says posts are used to train AI.`}</div></div></div>`;
  }).join("");
  el.querySelectorAll(".suspect").forEach(c => {
    const flip = () => { c.classList.toggle("flipped"); noir.fx.paper(); };
    c.addEventListener("click", flip);
    c.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
  });
});
