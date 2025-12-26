const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// 🔹 réservations gardées en mémoire
let reservations = [];
let totalMoney = 0;

// 🔹 API appelée par le service réservation pour enregistrer un ticket
app.post("/reservation", (req, res) => {
  const r = req.body;

  r.startTime = null;  // pas encore entré
  r.endTime = null;
  r.total = 0;

  reservations.push(r);

  res.json({ ok: true });
});

// 🔹 agent marque ENTRÉE
app.post("/enter", (req, res) => {
  const { code } = req.body;

  const r = reservations.find(x => x.code === code);

  if (!r) return res.json({ error: "Ticket inconnu" });
  if (r.startTime) return res.json({ error: "Entrée déjà enregistrée" });

  r.startTime = Date.now();

  res.json({ message: "Entrée enregistrée" });
});

// 🔹 agent marque SORTIE + FACTURE + LIBÉRATION PLACE
app.post("/exit", (req, res) => {
  const { code } = req.body;

  const r = reservations.find(x => x.code === code);

  if (!r) return res.json({ error: "Ticket inconnu" });
  if (!r.startTime) return res.json({ error: "Entrée non enregistrée" });

  r.endTime = Date.now();

  // durée arrondie à l'heure supérieure
  const hours = Math.ceil((r.endTime - r.startTime) / (1000 * 60 * 60));

  const pricePerHour = 100;
  const advance = 50;

  const price = hours * pricePerHour;
  const totalToPay = Math.max(price - advance, 0);

  r.total = totalToPay;

  totalMoney += totalToPay;

  // 🔥🔥 libérer la place automatiquement 🔥🔥
  if (r.spot) {
    r.spot.free = true;
  }

  res.json({
    hours,
    price,
    advance,
    totalToPay,
    message: "Sortie enregistrée — place libérée"
  });
});

// 🔹 admin dashboard
app.get("/admin", (req, res) => {
  res.json({
    totalMoney,
    reservations
  });
});

app.listen(3003, () => console.log("🧾 Billing service running 3003"));
