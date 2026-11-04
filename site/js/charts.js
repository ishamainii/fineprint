// charts.js: small svg chart helpers shared by every page. no library, so every mark is mine.
// colours come from the css variables so dark mode just works.

const C = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const load = name => fetch(`data/${name}.json`).then(r => r.json());
const qLabel = q => q.endsWith("Q1") ? q.slice(0, 4) : "";
const fmtDate = d => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
const svgEl = (w, h, inner, label = "") => `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${inner}</svg>`;

// line chart. series: [{name, values, color?, strong?}], x: labels (same length as values)
function lineChart(el, { x, series, height = 240, yMax, yTicks = 4, label = "", endLabels = true, xFormat = qLabel, width = 640 }) {
  const W = width, H = height, l = 38, r = endLabels ? 118 : 14, t = 12, b = 26;
  const max = yMax ?? Math.max(...series.flatMap(s => s.values.filter(v => v != null))) * 1.08;
  const X = i => l + i / Math.max(1, x.length - 1) * (W - l - r), Y = v => t + (1 - v / max) * (H - t - b);
  let s = "";
  for (let k = 0; k <= yTicks; k++) {
    const v = max * k / yTicks;
    s += `<line x1="${l}" x2="${W - r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C("--line")}"/>` +
         `<text x="${l - 6}" y="${Y(v) + 4}" font-size="11" text-anchor="end" fill="${C("--muted")}">${v >= 10 ? Math.round(v) : v.toFixed(1)}</text>`;
  }
  x.forEach((q, i) => { const lab = xFormat(q, i); if (lab) s += `<text x="${X(i)}" y="${H - 7}" font-size="11" text-anchor="middle" fill="${C("--muted")}">${lab}</text>`; });
  const used = [];
  series.forEach(se => {
    const col = se.color || (se.strong ? C("--accent") : C("--muted"));
    const pts = se.values.map((v, i) => v == null ? null : `${X(i)},${Y(v)}`).filter(Boolean);
    s += `<path d="M${pts.join("L")}" fill="none" stroke="${col}" stroke-width="${se.strong ? 2.6 : 1.6}" stroke-linejoin="round"/>`;
    if (endLabels && se.name) {
      const lastI = se.values.map((v, i) => v == null ? -1 : i).reduce((a, b) => Math.max(a, b));
      let ly = Y(se.values[lastI]) + 4; while (used.some(u => Math.abs(u - ly) < 13)) ly += 13; used.push(ly);
      s += `<text x="${X(lastI) + 6}" y="${ly}" font-size="12" fill="${col}" font-weight="${se.strong ? 600 : 400}">${esc(se.name)}</text>`;
    }
  });
  el.innerHTML = svgEl(W, H, s, label);
}

// horizontal bars. rows: [{label, value, color?, note?}]
function barChart(el, rows, { max, width = 640, labelW = 150, row = 26, fmt = v => v, label = "" } = {}) {
  const W = width, m = max ?? Math.max(...rows.map(r => r.value)), H = rows.length * row + 4;
  let s = "";
  rows.forEach((r, i) => {
    const y = i * row, w = Math.max(1, r.value / m * (W - labelW - 70));
    s += `<text x="${labelW - 10}" y="${y + 16}" font-size="13" text-anchor="end" fill="${C("--text")}">${esc(r.label)}</text>` +
         `<rect x="${labelW}" y="${y + 4}" width="${w}" height="${row - 9}" fill="${r.color || C("--accent")}"/>` +
         `<text x="${labelW + w + 6}" y="${y + 16}" font-size="12" fill="${C("--muted")}">${esc(fmt(r.value))}${r.note ? " " + esc(r.note) : ""}</text>`;
  });
  el.innerHTML = svgEl(W, H, s, label);
}

// vertical histogram. bins: numbers, labels: under each bar
function columns(el, bins, labels, { width = 640, height = 200, color, label = "", overlay } = {}) {
  const W = width, H = height, l = 34, t = 10, b = 26, n = bins.length, bw = (W - l - 8) / n;
  const max = Math.max(...bins, ...(overlay || [0])) * 1.1;
  let s = "";
  bins.forEach((v, i) => {
    const h = v / max * (H - t - b);
    s += `<rect x="${l + i * bw + 2}" y="${H - b - h}" width="${bw - 4}" height="${h}" fill="${color || C("--accent")}" opacity="0.85"/>`;
    if (labels[i]) s += `<text x="${l + i * bw + bw / 2}" y="${H - 8}" font-size="11" text-anchor="middle" fill="${C("--muted")}">${labels[i]}</text>`;
  });
  if (overlay) s += `<path d="M${overlay.map((v, i) => `${l + i * bw + bw / 2},${H - b - v / max * (H - t - b)}`).join("L")}" fill="none" stroke="${C("--text")}" stroke-width="2" stroke-dasharray="5 4"/>`;
  s += `<line x1="${l}" x2="${W - 8}" y1="${H - b}" y2="${H - b}" stroke="${C("--line")}"/>`;
  el.innerHTML = svgEl(W, H, s, label);
}

// square heatmap of a symmetric matrix
function heatmap(el, codes, M, { label = "", onPick } = {}) {
  const n = codes.length, cell = Math.min(26, 560 / n), l = 26, t = 22, W = l + n * cell + 4, H = t + n * cell + 4;
  let s = "";
  codes.forEach((c, i) => {
    s += `<text x="${l - 6}" y="${t + i * cell + cell * 0.68}" font-size="11" text-anchor="end" fill="${C("--muted")}">${c}</text>` +
         `<text x="${l + i * cell + cell / 2}" y="${t - 7}" font-size="11" text-anchor="middle" fill="${C("--muted")}">${c}</text>`;
    codes.forEach((d, j) => {
      const v = M[i][j];
      if (v == null) return;
      s += `<rect class="cell" data-a="${c}" data-b="${d}" x="${l + j * cell}" y="${t + i * cell}" width="${cell - 1}" height="${cell - 1}" fill="${C("--accent")}" fill-opacity="${Math.max(0.04, v ** 2)}"><title>${c} and ${d}: ${v}</title></rect>`;
    });
  });
  el.innerHTML = svgEl(W, H, s, label);
  if (onPick) el.querySelectorAll(".cell").forEach(r => r.addEventListener("click", () => onPick(r.dataset.a, r.dataset.b)));
}
