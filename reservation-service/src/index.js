const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const app = express();
app.use(cors());
app.use(express.json());

// ------------------ PLACES ------------------
let spots = [
  { id: 1, section: "A", number: 1, floor: 0, free: true },
  { id: 2, section: "A", number: 2, floor: 0, free: true },
  { id: 3, section: "A", number: 3, floor: 1, free: true },
  { id: 4, section: "B", number: 1, floor: 0, free: true },
  { id: 5, section: "B", number: 2, floor: 1, free: true }
];

// ------------------ RESERVATIONS ------------------
let reservations = [];

const uploadDir = path.join(__dirname, "tickets");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// code aléatoire
function createCode() {
  return Math.random().toString(16).slice(2, 10);
}

// ------------------ LISTE DES PLACES LIBRES ------------------
app.get("/spots/free", (req, res) => {
  res.json(spots.filter(s => s.free));
});

// ------------------ RESERVER ------------------
app.post("/reserve", async (req, res) => {
  const { name, carNumber, spotId } = req.body;

  const spot = spots.find(s => s.id == spotId);
  if (!spot) return res.status(404).json({ error: "place introuvable" });
  if (!spot.free) return res.status(400).json({ error: "place déjà réservée" });

  spot.free = false;

  const code = createCode();

  const reservation = {
    code,
    name,
    carNumber,
    spot,
    createdAt: Date.now(),
    entryTime: null,
    exitTime: null,
    reminderSent: false,
    confirmed: false,
    extraTime: 0,
    total: 0,
    advance: 50
  };

  reservations.push(reservation);

  // QR
  const qrPayload = JSON.stringify({ code });
  const qrImage = await QRCode.toDataURL(qrPayload);

  // PDF
  const pdfPath = path.join(uploadDir, `${code}.pdf`);
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(pdfPath));

  doc.fontSize(22).text("🎫 Ticket Parking", { align: "center" }).moveDown();
  doc.fontSize(14);
  doc.text(`Nom : ${name}`);
  doc.text(`Matricule : ${carNumber}`);
  doc.text(`Section : ${spot.section}`);
  doc.text(`Place : ${spot.number}`);
  doc.text(`Étage : ${spot.floor}`);
  doc.text(`Code : ${code}`);
  doc.text(`Acompte payé : 50 DA`);

  const qrBase64 = qrImage.split(",")[1];
  const qrBuffer = Buffer.from(qrBase64, "base64");
  doc.image(qrBuffer, 150, 300, { width: 200 });

  doc.end();

  res.json({
    message: "reservation ok",
    code,
    ticket: `http://localhost:32002/ticket/${code}`
  });
});

// ------------------ ticket ------------------
app.get("/ticket/:code", (req, res) => {
  const pdf = path.join(uploadDir, `${req.params.code}.pdf`);
  res.download(pdf);
});

// ------------------ 👉 confirmer arrivée (+15 min) ------------------
app.post("/confirm/:code", (req, res) => {
  const r = reservations.find(x => x.code === req.params.code);
  if (!r) return res.status(404).json({ error: "not found" });

  r.confirmed = true;
  r.extraTime = 15 * 60 * 1000; // 15 min en ms

  res.json({ message: "arrivée confirmée" });
});

// ------------------ 👉 annuler réservation manuellement ------------------
app.post("/cancel/:code", (req, res) => {
  const r = reservations.find(x => x.code === req.params.code);
  if (!r) return res.status(404).json({ error: "not found" });

  const sp = spots.find(s => s.id === r.spot.id);
  if (sp) sp.free = true;

  r.cancelled = true;

  res.json({ message: "réservation annulée" });
});

// ------------------ ENTRÉE ------------------
app.post("/entry/:code", (req, res) => {
  const r = reservations.find(x => x.code === req.params.code);
  if (!r) return res.status(404).json({ error: "not found" });

  r.entryTime = Date.now();
  res.json({ message: "entrée enregistrée" });
});

// ------------------ SORTIE ------------------
app.post("/exit/:code", (req, res) => {
  const r = reservations.find(x => x.code === req.params.code);
  if (!r) return res.status(404).json({ error: "not found" });

  if (!r.entryTime)
    return res.status(400).json({ error: "pas encore entré" });

  r.exitTime = Date.now();

  const hours = Math.ceil((r.exitTime - r.entryTime) / (1000 * 60 * 60));
  const pricePerHour = 100;

  let total = hours * pricePerHour - r.advance;
  if (total < 0) total = 0;

  r.total = total;

  // libérer la place
  const realSpot = spots.find(s => s.id === r.spot.id);
  if (realSpot) realSpot.free = true;

  res.json({ total });
});

// ------------------ AUTO GESTION TEMPS ------------------
setInterval(() => {
  const now = Date.now();

  reservations.forEach(r => {
    if (r.entryTime) return;

    const elapsed = now - r.createdAt;

    // rappel après 45 minutes
    if (!r.reminderSent && elapsed >= 45 * 60 * 1000) {
      r.reminderSent = true;

      console.log(
        "🔔 Rappel envoyé à",
        r.name,
        "code",
        r.code,
        "(confirmer l'arrivée sinon annulation)"
      );
    }

    const allowed = 60 * 60 * 1000 + (r.extraTime || 0);

    if (elapsed >= allowed) {
      console.log("❌ Réservation annulée :", r.code);

      const sp = spots.find(s => s.id === r.spot.id);
      if (sp) sp.free = true;

      r.cancelled = true;
    }
  });

  reservations = reservations.filter(r => !r.cancelled);

}, 60 * 1000);

// ------------------ ADMIN ------------------
app.get("/admin", (req, res) => {
  const totalMoney = reservations.reduce((s, r) => s + (r.total || 0), 0);

  res.json({
    totalMoney,
    reservations
  });
});
app.get("/reservation/:code", (req, res) => {
  const r = reservations.find(x => x.code === req.params.code);

  if (!r) return res.status(404).json({ error: "not found" });

  res.json(r);
});

app.listen(32002, () =>
  console.log("📌 Reservation service running on 3002")
);
