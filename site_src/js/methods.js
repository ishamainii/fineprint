// the benchmark table comes straight from search.py's output, so these numbers can't drift from the real run
load("benchmark").then(b => {
  document.getElementById("nS").textContent = b.sentences.toLocaleString();
  const q = b.queries, lo = Math.min(...q.map(r => r.speedup)), hi = Math.max(...q.map(r => r.speedup));
  document.getElementById("bench").innerHTML = `<tr><th>query</th><th class="num">regex scan</th><th class="num">SQL LIKE</th><th class="num">FTS5 index</th><th class="num">faster than regex</th><th class="num">matches</th></tr>` +
    q.map(r => `<tr><td>${esc(r.query)}</td><td class="num">${r.regex_ms.toLocaleString()} ms</td><td class="num">${r.like_ms} ms</td><td class="num">${r.fts_ms} ms</td><td class="num">${r.speedup.toLocaleString()}×</td><td class="num">${r.hits_fts.toLocaleString()}${r.hits_fts !== r.hits_regex ? ` (regex ${r.hits_regex.toLocaleString()})` : ""}</td></tr>`).join("");
  document.getElementById("benchNote").textContent = `Index queries are the median of three runs; scans ran once. Between ${lo.toLocaleString()}× and ${hi.toLocaleString()}× faster. Where match counts differ, it's because the index ignores punctuation between words and so also finds forms like "opt—out."`;
});
