// Matteo Traverso – shared code for every page:
// 15 fps limiter, cursor fallback, pointer, per-letter fonts, clouds + scattered
// windows, jit.gen background, edge creatures. Load at the end of <body>.

// ===== Whole page at 15 fps =====
// Every animation loop below (background, clouds, pointer, creatures) asks for
// frames with requestAnimationFrame; this hands them out at most PAGE_FPS times
// a second, the pointer's movement included.
(() => {
  const PAGE_FPS = 15;
  const step = 1000 / PAGE_FPS;
  const raf = window.requestAnimationFrame.bind(window);
  let queue = [], pending = false, last = 0;
  function pump(ts){
    if (ts - last < step - 1){ raf(pump); return; }
    last = ts - last > 2 * step ? ts : last + step;      // keep a steady beat, resync after pauses
    const q = queue; queue = []; pending = false;
    for (const cb of q) cb(ts);
  }
  window.requestAnimationFrame = (cb) => {
    queue.push(cb);
    if (!pending){ pending = true; raf(pump); }
    return 0;
  };
})();

// No-JS / pre-JS cursor fallback: show a real cursor until this script runs,
// and forever if JS is disabled or throws before this point.
document.documentElement.classList.add("no-js");
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.remove("no-js");
});

// ===== Pointer creature (cursor) =====
const canvas = document.getElementById("grad-square");
const ctx = canvas.getContext("2d");

const pCols = 12;
const pRows = 12;
const pCell = 5;
const pN = pCols * pRows;

const baseAlpha = new Float32Array(pN);
const currentAlpha = new Float32Array(pN);
const targetAlpha = new Float32Array(pN);   // each pixel fades towards its new value
const intervals = new Float32Array(pN);
const timers = new Float32Array(pN);

const minFps = 0.01;
const maxFps = 6.5;          // fastest a pixel picks a new value (per second)
const PTR_FADE = 0.27;       // seconds: how slowly a pixel fades to its new value

const pcx = (pCols - 1) / 2;
const pcy = (pRows - 1) / 2;
const pRadius = pCols / 2;   // circular falloff -> round pointer

// soft butter yellow: cream in the middle, warmer gold towards the rim
const pInner = [250, 240, 165];
const pOuter = [242, 210, 55];
const pColor = new Array(pN);

let idp = 0;
for (let y=0; y<pRows; y++){
  for (let x=0; x<pCols; x++){
    const dx = x - pcx;
    const dy = y - pcy;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const t = dist / pRadius;
    baseAlpha[idp] = t < 1 ? 1 - t*t : 0;
    const m = Math.min(1, t);
    pColor[idp] = pInner.map((v, k) => Math.round(v + (pOuter[k] - v) * m)).join(",");

    const fps = minFps + Math.random() * (maxFps - minFps);
    intervals[idp] = 1 / fps;
    timers[idp] = Math.random() * intervals[idp];

    currentAlpha[idp] = targetAlpha[idp] = baseAlpha[idp] * Math.random();
    idp++;
  }
}

function updatePointer(dt){
  const k = 1 - Math.exp(-dt / PTR_FADE);
  for (let i=0; i<pN; i++){
    timers[i] += dt;
    if (timers[i] >= intervals[i]){
      timers[i] %= intervals[i];   // modulo, not subtract: no catch-up burst after a pause
      targetAlpha[i] = baseAlpha[i] * Math.random();
    }
    currentAlpha[i] += (targetAlpha[i] - currentAlpha[i]) * k;
  }
}

function renderPointer(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  let i=0;
  for (let y=0; y<pRows; y++){
    for (let x=0; x<pCols; x++){
      const a = currentAlpha[i];
      if (a > 0){
        ctx.fillStyle = `rgba(${pColor[i]},${Math.min(1, a * 2.52)})`;   // alpha boosted (1.8 x 1.4)
        ctx.fillRect(x*pCell, y*pCell, pCell, pCell);
      }
      i++;
    }
  }
}

// The pointer moves only on the page's 15 fps frames, easing towards the mouse.
const POINTER_FOLLOW = 0.55;   // share of the distance covered per 15 fps frame (1 = jump straight there)
let ptrX = null, ptrY = null, ptrTX = 0, ptrTY = 0;

let lastTime = null;
function pointerLoop(ts){
  if (lastTime === null) lastTime = ts;
  const dt = Math.min(0.1, (ts - lastTime) / 1000);   // clamp: tab switches give huge dt
  lastTime = ts;

  if (ptrX !== null){
    const k = 1 - Math.pow(1 - POINTER_FOLLOW, dt * 15);
    ptrX += (ptrTX - ptrX) * k;
    ptrY += (ptrTY - ptrY) * k;
    canvas.style.left = ptrX + "px";
    canvas.style.top  = ptrY + "px";
  }

  updatePointer(dt);
  renderPointer();
  requestAnimationFrame(pointerLoop);
}
requestAnimationFrame(pointerLoop);

window.addEventListener("mousemove", (e) => {
  ptrTX = e.clientX;
  ptrTY = e.clientY;
  if (ptrX === null){ ptrX = ptrTX; ptrY = ptrTY; }   // first move: start where the mouse is
});

// ===== Random font per-letter across the whole site =====
// NOTE: runs once on DOMContentLoaded. If you add content dynamically later
// (e.g. injecting project descriptions via JS), call scrambleText() again
// on the new nodes, or move this into a reusable function.
// FONT_SEED fixes the arrangement: same number = same fonts on every load.
// Change the number for another fixed arrangement; null = new random one each load.
// (Editing the text shifts the arrangement from the edited letter onwards.)
const FONT_SEED = 1;

function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function scrambleText(root){
  const fonts = [
    "Courier New, monospace",
    "OCR A Std, monospace",
    "Andale Mono, monospace",
    "Bookman, 'URW Bookman L', serif",
    "Optima, sans-serif",
    "Cambria, serif"
  ];
  const weights = [80, 200, 500];
  const rnd = FONT_SEED === null ? Math.random : mulberry32(FONT_SEED);

  // The tagline was rewritten after the arrangement was fixed: it draws from its
  // own stream, and the main stream skips the draws the old tagline used
  // (116 letters x font + weight), so every letter after it keeps its font.
  const taglineRnd = FONT_SEED === null ? Math.random : mulberry32(FONT_SEED + 1);

  // text added later inside an element with data-font-stream="n" gets its own
  // stream too, so adding it doesn't shift the fonts anywhere else
  const streams = new Map();
  const streamFor = (el) => {
    if (!streams.has(el)) streams.set(el, FONT_SEED === null ? Math.random : mulberry32(FONT_SEED + 100 + Number(el.dataset.fontStream)));
    return streams.get(el);
  };
  // + nav (Works/About/Contact, 17 letters) and heading (exploring boundaries /
  //   of numb senses, 34 letters) removed later: their draws are skipped too,
  //   and the icon captions (60 letters) while they're commented out.
  const captionsOff = !document.querySelector(".icon-caption");
  const OLD_TAGLINE_DRAWS = (116 + 17 + 34 + (captionsOff ? 60 : 0)) * 2;
  let taglineSkipped = false;

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node){
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
        if (p.closest && (p.closest("#grad-square") || p.closest("#bg-lines") || p.closest("#creature-layer"))) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);

  for (const textNode of nodes){
    const inTagline = !!textNode.parentElement.closest(".tagline");
    if (inTagline && !taglineSkipped){
      for (let k = 0; k < OLD_TAGLINE_DRAWS; k++) rnd();
      taglineSkipped = true;
    }
    const own = textNode.parentElement.closest("[data-font-stream]");
    const g = inTagline ? taglineRnd : own ? streamFor(own) : rnd;
    const randomItem = (arr) => arr[Math.floor(g() * arr.length)];

    const text = textNode.nodeValue;
    const frag = document.createDocumentFragment();
    let prevSpace = false;
    for (const ch of text){
      const family = randomItem(fonts);                // always draw, so later letters keep their fonts
      const weight = String(randomItem(weights));
      const isSpace = /\s/.test(ch);
      if (isSpace && prevSpace) continue;             // collapse runs of whitespace (source indentation)
      prevSpace = isSpace;
      const s = document.createElement("span");
      s.className = "random-letter";
      s.textContent = isSpace ? " " : ch;
      s.style.fontFamily = family;
      s.style.fontWeight = weight;
      frag.appendChild(s);
    }
    textNode.parentNode.replaceChild(frag, textNode);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  scrambleText(document.body);
});

// ===== Clouds + scattered windows =====
// The icon windows are scattered over the page (seeded, like the fonts), each
// on its own cloud; the header has one too. All clouds live on one canvas
// behind the frame's content, as wide as the page.
// A cloud is made only of pixel balls (white in the middle, flickering grey
// pixels towards the edge, like the edge creatures):
//   - inner balls, packed over the text / icon so it always sits on white
//   - rim balls on the outline, which stay a long time, fade out slowly and
//     later fade back in somewhere else, so the outline changes very slowly.
window.addEventListener("DOMContentLoaded", () => {
  const frame = document.querySelector(".frame");
  if (!frame) return;

  // --- layout of the windows
  const LAYOUT_SEED = 1;            // same number = same layout; null = new layout each load
  const SCATTER_MIN_WIDTH = 900;    // narrower screens keep the simple stacked layout
  const CLEAR = 70;                 // px kept free around each window (room for its cloud); a page can set data-clear="…" on its .scatter-area
  const LINKS_MARGIN = 90;          // px between the links cloud and the right edge of the page

  // --- clouds
  const CELL = 5;                   // css px per cloud pixel (like the creatures)
  const MARGIN = 170;               // how far the canvas reaches above / below the frame
  const PAD = 16;                   // white margin around the text / icon
  const INNER_R = 62;               // radius of the inner balls (px, capped by the content height)
  const INNER_SPACING = 0.6;        // inner ball spacing, as a share of their radius (lower = whiter)
  const BALL_SPACING = 45;          // one rim ball per this many px of outline
  const BALL_MIN = 28, BALL_MAX = 72;   // rim ball radius range (px)
  const HOLD_MIN = 13, HOLD_MAX = 30;   // seconds a ball stays
  const FADE = 2.7;                 // seconds to fade a ball in / out
  const OFF_MIN = 2, OFF_MAX = 5.3; // seconds before it comes back elsewhere
  const TICK_FPS = 15;
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FLICKER = REDUCED ? 0 : 0.015;  // share of pixels re-randomised per tick (~4.5 s each)

  const canvas = document.createElement("canvas");
  canvas.className = "cloud-layer";
  canvas.setAttribute("aria-hidden", "true");
  frame.prepend(canvas);
  const ctx = canvas.getContext("2d");

  const rand = (a, b) => a + Math.random() * (b - a);
  let cols = 0, rows = 0, N = 0, img = null, px = null, flick = null, clouds = [];

  // the text/icon area of a host: union of its scrambled letters and images (viewport px)
  function contentRect(el){
    let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
    for (const n of el.querySelectorAll(".random-letter, img, iframe")){
      const b = n.getBoundingClientRect();
      if (!b.width && !b.height) continue;
      L = Math.min(L, b.left); T = Math.min(T, b.top);
      R = Math.max(R, b.right); B = Math.max(B, b.bottom);
    }
    if (L === Infinity){ const b = el.getBoundingClientRect(); return { L:b.left, T:b.top, R:b.right, B:b.bottom }; }
    return { L, T, R, B };
  }

  // ---------- scattered windows ----------
  function placeWindows(){
    const cards = [...document.querySelectorAll(".scatter")];
    const area = document.querySelector(".scatter-area");
    const head = document.querySelector(".head-link");
    const links = document.querySelector(".links-cloud");
    if (!head) return;
    for (const c of [...cards, links].filter(Boolean)){ c.style.position = ""; c.style.left = ""; c.style.top = ""; }
    if (area) area.style.height = "";
    if (window.innerWidth < SCATTER_MIN_WIDTH) return;

    const rnd = LAYOUT_SEED === null ? Math.random : mulberry32(LAYOUT_SEED);
    const fr = frame.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const h = contentRect(head);
    const top0 = h.B - fr.top + CLEAR;                                     // below the header's cloud
    const gap = Number(area && area.dataset.clear) || CLEAR;              // between the items (data-clear on the area)
    // enough height for all the items (several rows on pages with many)
    const itemW = cards.length ? Math.max(...cards.map(c => c.offsetWidth)) : 0;
    const itemH = cards.length ? Math.max(...cards.map(c => c.offsetHeight)) : 0;
    const perRow = Math.max(1, Math.floor((vw - 48) / (itemW + 2 * gap)));
    const rowsH = Math.ceil(cards.length / perRow) * (itemH + 2 * gap) * 1.35;
    const areaH = Math.max(560, window.innerHeight - (h.B - fr.top) - 140, rowsH);
    const taken = [{ L: h.L - fr.left - CLEAR, R: h.R - fr.left + CLEAR, T: -1e5, B: top0 }];

    // links cloud: top right of the page, level with the header text
    if (links){
      links.style.position = "absolute";
      const lx = -fr.left + vw - LINKS_MARGIN - links.offsetWidth;
      const ly = h.T - fr.top;
      links.style.left = lx + "px";
      links.style.top = ly + "px";
      taken.push({ L: lx - CLEAR, R: lx + links.offsetWidth + CLEAR, T: -1e5, B: ly + links.offsetHeight + CLEAR });
    }
    let bottom = top0;

    let span = areaH;                                                       // grows if an item finds no room
    for (const c of cards){
      const w = c.offsetWidth, ht = c.offsetHeight;
      let x = 0, y = 0, box = null;
      for (let round = 0; round < 10; round++){
        let free = false;
        for (let tries = 0; tries < 400; tries++){
          x = -fr.left + 24 + rnd() * Math.max(0, vw - 48 - w);
          y = top0 + rnd() * Math.max(0, span - ht);
          box = { L: x - gap, R: x + w + gap, T: y - gap, B: y + ht + gap };
          if (!taken.some(t => box.L < t.R && box.R > t.L && box.T < t.B && box.B > t.T)){ free = true; break; }
        }
        if (free) break;
        span += ht + gap;                                                    // no room: make the page longer
      }
      c.style.position = "absolute";
      c.style.left = x + "px";
      c.style.top = y + "px";
      taken.push(box);
      bottom = Math.max(bottom, y + ht + gap);
    }
    if (!area || !cards.length) return;
    const areaTop = area.getBoundingClientRect().top - fr.top;
    area.style.height = (bottom - areaTop) + "px";                         // page ends below the windows
  }

  // ---------- clouds ----------
  // a rim ball somewhere on the outline, pushed in or out a little
  function placeBall(c, b){
    const w = c.R - c.L, h = c.B - c.T;
    let t = rand(0, 2 * (w + h)), x, y, nx, ny;
    if (t < w){ x = c.L + t; y = c.T; nx = 0; ny = -1; }
    else if ((t -= w) < h){ x = c.R; y = c.T + t; nx = 1; ny = 0; }
    else if ((t -= h) < w){ x = c.R - t; y = c.B; nx = 0; ny = 1; }
    else { t -= w; x = c.L; y = c.B - t; nx = -1; ny = 0; }
    b.r = rand(BALL_MIN, BALL_MAX);
    const out = rand(0, 0.7) * b.r;
    b.x = x + nx * out; b.y = y + ny * out;
  }

  // ball states: "in" (fading in) -> "on" (holding) -> "out" (fading out) -> "off" -> placed again
  function startBall(c, b){
    placeBall(c, b);
    if (Math.random() < 0.8){ b.state = "on"; b.fa = 1; b.t = rand(0, HOLD_MAX); }
    else { b.state = "off"; b.fa = 0; b.t = rand(0, OFF_MAX); }
  }
  function stepBall(c, b, dt){
    switch (b.state){
      case "in":  b.fa += dt / FADE; if (b.fa >= 1){ b.fa = 1; b.state = "on"; b.t = rand(HOLD_MIN, HOLD_MAX); } return true;
      case "on":  b.t -= dt; if (b.t <= 0) b.state = "out"; return false;
      case "out": b.fa -= dt / FADE; if (b.fa <= 0){ b.fa = 0; b.state = "off"; b.t = rand(OFF_MIN, OFF_MAX); } return true;
      default:    b.t -= dt; if (b.t <= 0){ placeBall(c, b); b.state = "in"; } return false;
    }
  }

  // inner balls: a jittered grid over the text / icon area, permanent
  function shapeInner(c){
    const w = c.R - c.L, h = c.B - c.T;
    const R0 = Math.min(INNER_R, h * 0.5);
    const sp = R0 * INNER_SPACING;
    const nx = Math.ceil(w / sp) + 1, ny = Math.ceil(h / sp) + 1;
    const balls = [];
    for (let a = 0; a < ny; a++){
      for (let b = 0; b < nx; b++){
        balls.push({
          x: c.L + (b / (nx - 1)) * w + rand(-0.35, 0.35) * R0,
          y: c.T + (a / (ny - 1)) * h + rand(-0.35, 0.35) * R0,
          r: R0 * rand(0.85, 1.15), fa: 1
        });
      }
    }
    c.inner = new Float32Array(c.w * c.h);
    stamp(c, c.inner, balls);
  }
  // max of round ball fields (1 - t^2) x fade, into one of the cloud's fields
  function stamp(c, f, balls){
    for (const b of balls){
      if (b.fa <= 0) continue;
      const i0 = Math.max(0, Math.floor((b.x - b.r) / CELL) - c.x0), i1 = Math.min(c.w - 1, Math.ceil((b.x + b.r) / CELL) - c.x0);
      const j0 = Math.max(0, Math.floor((b.y - b.r) / CELL) - c.y0), j1 = Math.min(c.h - 1, Math.ceil((b.y + b.r) / CELL) - c.y0);
      for (let j = j0; j <= j1; j++){
        const dy = (c.y0 + j + 0.5) * CELL - b.y;
        for (let i = i0; i <= i1; i++){
          const dx = (c.x0 + i + 0.5) * CELL - b.x;
          const t = Math.sqrt(dx*dx + dy*dy) / b.r;
          if (t < 1){ const v = (1 - t*t) * b.fa; const k = j * c.w + i; if (v > f[k]) f[k] = v; }
        }
      }
    }
  }
  function shapeBalls(c){
    const f = c.ball || (c.ball = new Float32Array(c.w * c.h));
    f.fill(0);
    stamp(c, f, c.balls);
  }

  // cloud around a host; canvas x = viewport x, canvas y = viewport y - frame top + MARGIN
  function makeCloud(el, fr){
    const r = contentRect(el);
    const c = {
      L: r.L - PAD, R: r.R + PAD,
      T: r.T - fr.top + MARGIN - PAD, B: r.B - fr.top + MARGIN + PAD,
      balls: []
    };
    const reach = Math.max(INNER_R * 1.2, BALL_MAX * 1.6);
    c.x0 = Math.max(0, Math.floor((c.L - reach) / CELL));
    c.y0 = Math.max(0, Math.floor((c.T - reach) / CELL));
    c.w = Math.max(1, Math.min(cols, Math.ceil((c.R + reach) / CELL)) - c.x0);
    c.h = Math.max(1, Math.min(rows, Math.ceil((c.B + reach) / CELL)) - c.y0);
    const n = Math.max(6, Math.round(2 * ((c.R - c.L) + (c.B - c.T)) / BALL_SPACING));
    for (let k = 0; k < n; k++){ const b = {}; startBall(c, b); c.balls.push(b); }
    shapeInner(c); shapeBalls(c);
    return c;
  }

  function build(){
    placeWindows();
    const fr = frame.getBoundingClientRect();
    const W = document.documentElement.clientWidth, H = fr.height + 2 * MARGIN;
    canvas.style.left = -fr.left + "px";                                   // page-wide
    canvas.style.top = -MARGIN + "px";
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    cols = Math.ceil(W / CELL); rows = Math.ceil(H / CELL); N = cols * rows;
    canvas.width = cols; canvas.height = rows;
    img = ctx.createImageData(cols, rows); px = img.data;
    for (let k = 0; k < N; k++){ px[k*4] = px[k*4+1] = px[k*4+2] = 255; }   // white; alpha per frame
    flick = new Float32Array(N);
    for (let k = 0; k < N; k++) flick[k] = Math.random();

    const hosts = [document.querySelector(".head-link"), document.querySelector(".links-cloud"), ...document.querySelectorAll(".icon-card, .cloud")].filter(Boolean);
    clouds = hosts.map(el => makeCloud(el, fr));
    draw();
  }

  function draw(){
    for (let k = 3; k < px.length; k += 4) px[k] = 0;
    for (const c of clouds){
      for (let j = 0; j < c.h; j++){
        for (let i = 0; i < c.w; i++){
          const k = j * c.w + i, g = (c.y0 + j) * cols + c.x0 + i;
          const f = flick[g];
          const v = Math.max(c.inner[k], c.ball[k]);
          // solid white near ball centres, flickering grey towards their edges
          const a = Math.sqrt(v) * (v + (1 - v) * f);
          const A = Math.round(a * 255);
          if (A > px[g*4 + 3]) px[g*4 + 3] = A;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  let last = 0, acc = 0;
  function loop(ts){
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts;
    acc += dt;
    const step = 1 / TICK_FPS;
    if (acc >= step && N){
      acc %= step;
      const count = Math.round(N * FLICKER);
      for (let k = 0; k < count; k++) flick[(Math.random() * N) | 0] = Math.random();
      if (!REDUCED){
        for (const c of clouds){
          let changed = false;
          for (const b of c.balls) if (stepBall(c, b, step)) changed = true;
          if (changed) shapeBalls(c);
        }
      }
      draw();
    }
    requestAnimationFrame(loop);
  }

  build();
  requestAnimationFrame(loop);
  let resizeTimer = 0;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(build, 150); });
  window.addEventListener("load", build);                              // images loaded: sizes final
  if (document.fonts) document.fonts.ready.then(build);                // fonts loaded: sizes final
});

// ===== Background: port of the jit.gen patch =====
//
// Same geometry as the Max patch: a fixed 100 x 512 matrix stretched to the
// window (like jit.window), so the cell proportions follow the screen.
//
// Per cell (re-rolled gradually, REROLL of the cells per tick):
//   noise_1        = 4 uniforms in [0,1]
//   gate (gt_4)    = noise.r > 0.2         -> otherwise black
//   R compare      = add_15  = (norm.y > 0.8) + noise.r     -> magenta band at the bottom
//   G compare      = atan_27 = atan2((norm.x > 0.6) + v, 4.9) -> green on the right 40%
//   B compare      = mul_22  = 0.6 * (in1 + 80)              -> always on
//   out            = sin((compare > in2.a) * noise)          -> RGB, on black
//
// in2.a: modelled from the Max recording as a 100 x 100 matrix (so one value
// spans ~5 rows): a share P_LOW with a low threshold in [0, LOW_MAX] (red +
// green show through), the rest HIGH in [HIGH_MIN, HIGH_MAX] (mostly only the
// bottom band passes red).
// Near the cursor the share of LOW points rises and part of the blue drops out.
(() => {
  const bg = document.getElementById("bg-lines");
  const bctx = bg.getContext("2d");

  const COLS = 100, ROWS = 512;           // jit.matrix dim, stretched to the window
  const IN2_COLS = 100, IN2_ROWS = 100;   // in2 dim

  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TICK_FPS = 12;                    // re-roll rate
  const REROLL = REDUCED ? 0 : 0.02;      // fraction of cells re-rolled per tick (~4 s per cell);
                                          // TICK_FPS = 1.17 + REROLL = 1 is the Max timing (whole frame every ~0.85 s)

  const IN1 = 0;                          // in1: +80 keeps mul_22 far above in2.a anyway
  const GREEN_RIGHT = 3;                  // added to the G compare on the right 40% (Max: 1); higher = more green

  // in2.a model (fitted to the Max recording)
  const P_LOW = 0.2;                      // share of LOW points
  const LOW_MAX = 0.9;                    // LOW range [0, LOW_MAX]: green needs < ~0.3, red < noise.r
  const HIGH_MIN = 0.75, HIGH_MAX = 2.0;  // the rest: scattered red near 0.75-1, bottom band red below 1 + noise.r
  const CURSOR_BOOST = 0.5;               // extra LOW share right at the cursor (0 = no interaction)
  const BLUE_CUT = 0.6;                   // share of blue cells knocked out right at the cursor
  const CURSOR_RADIUS = 280;              // px
  const SMOOTH = 0.12;                    // cursor follow (per 1/60 s)

  const N = COLS * ROWS, M = IN2_COLS * IN2_ROWS;
  bg.width = COLS;
  bg.height = ROWS;
  const img = bctx.createImageData(COLS, ROWS);
  const px = img.data;

  // per cell
  const cmpR = new Float32Array(N), cmpG = new Float32Array(N), cmpB = new Float32Array(N);
  const sR = new Float32Array(N), sG = new Float32Array(N), sB = new Float32Array(N);
  const u3 = new Float32Array(N);         // cursor blue mask
  // per in2 point
  const u1 = new Float32Array(M), u2 = new Float32Array(M), thrC = new Float32Array(M);
  // nearest-neighbour lookup: matrix row/col -> in2 row/col
  const in2Row = new Int32Array(ROWS), in2Col = new Int32Array(COLS);
  for (let y = 0; y < ROWS; y++) in2Row[y] = Math.floor(y * IN2_ROWS / ROWS) * IN2_COLS;
  for (let x = 0; x < COLS; x++) in2Col[x] = Math.floor(x * IN2_COLS / COLS);

  let cellW = 1, cellH = 1;               // css px per cell, set on resize
  let dirty = true;

  // one jit.gen cell: everything that depends only on noise() and norm
  function roll(i){
    const x = i % COLS;
    const y = (i / COLS) | 0;
    const nr = Math.random(), ng = Math.random(),
          nb = Math.random(), na = Math.random();          // noise_1
    const gt4  = nr > 0.2;                                   // gt_4
    const gt14 = y / (ROWS - 1) > 0.8 ? 1 : 0;               // norm.g > 0.8
    const gt17 = x / (COLS - 1) > 0.6 ? GREEN_RIGHT : 0;     // norm.a > 0.6 (acts as x); Max adds 1

    cmpR[i] = gt14 + (gt4 ? nr : 0.1);                       // add_15
    cmpG[i] = Math.atan2(gt17 + (na > 0.4 ? nr : 0.6), 4.9); // atan_27
    cmpB[i] = (nr > 0.99 ? nr : 0.6) * (IN1 + 80);           // mul_22

    sR[i] = gt4 ? 255 * Math.sin(nr) : 0;                    // sin(switch_5)
    sG[i] = gt4 ? 255 * Math.sin(ng) : 0;
    sB[i] = gt4 ? 255 * Math.sin(nb) : 0;

    u3[i] = Math.random();
  }

  // one in2 point
  function rollIn2(j){
    u1[j] = Math.random();                                   // LOW or HIGH
    u2[j] = Math.random();                                   // value when LOW
  }

  for (let i = 0; i < N; i++) roll(i);
  for (let j = 0; j < M; j++) rollIn2(j);

  function resize(){
    cellW = window.innerWidth / COLS;
    cellH = window.innerHeight / ROWS;
    dirty = true;
  }

  function reroll(){
    if (REROLL >= 1){
      for (let i = 0; i < N; i++) roll(i);
      for (let j = 0; j < M; j++) rollIn2(j);
      return;
    }
    const count = Math.round(N * REROLL);
    for (let k = 0; k < count; k++) roll((Math.random() * N) | 0);
    const countIn2 = Math.round(M * REROLL);
    for (let k = 0; k < countIn2; k++) rollIn2((Math.random() * M) | 0);
  }

  let mx = window.innerWidth * 0.5, my = window.innerHeight * 0.5;
  let tx = mx, ty = my;
  window.addEventListener("pointermove", (e) => { tx = e.clientX; ty = e.clientY; });

  function render(){
    // in2.a at its own resolution
    const in2W = window.innerWidth / IN2_COLS, in2H = window.innerHeight / IN2_ROWS;
    let j = 0;
    for (let r = 0; r < IN2_ROWS; r++){
      const dy = (r + 0.5) * in2H - my;
      for (let c = 0; c < IN2_COLS; c++, j++){
        const dx = (c + 0.5) * in2W - mx;
        const d = Math.sqrt(dx*dx + dy*dy);
        const pLow = d < CURSOR_RADIUS ? P_LOW + CURSOR_BOOST * (1 - d / CURSOR_RADIUS) : P_LOW;
        thrC[j] = u1[j] < pLow ? u2[j] * LOW_MAX : HIGH_MIN + u2[j] * (HIGH_MAX - HIGH_MIN);
      }
    }

    const R2 = CURSOR_RADIUS * CURSOR_RADIUS;
    let i = 0, p = 0;
    for (let y = 0; y < ROWS; y++){
      const a0 = in2Row[y];
      const dy = (y + 0.5) * cellH - my;
      for (let x = 0; x < COLS; x++, i++, p += 4){
        const thr = thrC[a0 + in2Col[x]];                      // in2.a

        // blue knocked out near the cursor, fading to nothing at CURSOR_RADIUS
        const dx = (x + 0.5) * cellW - mx;
        const d2 = dx*dx + dy*dy;
        const cut = d2 < R2 ? BLUE_CUT * (1 - Math.sqrt(d2) / CURSOR_RADIUS) : 0;

        px[p]     = cmpR[i] > thr ? sR[i] : 0;                // gt_29 * ... -> sin
        px[p + 1] = cmpG[i] > thr ? sG[i] : 0;
        px[p + 2] = cmpB[i] > thr && u3[i] >= cut ? sB[i] : 0;
        px[p + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);
  }

  let last = 0, acc = 0;
  function loop(ts){
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts;

    if (REROLL > 0){
      acc += dt;
      const step = 1 / TICK_FPS;
      if (acc >= step){ acc %= step; reroll(); dirty = true; }
    }

    const k = 1 - Math.pow(1 - SMOOTH, dt * 60);              // same follow speed at any frame rate
    const nx = mx + (tx - mx) * k;
    const ny = my + (ty - my) * k;
    if (Math.abs(nx - mx) > 0.1 || Math.abs(ny - my) > 0.1) dirty = true;
    mx = nx; my = ny;

    if (dirty){ render(); dirty = false; }
    requestAnimationFrame(loop);
  }

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(loop);
})();

// ===== Edge creatures (7–13), white OR transparent per square (difference blend) =====
window.addEventListener("DOMContentLoaded", () => {
  const layer = document.getElementById("creature-layer");
  if (!layer) return;

  const randInt = (a,b) => Math.floor(a + Math.random()*(b-a+1));
  const rand = (a,b) => a + Math.random()*(b-a);

  const creatureCount = randInt(7, 13);

  const cols = 10, rows = 10, cellSize = 5;
  const baseW = cols * cellSize; // 50
  const baseH = rows * cellSize; // 50
  const N = cols * rows;

  const base = new Float32Array(N);
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const maxDist = Math.sqrt(cx*cx + cy*cy);

  let k = 0;
  for (let y=0; y<rows; y++){
    for (let x=0; x<cols; x++){
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx*dx + dy*dy);
      let t = dist / maxDist; if (t>1) t=1;
      base[k++] = 1 - t;
    }
  }

  function edgePosition(margin=18){
    const w = window.innerWidth;
    const h = window.innerHeight;
    const edge = randInt(0,3);
    let x, y;

    if (edge === 0){
      x = rand(margin, w - margin);
      y = rand(margin, margin + 90);
    } else if (edge === 1){
      x = rand(margin, w - margin);
      y = rand(h - margin - 90, h - margin);
    } else if (edge === 2){
      x = rand(margin, margin + 90);
      y = rand(margin, h - margin);
    } else {
      x = rand(w - margin - 90, w - margin);
      y = rand(margin, h - margin);
    }
    return {x,y};
  }

  function makeCreature(){
    const c = document.createElement("canvas");
    c.className = "creature";
    c.width = baseW;
    c.height = baseH;

    const size = rand(35, 65);
    c.style.width = `${size}px`;
    c.style.height = `${size}px`;

    const p = edgePosition();
    c.style.left = `${p.x}px`;
    c.style.top  = `${p.y}px`;

    layer.appendChild(c);

    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    const alpha = new Float32Array(N);
    const timers = new Float32Array(N);
    const intervals = new Float32Array(N);

    const minInterval = 1.6;
    const maxInterval = 6.0;

    for (let i=0; i<N; i++){
      intervals[i] = rand(minInterval, maxInterval);
      timers[i] = rand(0, intervals[i]);
      alpha[i] = base[i] * Math.random();
    }

    function draw(){
      ctx.clearRect(0,0,baseW,baseH);
      let i = 0;
      for (let y=0; y<rows; y++){
        for (let x=0; x<cols; x++){
          const a = alpha[i];
          if (a > 0.01){
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            ctx.fillRect(x*cellSize, y*cellSize, cellSize, cellSize);
          }
          i++;
        }
      }
    }

    let last = null;
    function tick(ts){
      if (last === null) last = ts;
      const dt = Math.min(0.1, (ts - last) / 1000);   // clamp: tab switches give huge dt
      last = ts;

      for (let i=0; i<N; i++){
        timers[i] += dt;
        if (timers[i] >= intervals[i]){
          timers[i] %= intervals[i];
          intervals[i] = rand(minInterval, maxInterval);
          alpha[i] = base[i] * Math.random();
        }
      }
      draw();
      requestAnimationFrame(tick);
    }

    draw();
    requestAnimationFrame(tick);

    async function lifecycle(){
      while (true){
        c.style.opacity = "0";

        await new Promise(r => setTimeout(r, randInt(2200, 9000)));

        const p = edgePosition();
        c.style.left = `${p.x}px`;
        c.style.top  = `${p.y}px`;

        const size = rand(35, 65);
        c.style.width = `${size}px`;
        c.style.height = `${size}px`;

        c.style.opacity = String(rand(0.35, 0.75));

        await new Promise(r => setTimeout(r, randInt(1800, 6500)));

        c.style.opacity = "0";
      }
    }
    lifecycle();

    return c;
  }

  const creatures = [];
  for (let i=0; i<creatureCount; i++){
    creatures.push(makeCreature());
  }

  window.addEventListener("resize", () => {
    for (const c of creatures){
      const p = edgePosition();
      c.style.left = `${p.x}px`;
      c.style.top  = `${p.y}px`;
    }
  });
});
