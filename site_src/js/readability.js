Promise.all([load("readability"), load("meta")]).then(([r, m]) => {
  const Q = r.quarters;
  document.getElementById("w0").textContent = Q[0].words_total.toLocaleString();
  document.getElementById("w1").textContent = Q[Q.length - 1].words_total.toLocaleString();
  document.getElementById("hours").textContent = Math.round(r.hours_to_read_all);
  lineChart(document.getElementById("total"), { x: Q.map(q => q.q), series: [{ name: "total words", values: Q.map(q => q.words_total / 1000), strong: true }], label: "total words in force (thousands)", height: 200 });
  lineChart(document.getElementById("median"), { x: Q.map(q => q.q), series: [{ name: "median document", values: Q.map(q => q.words_median / 1000) }], label: "median words per document (thousands)", height: 180 });
  lineChart(document.getElementById("ease"), { x: Q.map(q => q.q), series: [{ name: "reading ease", values: Q.map(q => q.ease), strong: true }], yMax: 60, label: "reading ease by quarter", height: 200 });

  // spaghetti: one line per platform, time on x
  const draw = doc => {
    const L = r.length.filter(l => l.doc === doc), W = 660, H = 340, l = 46, rr = 40, t = 12, b = 26;
    const t0 = +new Date("2022-07-01"), t1 = +new Date("2026-11-30");
    const X = d => l + (+new Date(d + "T00:00:00") - t0) / (t1 - t0) * (W - l - rr);
    const max = Math.max(...L.flatMap(s => s.points.map(p => p[1]))) * 1.05;
    const Y = v => t + (1 - v / max) * (H - t - b);
    const growth = s => s.points[s.points.length - 1][1] / s.points[0][1];
    const top = L.slice().sort((a, b) => growth(b) - growth(a)).slice(0, 3).map(s => s.code);
    let s = "";
    for (let k = 0; k <= 4; k++) { const v = max * k / 4; s += `<line x1="${l}" x2="${W - rr}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C("--line")}"/><text x="${l - 6}" y="${Y(v) + 4}" font-size="11" text-anchor="end" fill="${C("--muted")}">${Math.round(v / 1000)}k</text>`; }
    for (let y = 2023; y <= 2026; y++) s += `<text x="${X(y + "-01-01")}" y="${H - 7}" font-size="11" text-anchor="middle" fill="${C("--muted")}">${y}</text>`;
    L.forEach(se => {
      const hot = top.includes(se.code), pts = se.points.map(p => `${X(p[0])},${Y(p[1])}`);
      s += `<path d="M${pts.join("L")}" fill="none" stroke="${hot ? C("--accent") : C("--muted")}" stroke-width="${hot ? 2.2 : 1}" opacity="${hot ? 1 : 0.45}" stroke-linejoin="round"><title>${se.code}</title></path>`;
      if (hot) { const p = se.points[se.points.length - 1]; s += `<text x="${X(p[0]) + 5}" y="${Y(p[1]) + 4}" font-size="12" font-weight="600" fill="${C("--accent")}">${se.code}</text>`; }
    });
    document.getElementById("spaghetti").innerHTML = svgEl(W, H, s, `${doc} length over time`);
    const big = L.slice().sort((a, b) => growth(b) - growth(a))[0];
    document.getElementById("spagNote").textContent = `Words per document at each revision. Highlighted: the three that grew the most. ${big.code}'s went from ${big.points[0][1].toLocaleString()} to ${big.points[big.points.length - 1][1].toLocaleString()} words.`;
  };
  document.querySelectorAll("#docPick button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("#docPick button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); draw(b.dataset.doc);
  }));
  draw("Privacy Policy");
});

// the paper trail: first and latest quarter as physical stacks
load("readability").then(r => {
  const Q = r.quarters, a = Q[0], b = Q[Q.length - 1], per = 5000;
  const stack = (q, n) => `<div class="stack"><div class="cap">${q.q.replace("Q", " Q")}<br>${q.words_total.toLocaleString()} words</div>${"<div class=\"sheet\"></div>".repeat(n)}</div>`;
  const el = document.getElementById("stacks");
  const na = Math.round(a.words_total / per), nb = Math.round(b.words_total / per);
  el.innerHTML = stack(a, 0) + stack(b, 0);
  const [sa, sb] = el.querySelectorAll(".stack");
  let k = 0;
  const io = new IntersectionObserver(es => { if (!es[0].isIntersecting) return; io.disconnect();
    const drop = () => { if (k < na) sa.insertAdjacentHTML("beforeend", '<div class="sheet"></div>'); if (k < nb) sb.insertAdjacentHTML("beforeend", '<div class="sheet"></div>');
      if (k % 6 === 0) noir.fx.paper(); if (++k < nb) setTimeout(drop, 28); };
    drop(); }, { threshold: 0.4 });
  io.observe(el);
});
