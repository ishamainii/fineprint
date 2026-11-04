load("placement").then(p => {
  const labels = ["start", "", "", "", "middle", "", "", "", "", "end"];
  columns(document.getElementById("depth"), p.ai, labels, { label: "position of AI sentences in documents", height: 200 });
  document.getElementById("depthNote").textContent =
    `Bars: all ${p.ai.reduce((a, b) => a + b)} AI sentences in current documents, by position in tenths of the document. Median position ${p.median_ai}; for training clauses only, ${p.median_clause}.`;
  document.getElementById("medC").textContent = `${Math.round(p.median_clause * 100)}%`;
  barChart(document.getElementById("heads"), p.headings.slice(0, 10).map(h => ({ label: h.h.length > 46 ? h.h.slice(0, 44) + "…" : h.h, value: h.n })),
    { labelW: 330, fmt: v => `${v}`, label: "headings above AI sentences" });
});

// the dig: one column per document, marks at the depth of each AI sentence
load("placement").then(p => {
  const W = 640, H = 300, top = 22, bins = p.ai.length;     // already in tenths of the document
  const ha = p.ai, hc = p.clauses, mx = Math.max(...ha);
  const y = i => top + i / bins * (H - top - 10);
  let s = `<rect x="80" y="${top}" width="${W - 160}" height="${H - top - 10}" fill="#fffaf0" stroke="${C("--line")}"/>` +
    `<text x="72" y="${top + 10}" font-size="12" text-anchor="end" fill="${C("--muted")}">first line</text><text x="72" y="${H - 12}" font-size="12" text-anchor="end" fill="${C("--muted")}">last line</text>`;
  for (let i = 0; i < bins; i++) {
    const w = ha[i] / mx * (W - 180);
    s += `<rect class="dig" x="${W / 2 - w / 2}" y="${y(i)}" width="${w}" height="${(H - top - 10) / bins - 1}" fill="${C("--accent")}" opacity="0"/>`;
    if (hc[i]) s += `<rect class="dig" x="${W / 2 - hc[i] / mx * (W - 180) / 2}" y="${y(i)}" width="${hc[i] / mx * (W - 180)}" height="${(H - top - 10) / bins - 1}" fill="${C("--text")}" opacity="0"/>`;
  }
  s += `<line x1="80" x2="${W - 80}" y1="${y(p.median_ai * bins)}" y2="${y(p.median_ai * bins)}" stroke="${C("--text")}" stroke-dasharray="4 3"/><text x="${W - 76}" y="${y(p.median_ai * bins) + 4}" font-size="12" fill="${C("--text")}">median</text>`;
  const el = document.getElementById("digChart");
  el.innerHTML = svgEl(W, H, s, "Where AI sentences sit in the current documents, from the first line to the last");
  const io = new IntersectionObserver(es => { if (!es[0].isIntersecting) return; io.disconnect();
    el.querySelectorAll(".dig").forEach((r, i) => setTimeout(() => { r.setAttribute("opacity", "1"); if (i % 8 === 0) noir.fx.tick(); }, i * 30)); }, { threshold: 0.4 });
  io.observe(el);
});
