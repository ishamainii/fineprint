Promise.all([load("vocabulary"), load("meta")]).then(([v, m]) => {
  const Q = m.quarters;
  // small multiples: one panel per curated term, each with its own y scale
  const box = document.getElementById("multiples");
  Object.entries(v.terms).forEach(([term, vals]) => {
    const div = document.createElement("div");
    const ratio = (vals.slice(-4).reduce((a, b) => a + b) + 0.2) / (vals.slice(0, 4).reduce((a, b) => a + b) + 0.2);
    div.innerHTML = `<h3>${esc(term)}</h3><div class="chart"></div>`;
    box.appendChild(div);
    lineChart(div.querySelector(".chart"), { x: Q, series: [{ values: vals, strong: ratio > 2 }], height: 120, width: 260, yTicks: 2, endLabels: false,
      xFormat: (q, i) => (i === 0 || i === Q.length - 1) ? q.slice(0, 4) : "", label: term });
  });

  // explorer
  const vocab = v.explorer, input = document.getElementById("q");
  const palette = [C("--accent"), C("--cut"), C("--text"), "#2f9e6a", "#9a5bd6"];
  const draw = () => {
    const words = input.value.toLowerCase().split(",").map(w => w.trim()).filter(Boolean).slice(0, 5);
    const found = words.filter(w => vocab[w]), missing = words.filter(w => !vocab[w]);
    if (!found.length) { document.getElementById("explore").innerHTML = ""; }
    else lineChart(document.getElementById("explore"), { x: Q, series: found.map((w, i) => ({ name: w, values: vocab[w], color: palette[i], strong: true })), label: "word frequency over time" });
    document.getElementById("exploreNote").textContent = "Per 10,000 words in the documents in force each quarter." +
      (missing.length ? ` Not in the word list: ${missing.join(", ")}. The list covers the ~2,000 most frequent words; company names are left out.` : "");
  };
  input.addEventListener("input", draw); draw();

  const nice = { dpf: "dpf (data privacy framework)" };
  barChart(document.getElementById("risers"), v.risers.map(r => ({ label: nice[r.term] || r.term, value: r.x })),
    { fmt: x => `${x}×`, label: "fastest rising words", labelW: 210 });
});

// wiretap: the search box clicks like a tape deck
document.getElementById("q").addEventListener("input", () => noir.fx.tick());
