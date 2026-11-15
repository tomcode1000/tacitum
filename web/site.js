// Shared header, footer, icons and helpers for every Tacitum page.
const T = (window.T = {});
T.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
T.short = (h, a = 6, b = 4) => (h && h.length > a + b + 2 ? `${h.slice(0, a)}…${h.slice(-b)}` : h || "");

const P = (d) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
T.icon = {
  arrow: P('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  eye: P('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: P('<path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.2 6.2A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.8-1.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  wallet: P('<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="14" r="1.2"/>'),
  receipt: P('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  shield: P('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  layers: P('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
  key: P('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>'),
  search: P('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  doc: P('<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>'),
  code: P('<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>'),
  coins: P('<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.6-2.4-2.9-5.5-3"/>'),
  news: P('<path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5"/>'),
  check: P('<path d="M5 12l5 5L20 7"/>'),
};
const VI = {
  CLEAR: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  REVIEW: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="3" fill="currentColor"/></svg>',
  FLAG: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5l4.8 8.6H1.2z" fill="currentColor"/></svg>',
  INFO: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6 5.2v3.3M6 3.4v.2" stroke="currentColor" stroke-width="1.4"/></svg>',
};
T.chip = (v, solid = false) => `<span class="chip v-${v}${solid ? " solid" : ""}">${VI[v] || ""}${v}</span>`;
T.CHECK = { sanctions: "Sanctions", registry: "Company registry", filings: "Regulatory filings", news: "Adverse news" };

const LOGO = '<svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#ECEFF4"/><rect x="7" y="13" width="18" height="6" rx="1.5" fill="#0A0C10"/><rect x="7" y="9" width="10" height="2" rx="1" fill="#D9B36C"/></svg>';
const PAGES = [
  ["how-it-works.html", "How it works"],
  ["live-run.html", "Live run"],
  ["privacy.html", "Privacy"],
  ["pool.html", "Screened pool"],
  ["miner.html", "Adverse media"],
  ["docs.html", "Docs"],
];
const REPO = "https://github.com/tomcode1000/tacitum";

function chrome() {
  const here = location.pathname.split("/").pop() || "index.html";
  const solid = document.body.dataset.head === "solid";
  document.body.insertAdjacentHTML("afterbegin", `
  <a class="sr" href="#main">Skip to content</a>
  <header class="site-head${solid ? " always" : ""}" id="site-head">
    <div class="wrap">
      <a class="logo" href="index.html" aria-label="Tacitum home">${LOGO}Tacitum</a>
      <nav class="nav" id="nav" aria-label="Main">${PAGES.map(([h, l]) => `<a href="${h}"${h === here ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
      <div class="head-cta"><a class="btn ghost sm" href="${REPO}">GitHub</a><a class="btn light sm" href="live-run.html">See it run</a></div>
      <button class="menu-btn" id="menu-btn" aria-expanded="false" aria-controls="nav">Menu</button>
    </div>
  </header>`);
  document.body.insertAdjacentHTML("beforeend", `
  <footer class="site-foot">
    <div class="wrap">
      <div><a class="logo" href="index.html" style="padding:0;color:var(--text)">${LOGO}Tacitum</a><p style="margin-top:16px;max-width:34ch">The private, compliant buying layer for Telegraph. Screen anyone. Tell no one. Prove everything. Built for Telegraph Hackathon Season II, Mission 03.</p></div>
      <div><h5>Product</h5><a href="how-it-works.html">How it works</a><a href="live-run.html">Live run</a><a href="pool.html">Screened pool</a><a href="miner.html">Adverse-media miner</a></div>
      <div><h5>Evidence</h5><a href="privacy.html">Privacy results</a><a href="${REPO}/tree/main/assessments">Assessment memos</a><a href="${REPO}/tree/main/evidence">Paid-call receipts</a><a href="${REPO}/blob/main/PLAN.md">Build plan</a></div>
      <div><h5>Build</h5><a href="docs.html">Documentation</a><a href="${REPO}">Source on GitHub</a><a href="https://x.com/Toluinweb3">X: @Toluinweb3</a></div>
      <div class="fine"><span>Runs on Ethereum Sepolia with test USDC. Every figure on this site comes from committed evidence.</span><span id="built-at"></span></div>
    </div>
  </footer>`);
  const head = document.getElementById("site-head");
  const onScroll = () => head.classList.toggle("solid", scrollY > 40);
  if (!solid) { addEventListener("scroll", onScroll, { passive: true }); onScroll(); }
  const btn = document.getElementById("menu-btn"), nav = document.getElementById("nav");
  btn.onclick = () => { const open = nav.classList.toggle("open"); btn.setAttribute("aria-expanded", String(open)); };
  // <i data-i="arrow"></i> placeholders become inline icons
  document.querySelectorAll("[data-i]").forEach((el) => (el.outerHTML = T.icon[el.dataset.i] || ""));
  const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))), { threshold: 0.12 });
  document.querySelectorAll(".reveal-up").forEach((el) => io.observe(el));
}
chrome();

T.data = fetch("data.json").then((r) => r.json()).then((d) => {
  T.sig = (h) => (h ? `<a class="mono" href="${d.node}/engine/v1/signal/${h}" target="_blank" rel="noopener" title="${h}">${T.short(h, 8, 6)}</a>` : "");
  T.tx = (h) => (h ? `<a class="mono" href="https://sepolia.etherscan.io/tx/${h}" target="_blank" rel="noopener" title="${h}">${T.short(h, 8, 6)}</a>` : "");
  T.addr = (a) => (a ? `<a class="mono" href="https://sepolia.etherscan.io/address/${a}" target="_blank" rel="noopener" title="${a}">${T.short(a)}</a>` : "");
  const b = document.getElementById("built-at");
  if (b) b.textContent = `Data built ${new Date(d.builtAt).toUTCString().slice(5, 16)}`;
  return d;
});

// .hover-words: a magnifying lens along the line. Each letter's size and weight follow a bell
// curve around the pointer (up to MAX times larger right under it), so the text zooms in where
// the mouse is, like a dock. Screen readers still read the original sentence.
document.querySelectorAll(".hover-words").forEach((el) => {
  const MAX = 2.4, SIGMA = 46; // peak scale, lens radius in px
  const text = el.textContent.trim();
  el.setAttribute("aria-label", text);
  el.innerHTML = text.split(/\s+/).map((w) => `<span class="w" aria-hidden="true">${[...w].map((ch) => `<span class="c">${T.esc(ch)}</span>`).join("")}</span>`).join("");
  const chars = [...el.querySelectorAll(".c")];
  let centers = [], frame = 0, px = null;
  const measure = () => { centers = chars.map((c) => { const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); };
  const base = () => parseFloat(getComputedStyle(el).fontSize);
  const paint = () => {
    frame = 0;
    const b = base();
    chars.forEach((c, i) => {
      const dx = px.x - centers[i].x, dy = (px.y - centers[i].y) * 1.6;
      const k = Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA));
      const s = 1 + (MAX - 1) * k;
      c.style.fontSize = `${(b * s).toFixed(2)}px`;
      c.style.fontWeight = String(Math.round(600 + 250 * k));
      c.classList.toggle("hot", k > 0.35);
    });
  };
  el.addEventListener("pointerenter", () => { measure(); el.classList.add("live"); });
  el.addEventListener("pointermove", (e) => { px = { x: e.clientX, y: e.clientY }; if (!frame) frame = requestAnimationFrame(paint); });
  el.addEventListener("pointerleave", () => {
    el.classList.remove("live");
    if (frame) cancelAnimationFrame(frame), (frame = 0);
    chars.forEach((c) => { c.style.fontSize = ""; c.style.fontWeight = ""; c.classList.remove("hot"); });
  });
  addEventListener("resize", () => (centers = []));
});
