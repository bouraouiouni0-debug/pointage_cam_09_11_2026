const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || "user1234";   // même clé dans le sketch
const PAGE_USER = process.env.PAGE_USER || "";             // optionnel : protège la page
const PAGE_PASS = process.env.PAGE_PASS || "";

const DATA = path.join(__dirname, "data");
const PHOTOS = path.join(DATA, "photos");
const ROWS = path.join(DATA, "rows.json");
fs.mkdirSync(PHOTOS, { recursive: true });
let rows = fs.existsSync(ROWS) ? JSON.parse(fs.readFileSync(ROWS, "utf8")) : [];
const save = () => fs.writeFileSync(ROWS, JSON.stringify(rows));

// ---- protection optionnelle de la page ----
function auth(req, res, next) {
  if (!PAGE_USER) return next();
  const h = req.headers.authorization || "";
  const [u, p] = Buffer.from(h.split(" ")[1] || "", "base64").toString().split(":");
  if (u === PAGE_USER && p === PAGE_PASS) return next();
  res.set("WWW-Authenticate", 'Basic realm="Pointage"').status(401).send("Acces refuse");
}

// ---- reception depuis l'ESP32 ----
app.post("/api/pointage", express.raw({ type: "*/*", limit: "5mb" }), (req, res) => {
  if (req.headers["x-api-key"] !== API_KEY) return res.status(401).send("cle invalide");
  if (!req.body || !req.body.length) return res.status(400).send("pas de photo");

  const now = new Date();
  const type = (req.headers["x-type"] || "?").toString().toUpperCase();
  const time = req.headers["x-time"] && req.headers["x-time"] !== "NON_SYNC"
    ? req.headers["x-time"]
    : now.toLocaleTimeString("fr-FR", { timeZone: "Africa/Tunis" });
  const date = req.headers["x-date"] && req.headers["x-date"] !== "NON_SYNC"
    ? req.headers["x-date"]
    : now.toLocaleDateString("fr-FR", { timeZone: "Africa/Tunis" });
  let name = (req.headers["x-filename"] || "photo_" + Date.now() + ".jpg")
    .toString().replace(/[^a-zA-Z0-9_.-]/g, "");
  if (!name.endsWith(".jpg")) name += ".jpg";

  fs.writeFileSync(path.join(PHOTOS, name), req.body);
  rows.push({ type, time, date, photo: name });
  save();
  console.log("OK", type, date, time, name);
  res.send("OK");
});

// ---- consultation ----
app.use("/photos", auth, express.static(PHOTOS));
app.get("/api/rows", auth, (req, res) => res.json(rows));

app.get("/historique.csv", auth, (req, res) => {
  const csv = "Type;Temps;Date;Photo\n" +
    rows.map(r => `${r.type};${r.time};${r.date};${r.photo}`).join("\n");
  res.set("Content-Type", "text/csv").set("Content-Disposition", "attachment; filename=historique.csv").send(csv);
});

app.get("/", auth, (req, res) => {
  res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pointage</title>
<style>
 body{font-family:Arial,sans-serif;margin:20px;background:#f4f6f8}
 h1{margin-bottom:5px} a.btn{display:inline-block;margin:8px 0;padding:8px 14px;background:#1565c0;color:#fff;border-radius:6px;text-decoration:none}
 table{border-collapse:collapse;width:100%;background:#fff}
 th,td{border:1px solid #ccc;padding:8px;text-align:center}
 th{background:#263238;color:#fff}
 img{height:90px;border-radius:4px;cursor:pointer}
 .IN{color:#2e7d32;font-weight:bold}.OUT{color:#c62828;font-weight:bold}
</style></head><body>
<h1>Tableau de pointage</h1>
<a class="btn" href="/historique.csv">Telecharger CSV</a>
<table><thead><tr><th>IN/OUT</th><th>Heure</th><th>Date</th><th>Photo</th></tr></thead><tbody id="t"></tbody></table>
<script>
async function load(){
  const r = await (await fetch('/api/rows')).json();
  document.getElementById('t').innerHTML = r.reverse().map(x =>
    '<tr><td class="'+x.type+'">'+x.type+'</td><td>'+x.time+'</td><td>'+x.date+
    '</td><td><a href="/photos/'+x.photo+'" target="_blank"><img src="/photos/'+x.photo+'"></a></td></tr>').join('');
}
load(); setInterval(load, 5000);
</script></body></html>`);
});

app.listen(PORT, () => console.log("Serveur pointage sur le port " + PORT));
