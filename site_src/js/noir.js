// noir.js: the atmosphere. the score and sound effects (all synthesised with web audio, no files),
// decoding headlines, case tags, redaction bars and the magnifying glass. every page loads this.

const noir = (() => {
  let ac = null, master = null, on = false, rainNode = null, pianoTimer = null;
  const pref = (() => { try { return localStorage.getItem("fp-sound") === "on"; } catch { return false; } })();

  function init() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
  }
  const noiseBuf = sec => { const b = ac.createBuffer(1, ac.sampleRate * sec, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; };

  // the score: a low drone that breathes, a heartbeat under it, and now and then a single
  // high note left hanging. minor and unresolved, the way true-crime scores sit under narration.
  const midi = n => 440 * 2 ** ((n - 69) / 12);
  function drone() {
    const out = ac.createGain(); out.gain.value = 0.16; out.connect(master);
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420; lp.Q.value = 4; lp.connect(out);
    const lfo = ac.createOscillator(), lfoG = ac.createGain(); lfo.frequency.value = 0.05; lfoG.gain.value = 260; lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    [[38, -7], [38, 6], [45, 0], [50, 3]].forEach(([n, cents]) => {               // D1, D1 detuned, A1, D2: open fifths, no third
      const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = midi(n); o.detune.value = cents; o.connect(lp); o.start();
    });
    return out;
  }
  function heart() {
    if (!on) return;
    const beat = (t, v) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.3); };
    const t = ac.currentTime + 0.02; beat(t, 0.32); beat(t + 0.24, 0.2);
    pianoTimer = setTimeout(heart, 1250 + Math.random() * 120);
  }
  function note(n, t, v, dur, type = "sine") {
    const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = type; o.frequency.value = midi(n); f.type = "lowpass"; f.frequency.value = 2400;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.1);
  }
  const HIGH = [74, 77, 81, 82, 86];                                               // D5 F5 A5 Bb5 D6: d minor with the flat sixth
  let hiTimer = null;
  function hanging() { if (!on) return; note(HIGH[Math.floor(Math.random() * HIGH.length)], ac.currentTime + 0.05, 0.03, 4.5, "triangle"); hiTimer = setTimeout(hanging, 7000 + Math.random() * 6000); }
  const rain = () => drone(), piano = () => { heart(); clearTimeout(hiTimer); hiTimer = setTimeout(hanging, 3000); };

  // effects
  const fx = {
    tick() { if (!on) return; const t = ac.currentTime, b = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      b.buffer = noiseBuf(0.02); f.type = "bandpass"; f.Q.value = 3; f.frequency.value = 3200 + Math.random() * 1500;
      g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025); b.connect(f); f.connect(g); g.connect(master); b.start(t); },
    ding() { if (!on) return; const t = ac.currentTime; note(62, t, 0.04, 2.4, "triangle"); note(69, t + 0.06, 0.03, 2.4, "triangle"); note(77, t + 0.12, 0.025, 2.4, "triangle"); },
    stamp() { if (!on) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.3);
      const b = ac.createBufferSource(), f = ac.createBiquadFilter(), ng = ac.createGain(); b.buffer = noiseBuf(0.08); f.type = "lowpass"; f.frequency.value = 900;
      ng.gain.setValueAtTime(0.25, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); b.connect(f); f.connect(ng); ng.connect(master); b.start(t); },
    paper() { if (!on) return; const t = ac.currentTime, b = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      b.buffer = noiseBuf(0.35); f.type = "bandpass"; f.Q.value = 0.8; f.frequency.setValueAtTime(800, t); f.frequency.linearRampToValueAtTime(3500, t + 0.3);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      b.connect(f); f.connect(g); g.connect(master); b.start(t); },
    beep(level = 0.5) { if (!on) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.type = "square"; o.frequency.value = 500 + level * 900;
      g.gain.setValueAtTime(0.03, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.1); },
  };

  async function start() {
    if (!ac) init();
    await ac.resume(); on = true;
    master.gain.cancelScheduledValues(ac.currentTime); master.gain.setValueAtTime(master.gain.value, ac.currentTime); master.gain.linearRampToValueAtTime(0.9, ac.currentTime + 1.5);
    if (!rainNode) rainNode = rain(); piano();
  }
  function stop() {
    on = false; clearTimeout(pianoTimer); clearTimeout(hiTimer);
    if (ac) { master.gain.cancelScheduledValues(ac.currentTime); master.gain.setValueAtTime(master.gain.value, ac.currentTime); master.gain.linearRampToValueAtTime(0, ac.currentTime + 0.6); }
  }

  // ---------- page effects ----------
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // swap [company] / [product] markers for redaction bars
  function redact(html) {
    return html.replace(/\[(company|product|link)\]/g, (m, k) => `<span class="redact" data-kind="${k} withheld">${"█".repeat(k === "link" ? 4 : 7)}</span>`);
  }

  // typewriter: elements with data-type reveal their text when scrolled to
  function typewrite(el) {
    if (reduce || el.dataset.done) return;
    const full = el.textContent, GL = "█▓▒░/\\|<>_#$%&*";
    el.dataset.done = "1"; el.classList.add("typing");
    let i = 0;
    const step = () => {
      i = Math.min(full.length, i + 1);
      el.textContent = full.slice(0, i) + [...full.slice(i, i + 6)].map(c => c === " " ? " " : GL[Math.floor(Math.random() * GL.length)]).join("");
      if (i % 3 === 0) fx.tick();
      if (i < full.length) setTimeout(step, 22 + Math.random() * 18); else { el.textContent = full; el.classList.remove("typing"); fx.ding(); }
    };
    step();
  }
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    if (e.target.matches("[data-type]")) typewrite(e.target);
    if (e.target.matches(".stamp[data-slam]")) { e.target.classList.add("slam"); fx.stamp(); }
    io.unobserve(e.target);
  }), { threshold: 0.6 });
  function wire(root = document) { root.querySelectorAll("[data-type], .stamp[data-slam]").forEach(el => io.observe(el)); }

  // magnifying glass over a block of tiny text (the text can arrive later, so copy it on entry)
  function lens(box) {
    const L = document.createElement("div"); L.className = "lens";
    const copy = document.createElement("div"); L.appendChild(copy); box.appendChild(L);
    const Z = 2.6;
    box.addEventListener("pointerenter", () => { copy.innerHTML = [...box.children].filter(c => c !== L).map(c => c.outerHTML).join(""); });
    box.addEventListener("pointermove", e => {
      const r = box.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      L.style.display = "block"; L.style.left = `${x - 95}px`; L.style.top = `${y - 95}px`;
      copy.style.width = `${box.clientWidth - 40}px`;
      copy.style.transform = `scale(${Z})`; copy.style.left = `${95 - (x - 20) * Z}px`; copy.style.top = `${95 - (y - 18) * Z}px`;
    });
    box.addEventListener("pointerleave", () => { L.style.display = "none"; });
  }

  // sound toggle
  document.addEventListener("DOMContentLoaded", () => {
    const b = document.createElement("button"); b.className = "sound"; b.setAttribute("aria-pressed", "false");
    b.textContent = "♪ sound off"; document.body.appendChild(b);
    const set = v => { b.setAttribute("aria-pressed", String(v)); b.textContent = v ? "♪ sound on" : "♪ sound off"; try { localStorage.setItem("fp-sound", v ? "on" : "off"); } catch {} };
    b.addEventListener("click", () => { if (on) { stop(); set(false); } else { start(); set(true); } });
    if (pref) { const once = () => { start(); set(true); removeEventListener("pointerdown", once); }; addEventListener("pointerdown", once); }  // browsers need a click first
    document.querySelectorAll(".chapters a, .tab").forEach(a => a.addEventListener("pointerenter", () => fx.paper()));
    wire();
    document.querySelectorAll(".fineprint-lens").forEach(lens);
    // every number in the prose with data-s="path" comes from data/stats.json, so the text can't drift from the analysis
    const spans = document.querySelectorAll("[data-s]");
    if (spans.length) fetch("data/stats.json").then(r => r.json()).then(S => spans.forEach(el => {
      let v = el.dataset.s.split(".").reduce((o, k) => o?.[k], S);
      if (v == null) return;
      if (el.dataset.f === "pct") v = Math.round(v * 100);
      else if (Array.isArray(v)) v = v.join("–");
      else if (typeof v === "number" && v < 0) v = "−" + Math.abs(v);
      else if (typeof v === "number" && v >= 1000) v = v.toLocaleString();
      el.textContent = v;
    })).catch(() => {});
  });

  return { fx, redact, wire, typewrite };
})();
