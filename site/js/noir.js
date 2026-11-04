// noir.js: the atmosphere. sound (all synthesised with web audio, no files), typewriter text,
// rubber stamps, redaction bars and the magnifying glass. every page loads this.

const noir = (() => {
  let ac = null, master = null, on = false, rainNode = null, pianoTimer = null;
  const pref = (() => { try { return localStorage.getItem("fp-sound") === "on"; } catch { return false; } })();

  function init() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
  }
  const noiseBuf = sec => { const b = ac.createBuffer(1, ac.sampleRate * sec, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; };

  // rain: filtered noise bed + random droplets
  function rain() {
    const src = ac.createBufferSource(); src.buffer = noiseBuf(4); src.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1400;
    const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 300;
    const g = ac.createGain(); g.gain.value = 0.11;
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(master); src.start();
    const drop = () => {
      if (!on) return;
      const t = ac.currentTime, b = ac.createBufferSource(), f = ac.createBiquadFilter(), dg = ac.createGain();
      b.buffer = noiseBuf(0.03); f.type = "bandpass"; f.frequency.value = 2500 + Math.random() * 4000; f.Q.value = 6;
      dg.gain.setValueAtTime(0.05 * Math.random(), t); dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      b.connect(f); f.connect(dg); dg.connect(master); b.start(t);
      setTimeout(drop, 30 + Math.random() * 160);
    };
    drop();
    return src;
  }
  // piano: soft minor-ninth chords, low and slow, the way a bar piano sounds through rain
  const CHORDS = [[45, 52, 55, 60, 64], [41, 48, 52, 57, 60], [43, 50, 53, 58, 62], [40, 47, 52, 55, 59]];
  const midi = n => 440 * 2 ** ((n - 69) / 12);
  function note(n, t, v, dur) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = "triangle"; o2.type = "sine"; o.frequency.value = midi(n); o2.frequency.value = midi(n) * 2.001;
    f.type = "lowpass"; f.frequency.value = 1800;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = ac.createGain(); g2.gain.value = 0.25;
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(master); o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }
  let chordIx = 0;
  function piano() {
    if (!on) return;
    const t = ac.currentTime + 0.05, ch = CHORDS[chordIx++ % CHORDS.length];
    ch.forEach((n, i) => note(n, t + i * 0.09 + Math.random() * 0.03, i === 0 ? 0.07 : 0.035, 5));
    if (Math.random() < 0.6) note(ch[ch.length - 1] + 12, t + 2.4, 0.025, 3);       // a lonely high note
    pianoTimer = setTimeout(piano, 6200 + Math.random() * 1800);
  }

  // effects
  const fx = {
    tick() { if (!on) return; const t = ac.currentTime, b = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      b.buffer = noiseBuf(0.02); f.type = "highpass"; f.frequency.value = 1800 + Math.random() * 1500;
      g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025); b.connect(f); f.connect(g); g.connect(master); b.start(t); },
    ding() { if (!on) return; note(88, ac.currentTime, 0.05, 1.4); },
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
    on = false; clearTimeout(pianoTimer);
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
    const full = el.textContent; el.dataset.done = "1"; el.textContent = ""; el.classList.add("typing");
    let i = 0;
    const step = () => {
      const n = Math.min(full.length, i + 2); el.textContent = full.slice(0, n); i = n;
      if (i % 4 === 0 || i === full.length) fx.tick();
      if (i < full.length) setTimeout(step, 14 + Math.random() * 22); else { el.classList.remove("typing"); fx.ding(); }
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

  // magnifying glass over a block of tiny text
  function lens(box) {
    const L = document.createElement("div"); L.className = "lens";
    const copy = document.createElement("div"); copy.innerHTML = box.innerHTML; L.appendChild(copy); box.appendChild(L);
    const Z = 2.6;
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
    document.querySelectorAll(".case, .tab").forEach(a => a.addEventListener("pointerenter", () => fx.paper()));
    wire();
    document.querySelectorAll(".fineprint-lens").forEach(lens);
  });

  return { fx, redact, wire, typewrite };
})();
