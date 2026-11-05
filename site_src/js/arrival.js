load("arrival").then(d => {
  const A = d.arrival, W = 660, row = 28, top = 30, left = 110, right = 12, H = top + A.length * row + 10;
  const t0 = +new Date("2022-06-01"), t1 = +new Date("2026-11-30");
  const x = s => left + (+new Date(s + "T00:00:00") - t0) / (t1 - t0) * (W - left - right);
  let s = "";
  for (let y = 2023; y <= 2026; y++) {
    s += `<line x1="${x(y + "-01-01")}" x2="${x(y + "-01-01")}" y1="${top - 12}" y2="${H - 4}" stroke="${C("--line")}"/>` +
         `<text x="${x(y + "-01-01") + 4}" y="${top - 16}" font-size="11" fill="${C("--muted")}">${y}</text>`;
  }
  A.forEach((a, i) => {
    const y = top + i * row + 8;
    s += `<text x="${left - 12}" y="${y + 4}" font-size="13" text-anchor="end" fill="${C("--text")}"><tspan font-weight="600">${a.code}</tspan></text>` +
         `<line x1="${x(a.tracked)}" x2="${W - right}" y1="${y}" y2="${y}" stroke="${C("--line")}" stroke-width="2"/>` +
         `<g class="dot" data-i="${i}" tabindex="0" role="button" aria-label="${a.code}, ${fmtDate(a.date)}" style="cursor:pointer">` +
         `<circle cx="${x(a.date)}" cy="${y}" r="6.5" fill="${a.present_at_start ? C("--bg") : C("--accent")}" stroke="${C("--accent")}" stroke-width="2"/></g>`;
  });
  document.getElementById("timeline").innerHTML = svgEl(W, H, s, "Timeline of when each platform first added AI training language");
  const show = i => {
    const a = A[i];
    document.querySelectorAll(".dot circle").forEach((c, j) => c.setAttribute("stroke-width", j === i ? 4 : 2));
    document.getElementById("reader").innerHTML = `${esc(a.text)}<small>${a.code} (${esc(a.category)}), ${a.doc.toLowerCase()}, first saved ${fmtDate(a.date)}${a.present_at_start ? ", already there when tracking began" : ""}</small>`;
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
  const N = d.never;
  document.getElementById("never").textContent = `${N.length} platforms have no training clause in their tracked documents: ` +
    N.map(n => `${n.code} (${n.category}${n.tracked > "2025-01-01" ? ", tracked only since " + fmtDate(n.tracked) : ""})`).join(", ") +
    `. Several are messaging apps, and a few have only been tracked for a short time, so "none found" isn't the same as "never will."`;
});

// the dossiers: one card per platform, the clause on the back
const NOTE = {
  Instagram: "The first matching sentence is a notice that Meta was delaying, after feedback from regulators, the change that would use this information to develop AI.",
  Moltbook: "Already present on the first day the archive watched this platform, so the clause is older than this date.",
  Facebook: "Meta announced AI training in separate notices earlier; this is when the wording reached the tracked privacy policy.",
};
// a fingerprint-like glyph per platform: concentric arcs whose gaps come from the name's letters
const glyph = name => { let h = 0, out = ""; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  for (let r = 8; r <= 62; r += 6) { const a0 = (h >> (r % 13)) % 360, len = 200 + ((h >> (r % 7)) % 140);
    const p = a => [70 + r * Math.cos(a * Math.PI / 180), 70 + r * Math.sin(a * Math.PI / 180)].map(v => v.toFixed(1)).join(" ");
    out += `<path d="M${p(a0)} A${r} ${r} 0 ${len > 180 ? 1 : 0} 1 ${p(a0 + len)}" fill="none" stroke="currentColor" stroke-width="1.6"/>`; }
  return `<svg class="glyph" width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">${out}</svg>`; };
Promise.all([load("arrival")]).then(([d]) => {
  const byCode = Object.fromEntries(d.arrival.map(a => [a.code, a]));
  const all = [...d.arrival.map(a => ({ code: a.code, category: a.category, tracked: a.tracked })), ...d.never]
    .sort((a, b) => (byCode[a.code]?.date ?? "9") < (byCode[b.code]?.date ?? "9") ? -1 : (byCode[a.code]?.date ?? "9") > (byCode[b.code]?.date ?? "9") ? 1 : a.code.localeCompare(b.code));
  const el = document.getElementById("lineup");
  el.innerHTML = all.map(p => {
    const a = byCode[p.code];
    return `<div class="suspect${a ? "" : " clean"}" tabindex="0" role="button" aria-label="${esc(p.code)}, ${esc(p.category)}${a ? ", training clause first saved " + fmtDate(a.date) : ", no training clause found"}"><div class="inner">` +
      `<div class="face">${glyph(p.code)}<div><span class="cat">${esc(p.category)}</span><div class="letter">${esc(p.code)}</div></div>` +
      `<div class="when">${a ? `<b>${fmtDate(a.date)}</b>${a.present_at_start ? "on record from day one" : "first training clause"}` : `<b>none found</b>watched since ${fmtDate(p.tracked)}`}</div></div>` +
      `<div class="back">${a ? `<b>${esc(a.doc)}, ${fmtDate(a.date)}</b>“${esc(a.text)}”${NOTE[p.code] ? `<p class="small" style="margin-top:10px;color:var(--bone-dim)">${NOTE[p.code]}</p>` : ""}`
        : `<b>No training clause found</b>Nothing in the tracked privacy policy or terms of service says posts or personal data are used to train AI.`}</div></div></div>`;
  }).join("");
  el.querySelectorAll(".suspect").forEach(c => {
    const flip = () => { c.classList.toggle("flipped"); noir.fx.paper(); };
    c.addEventListener("click", flip);
    c.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
  });

  // the night-of timeline: every first clause on one line
  const t0 = +new Date("2022-07-01"), t1 = +new Date("2026-11-30"), X = s => ((+new Date(s) - t0) / (t1 - t0) * 100).toFixed(2) + "%";
  document.getElementById("night").innerHTML = `<div class="track">` +
    [2023, 2024, 2025, 2026].map(y => `<span class="yr" style="left:${X(y + "-01-01")}">${y}</span>`).join("") +
    (() => { const lvl = [], last = [];                       // stack labels that would collide onto higher levels
      return d.arrival.map(a => { const x = (+new Date(a.date) - t0) / (t1 - t0), w = (a.code.length * 7 + 14) / 900;
        let k = 0; while (last[k] != null && x - last[k] < w) k++; last[k] = x;
        return `<span class="ev" style="left:${X(a.date)}" title="${esc(a.code)}, ${fmtDate(a.date)}"><span>${esc(a.code)}</span><em style="height:${8 + k * 22}px"></em><i></i></span>`; }).join(""); })() + `</div>`;
});
