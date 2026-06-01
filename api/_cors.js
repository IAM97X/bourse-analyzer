const ALLOWED_ORIGINS = [
  "https://boursenext.fr",
  "https://www.boursenext.fr",
  "http://localhost:3000",
  "http://localhost:5000",
  "http://localhost:5001",
];

function checkOrigin(req, res) {
  const origin = req.headers.origin || "";
  const allowed = ALLOWED_ORIGINS.includes(origin);
  res.setHeader("Access-Control-Allow-Origin", allowed ? origin : "");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-api-key,anthropic-beta,authorization");
  if (req.method === "OPTIONS") { res.status(200).end(); return false; }
  if (!allowed) { res.status(403).json({ error: "Origine non autorisée" }); return false; }
  return true;
}

module.exports = { checkOrigin };
