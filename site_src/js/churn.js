load("churn").then(c => {
  const set = (id, v) => document.getElementById(id).textContent = v;
  set("n", c.n.toLocaleString()); set("med", c.size_quantiles.median); set("p90", c.size_quantiles.p90); set("max", c.size_quantiles.max.toLocaleString());

  // stacked columns: all revisions, AI-touching part in accent
  const P = c.per_q, W = 660, H = 220, l = 34, t = 10, b = 26, bw = (W - l - 8) / P.length, max = Math.max(...P.map(p => p.revisions)) * 1.1;
  let s = "";
  for (let k = 0; k <= 4; k++) { const v = max * k / 4, y = H - b - v / max * (H - t - b); s += `<line x1="${l}" x2="${W - 8}" y1="${y}" y2="${y}" stroke="${C("--line")}"/><text x="${l - 6}" y="${y + 4}" font-size="11" text-anchor="end" fill="${C("--muted")}">${Math.round(v)}</text>`; }
  P.forEach((p, i) => {
    const x = l + i * bw + 2, hAll = p.revisions / max * (H - t - b), hAi = p.ai / max * (H - t - b);
    s += `<rect x="${x}" y="${H - b - hAll}" width="${bw - 4}" height="${hAll}" fill="${C("--muted")}" opacity=".45"><title>${p.q}: ${p.revisions} revisions</title></rect>` +
         `<rect x="${x}" y="${H - b - hAi}" width="${bw - 4}" height="${hAi}" fill="${C("--accent")}"><title>${p.q}: ${p.ai} touched AI</title></rect>`;
    if (p.q.endsWith("Q1")) s += `<text x="${x + bw / 2}" y="${H - 8}" font-size="11" text-anchor="middle" fill="${C("--muted")}">${p.q.slice(0, 4)}</text>`;
  });
  document.getElementById("perq").innerHTML = svgEl(W, H, s, "revisions per quarter");

  const early = P.slice(0, 6).reduce((a, p) => [a[0] + p.ai, a[1] + p.revisions], [0, 0]);
  const late = P.slice(-6).reduce((a, p) => [a[0] + p.ai, a[1] + p.revisions], [0, 0]);
  set("aiText", `Overall, ${Math.round(c.ai_share * 100)}% of revisions touched AI language. In the first year and a half of data that share was ${Math.round(100 * early[0] / Math.max(1, early[1]))}%; in the last year and a half it was ${Math.round(100 * late[0] / Math.max(1, late[1]))}%.`);

  const labels = c.size_hist.map((_, i) => [1, 10, 100, 1000].includes(Math.round(10 ** (i / 4))) && i % 4 === 0 ? String(Math.round(10 ** (i / 4))) : "");
  columns(document.getElementById("size"), c.size_hist, labels, { label: "revision size distribution", height: 190 });
  barChart(document.getElementById("who"), c.per_platform.slice(0, 15).map(p => ({ label: `Platform ${p.code}`, value: p.n })), { fmt: v => `${v}`, label: "revisions per platform" });
});

// the stakeout log
load("churn").then(c => {
  const el = document.getElementById("log");
  el.innerHTML = c.per_q.map(q => `<div${q.ai ? ' style="text-decoration:underline;text-decoration-color:var(--red)"' : ""}>${q.q.replace("Q", " Q")} .. ${String(q.revisions).padStart(3, " ")} edits observed${q.ai ? `, ${q.ai} touched AI` : ", nothing on AI"}</div>`).join("");
});
