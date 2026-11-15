// Tacitum adverse-media screening: the logic behind the Telegraph miner.
//
// One GDELT DOC 2.0 query per request (open data, free for any use with attribution; GDELT asks
// for at most one request every 5 seconds). GDELT matches words anywhere in an article, which is
// too loose for screening, so every headline is filtered here: it must name the entity, and it
// must contain an adverse term. Each hit is tagged with categories, and law-firm "investors may
// have claims" adverts are kept apart, because they are marketing, not reporting.

const GDELT = "https://api.gdeltproject.org/api/v2/doc/doc";

// Category -> headline patterns. Word-boundary, case-insensitive.
export const CATEGORIES = {
  sanctions: /\b(sanction(s|ed)?|ofac|embargo|asset freeze)\b/i,
  money_laundering: /\b(money[- ]launder\w*|launder\w*|anti[- ]money|aml)\b/i,
  fraud: /\b(fraud\w*|scam\w*|ponzi|embezzl\w*|misappropriat\w*|forg(ed|ery))\b/i,
  bribery_corruption: /\b(brib\w*|corrupt\w*|kickback\w*)\b/i,
  regulatory_action: /\b(fined|fines?|penalt\w*|censure\w*|enforcement action|banned|ban on|reprimand\w*|cease[- ]and[- ]desist)\b/i,
  litigation: /\b(lawsuits?|sued|sues|suing|class action|litigation|court case)\b/i,
  criminal: /\b(charged|arrest\w*|indict\w*|prosecut\w*|convicted|guilty|jailed|sentenced)\b/i,
  investigation: /\b(investigat\w*|probes?|probed|inquiry|raid\w*|subpoena\w*)\b/i,
  insolvency: /\b(bankrupt\w*|insolven\w*|liquidat\w*|administration|collapse[sd]?|default(s|ed)?)\b/i,
  data_breach: /\b(data breach|breach\w*|hack(ed|ers?)?|cyber[- ]?attack\w*|leak(ed|s)?)\b/i,
  misconduct: /\b(scandal\w*|misconduct|whistleblow\w*|manipulat\w*|rigg(ed|ing))\b/i,
};

const SOLICITATION = /\b(law firm|llc encourages|llp|shareholders? (alert|rights)|investors? (alert|to (contact|inquire))|class action filed|encourages .* (investors|stockholders)|deadline alert|rosen|pomerantz|schall|bronstein|faruqi|levi & korsinsky|glancy|bragar|kessler topaz)\b/i;

const SUFFIXES = /\b(plc|ltd|limited|llc|inc|incorporated|corp|corporation|co|company|holdings?|group|sa|ag|nv|bv|gmbh|lp|llp)\.?$/i;

export function coreName(name) {
  let n = name.trim().replace(/[.,]+$/g, "");
  for (let i = 0; i < 3 && SUFFIXES.test(n); i++) n = n.replace(SUFFIXES, "").trim().replace(/[.,]+$/g, "");
  return n || name.trim();
}

const norm = (s) => s.replace(/\s+([,.:;!?)])/g, "$1").replace(/\(\s+/g, "(").replace(/\s+/g, " ").trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function classify(title, entity) {
  const t = norm(title);
  const core = coreName(entity);
  const nameRe = new RegExp(`(^|[^\\w])${escapeRe(core)}([^\\w]|$)`, "i");
  if (!nameRe.test(t)) return null;
  // The adverse term must sit in the same clause as the entity: "Meta fined, Binance resumes
  // withdrawals" is about Meta. Clauses split on , ; : | and dashes used as separators.
  // Bracketed text such as "(LSE:BARC)" is ignored when splitting.
  const clauses = t.replace(/\([^)]*\)/g, " ").split(/\s*(?:[,;:|]|\s[-–—]\s)\s*/).filter((c) => nameRe.test(c));
  const categories = Object.entries(CATEGORIES).filter(([, re]) => clauses.some((c) => re.test(c))).map(([k]) => k);
  if (!categories.length) return null;
  // The entity fighting fraud or warning customers is not adverse media about it.
  if (ADVISORY.test(t) && categories.every((k) => ["fraud", "data_breach"].includes(k))) return null;
  return { title: t, categories, solicitation: SOLICITATION.test(t) };
}

const ADVISORY = /\b(detect\w*|anti-fraud|solutions?|technology|warns?|warning|tackles?|fights?|crack(s|ing)? down|campaign|protect\w*|tips|how to (spot|avoid)|awareness|prevent\w*|alerts? customers|urges|advice|guide)\b/i;

// GDELT filters on adverse terms server side, so 12 months of adverse coverage fits in one page
// (the newest 250 articles about a big bank only reach back a few days). Headlines are then
// filtered again here, because GDELT matches the terms anywhere in the article body.
const QUERY_TERMS = "(fraud OR laundering OR sanctions OR fined OR penalty OR lawsuit OR investigation OR probe OR charged OR bribery OR corruption OR scandal OR bankruptcy OR breach)";

const UA = { "User-Agent": "tacitum-adverse-media/0.1 (+https://github.com/tomcode1000/tacitum)" };
const day = (seen) => (seen ? `${seen.slice(0, 4)}-${seen.slice(4, 6)}-${seen.slice(6, 8)}` : null);

// GDELT: one try. On shared cloud IPs it often answers 429; the other source still runs.
async function gdelt(entity, { timespan = "12m", max = 150, timeoutMs = 5000 } = {}) {
  const q = `"${coreName(entity)}" ${QUERY_TERMS} sourcelang:english`;
  const url = `${GDELT}?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=${max}&format=json&timespan=${timespan}&sort=hybridrel`;
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    if (text.trim().startsWith("{")) {
      const items = (JSON.parse(text).articles || []).map((a) => ({ title: a.title || "", source: a.domain, url: a.url, published: day(a.seendate), country: a.sourcecountry }));
      return { name: "gdelt", url, ok: true, items };
    }
    return { name: "gdelt", url, ok: /no articles/i.test(text) || !text.trim(), items: [], note: res.status === 429 ? "rate limited" : text.slice(0, 80) };
  } catch (e) {
    return { name: "gdelt", url, ok: false, items: [], note: e.cause?.code || e.name };
  }
}

// Google News RSS search: the adverse terms and the 12-month window go in the query.
const xml = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
async function googleNews(entity, { timeoutMs = 8000 } = {}) {
  const q = `"${coreName(entity)}" ${QUERY_TERMS} when:1y`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-GB&gl=GB&ceid=GB:en`;
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
    const body = await res.text();
    const items = [...body.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
      const tag = (t) => xml((it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || "");
      const source = tag("source");
      const title = tag("title").replace(new RegExp(`\\s+-\\s+${escapeRe(source)}$`), "");
      const d = new Date(tag("pubDate"));
      return { title, source, url: tag("link"), published: isNaN(d) ? null : d.toISOString().slice(0, 10) };
    });
    return { name: "google_news_rss", url, ok: res.ok, items };
  } catch (e) {
    return { name: "google_news_rss", url, ok: false, items: [], note: e.cause?.code || e.name };
  }
}

export async function screen(query) {
  const entity = String(query || "").trim().slice(0, 256);
  if (!entity) throw Object.assign(new Error("query is required: the company or person to screen"), { status: 400 });
  const feeds = await Promise.all([gdelt(entity), googleNews(entity)]);
  if (!feeds.some((f) => f.ok)) throw Object.assign(new Error(`no news source answered (${feeds.map((f) => `${f.name}: ${f.note}`).join("; ")})`), { status: 503 });
  const articles = feeds.flatMap((f) => f.items);

  const seenTitles = new Set();
  const hits = [];
  for (const a of articles) {
    const c = classify(a.title, entity);
    if (!c) continue;
    const key = c.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").slice(0, 70);
    if (seenTitles.has(key)) continue; // syndicated copies and the same story from both feeds
    seenTitles.add(key);
    hits.push({ ...c, source: a.source, url: a.url, published: a.published, country: a.country });
  }
  hits.sort((x, y) => String(y.published).localeCompare(String(x.published)));
  const url = feeds.map((f) => f.url);

  const reporting = hits.filter((h) => !h.solicitation);
  const adverts = hits.filter((h) => h.solicitation);
  const counts = {};
  for (const h of reporting) for (const k of h.categories) counts[k] = (counts[k] || 0) + 1;
  const domains = new Set(reporting.map((h) => h.source));
  const serious = ["sanctions", "money_laundering", "fraud", "bribery_corruption", "criminal"].filter((k) => counts[k]);
  const risk = !reporting.length ? (adverts.length ? "low" : "none") : serious.length && domains.size >= 2 ? "high" : "elevated";

  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k]) => k.replace(/_/g, " "));
  // Kept small on purpose: the node reads the whole answer, and a 17 KB answer full of long
  // redirect links came back with answer/sources rejected (15 Nov). The intent's four fields
  // come first; sources are publisher names (the intent allows "URLs or names").
  const shown = reporting.slice(0, 3);
  const answer = !hits.length
    ? `No adverse media naming ${entity} found in English-language news over the last 12 months.`
    : `${reporting.length} adverse news items naming ${entity} in the last 12 months from ${domains.size} sources` +
      (top.length ? `, mainly ${top.slice(0, 3).join(", ")}` : "") + "." +
      (shown.length ? ` Latest: ${shown[0].title.replace(/["“”]/g, "")} (${shown[0].source}, ${shown[0].published}).` : "") +
      (adverts.length ? ` ${adverts.length} law-firm investor adverts not counted.` : "");
  let brief = !hits.length ? `No adverse media on ${coreName(entity)} in 12 months` : `${reporting.length} adverse items on ${coreName(entity)}, risk ${risk}`;
  if (brief.length > 80) brief = brief.slice(0, 79) + "…";

  return {
    answer,
    result_count: reporting.length,
    sources: [...domains].slice(0, 12),
    brief,
    query: entity,
    adverse: reporting.length > 0,
    risk,
    categories: counts,
    solicitations: adverts.length,
    articles: hits.slice(0, 8).map(({ title, source, published, categories, solicitation, url }) => ({ title, source, published, categories, solicitation, url })),
    scanned: articles.length,
    window: "last 12 months",
    method: "Entity name plus adverse terms searched over 12 months in GDELT DOC 2.0 and Google News RSS; kept only headlines that name the entity and contain an adverse term; copies de-duplicated across feeds; law-firm solicitations separated.",
    provenance: feeds.map((f) => ({ provider: f.name, ok: f.ok, articles: f.items.length, note: f.note })),
    checked_at: new Date().toISOString(),
  };
}
