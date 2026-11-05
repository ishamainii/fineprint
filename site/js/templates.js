load("templates").then(t => {
  const pairHtml = p => `<div class="quote"><b>${p.a}</b> and <b>${p.b}</b>, similarity ${p.sim}<br><br>${esc(p.ta)}<br><br><span style="color:var(--muted)">${esc(p.tb)}</span></div>`;
  heatmap(document.getElementById("heat"), t.codes, t.matrix, { label: "similarity between platforms' AI sentences",
    onPick: (a, b) => {
      const i = t.codes.indexOf(a), j = t.codes.indexOf(b), p = t.pairs.find(p => (p.a === a && p.b === b) || (p.a === b && p.b === a));
      document.getElementById("pick").innerHTML = p ? pairHtml(p)
        : `<p class="byline">${a} and ${b}: their closest pair of AI sentences scores ${t.matrix[i][j]}, below the 0.5 line.</p>`;
    } });
  const vals = t.matrix.flatMap((r, i) => r.filter((v, j) => v != null && j > i));
  const median = vals.slice().sort((a, b) => a - b)[Math.floor(vals.length / 2)];
  const exact = t.pairs.filter(p => p.sim >= 0.95), near = t.pairs.filter(p => p.sim < 0.95);
  document.getElementById("pairsIntro").textContent =
    `Across ${vals.length} pairs of platforms, the typical closest match scores just ${median.toFixed(2)}. Only ${t.pairs.length} pairs of platforms have any sentences above 0.5. ` +
    (exact.length ? `${exact.map(p => `${p.a} and ${p.b}`).join(", ")} share an owner and reuse whole passages word for word, which accounts for most of the ${t.n_pairs.toLocaleString()} matching sentence pairs. ` : "") +
    (near.length ? `The only other pair over the line, ${near.map(p => `${p.a} and ${p.b}`).join(", ")}, scores ${near.map(p => p.sim).join(", ")}, sharing a phrase rather than a sentence.` : "");
  document.getElementById("pairs").innerHTML = t.pairs.map(pairHtml).join("");
});
