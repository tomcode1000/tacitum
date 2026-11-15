export default function handler(req, res) {
  res.status(200).json({ ok: true, service: "tacitum-adverse-media", source: "GDELT DOC 2.0" });
}
