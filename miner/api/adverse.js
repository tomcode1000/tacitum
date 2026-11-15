// GET /api/adverse?query=<company or person>  ->  adverse-media screen (Telegraph NEWS_SEARCH_GENERAL)
import { screen } from "../lib/adverse.js";

export default async function handler(req, res) {
  // Read-only and keyless, so any page (the Tacitum demo included) may call it.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  const query = req.query?.query ?? req.body?.query;
  try {
    const out = await screen(query);
    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
    res.status(200).json(out);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message, cause: err.cause?.code || err.cause?.message, status: err.status || 502 });
  }
}
