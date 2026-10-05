const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { testConnection } = require("./lib/database");
const { sequelize } = require("./models");

if (!process.env.JWT_SECRET) {
  console.warn("[security] JWT_SECRET tidak diset di .env — memakai bawaan lemah. Wajib diganti di production!");
}

const app = express();

// Percayai header X-Forwarded-For hanya dari reverse proxy lokal (agar rate-limit baca IP asli)
app.set("trust proxy", "loopback");

// Header keamanan HTTP (tanpa CSP ketat agar build SPA + unduhan blob tetap jalan)
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Anti brute-force login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan login. Coba lagi 15 menit kemudian." },
});
app.use("/api/auth/login", loginLimiter);

// Batas umum API agar tidak disalahgunakan
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak permintaan. Coba lagi beberapa saat." },
});
app.use("/api/", apiLimiter);

// Health check
app.get("/api/health", async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: "ok", service: "Daspeslus API", db: "connected", time: new Date().toISOString() });
  } catch {
    res.json({ status: "ok", service: "Daspeslus API", db: "disconnected", time: new Date().toISOString() });
  }
});

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/upts", require("./routes/upts"));
app.use("/api/users", require("./routes/users"));
app.use("/api/targets", require("./routes/targets"));
app.use("/api/diklats", require("./routes/diklats"));
app.use("/api/programs", require("./routes/programs"));
app.use("/api/realizations", require("./routes/realizations"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/submissions", require("./routes/submissions"));
app.use("/api/unlock-requests", require("./routes/unlockRequests"));
app.use("/api/absorptions", require("./routes/absorptions"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/activity-logs", require("./routes/activityLogs"));

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint tidak ditemukan." });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error("[error]", err);
  res.status(500).json({ error: "Terjadi kesalahan pada server." });
});

const PORT = process.env.PORT || 8787;

async function start() {
  // Test koneksi DB
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error("[fatal] Tidak bisa terhubung ke MySQL. Pastikan Laragon berjalan.");
    process.exit(1);
  }

  // Sinkronkan model ke MySQL (buat tabel jika belum ada) — tanpa alter untuk hindari deadlock
  try {
    await sequelize.sync();
    console.log("[db] Model tabel sinkron dengan MySQL.");

    // Pastikan kolom type ada di tabel unlock_requests
    const [cols] = await sequelize.query("DESCRIBE unlock_requests");
    const fields = cols.map((c) => c.Field);
    if (!fields.includes("type")) {
      await sequelize.query("ALTER TABLE unlock_requests ADD COLUMN type VARCHAR(255) NOT NULL DEFAULT 'capaian' AFTER upt_type;");
      console.log("[db] Kolom 'type' berhasil ditambahkan ke tabel unlock_requests.");
    }

    // Migrasi penyerapan bulanan: kolom month di absorption_submissions & grad_absorptions
    for (const tbl of ["absorption_submissions", "grad_absorptions"]) {
      const [tcols] = await sequelize.query(`DESCRIBE \`${tbl}\``);
      const tfields = tcols.map((c) => c.Field);
      if (!tfields.includes("month")) {
        await sequelize.query(`ALTER TABLE \`${tbl}\` ADD COLUMN \`month\` INT NULL DEFAULT NULL AFTER \`quarter\`;`);
        console.log(`[db] Kolom 'month' berhasil ditambahkan ke tabel ${tbl}.`);
      }
    }
    // Unique index penyerapan bulanan (upt, tahun, bulan); NULL month (era triwulan) tidak saling konflik
    const [subIdx] = await sequelize.query("SHOW INDEX FROM `absorption_submissions`");
    if (!subIdx.some((r) => r.Key_name === "uniq_abs_sub_upt_year_month")) {
      await sequelize.query("ALTER TABLE `absorption_submissions` ADD UNIQUE INDEX `uniq_abs_sub_upt_year_month` (`upt_id`, `year`, `month`);");
      console.log("[db] Unique index penyerapan bulanan dibuat.");
    }

    // Pastikan kolom target_by_program ada di tabel diklats (untuk target independen per program)
    try {
      const [diklatCols] = await sequelize.query("DESCRIBE `diklats`");
      const diklatFields = diklatCols.map((c) => c.Field);
      if (!diklatFields.includes("target_by_program")) {
        await sequelize.query("ALTER TABLE `diklats` ADD COLUMN `target_by_program` JSON NULL DEFAULT NULL AFTER `target_lulusan`;");
        console.log("[db] Kolom 'target_by_program' berhasil ditambahkan ke tabel diklats.");
      }
    } catch (e) {
      console.warn("[db] cek kolom diklats.target_by_program:", e.message);
    }
  } catch (e) {
    console.error("[db] sync error", e.message);
  }

  const server = app.listen(PORT, () => {
    console.log(`Daspeslus API berjalan di http://localhost:${PORT}`);
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[fatal] Port ${PORT} sudah dipakai (EADDRINUSE). Matikan proses lama: netstat -ano | findstr :${PORT} lalu taskkill /PID <pid> /F, atau ganti PORT di .env`);
      process.exit(1);
    }
    console.error("[fatal] listen error", err);
    process.exit(1);
  });
}

start().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
