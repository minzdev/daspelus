/**
 * Seed script: Memastikan akun default untuk:
 * 1. Admin Pusbang (Darat, Laut, Udara)
 * 2. Pimpinan UPT (untuk setiap UPT aktif di database)
 * 3. Admin UPT (untuk setiap UPT aktif di database jika belum ada)
 *
 * Jalankan: node scripts/seed-roles.js
 * Aman dijalankan berulang kali (idempotent / tidak menduplikasi data).
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const bcrypt = require("bcryptjs");
const { testConnection } = require("../src/lib/database");
const { sequelize, models } = require("../src/models");
const { User, Upt } = models;

const PUSBANG_ACCOUNTS = [
  {
    name: "Pusbang SDM Perhubungan Darat",
    email: "pusbang.darat@bpsdmp.dephub.go.id",
    matra: "darat",
    phone: "628111000101",
  },
  {
    name: "Pusbang SDM Perhubungan Laut",
    email: "pusbang.laut@bpsdmp.dephub.go.id",
    matra: "laut",
    phone: "628111000102",
  },
  {
    name: "Pusbang SDM Perhubungan Udara",
    email: "pusbang.udara@bpsdmp.dephub.go.id",
    matra: "udara",
    phone: "628111000103",
  },
];

const DEFAULT_PASSWORD_PUSBANG = process.env.SEED_PUSBANG_PASSWORD || "Pusbang123!";
const DEFAULT_PASSWORD_PIMPINAN = process.env.SEED_PIMPINAN_PASSWORD || "Pimpinan123!";
const DEFAULT_PASSWORD_UPT = process.env.SEED_UPT_PASSWORD || "AdminUpt123!";

function cleanCode(code) {
  return String(code || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\-]+/g, "");
}

async function seedRoles() {
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error("[fatal] Tidak bisa terhubung ke database.");
    process.exit(1);
  }

  await sequelize.sync();
  console.log("=== SINKRONISASI AKUN PERAN (ROLES) ===");

  const salt = await bcrypt.genSalt(10);
  const hashPusbang = await bcrypt.hash(DEFAULT_PASSWORD_PUSBANG, salt);
  const hashPimpinan = await bcrypt.hash(DEFAULT_PASSWORD_PIMPINAN, salt);
  const hashUpt = await bcrypt.hash(DEFAULT_PASSWORD_UPT, salt);

  // 1. Akun Admin Pusbang (Darat, Laut, Udara)
  console.log("\n[1/3] Menyiapkan Akun Admin Pusbang...");
  for (const p of PUSBANG_ACCOUNTS) {
    const existing = await User.findOne({ where: { email: p.email } });
    if (existing) {
      await existing.update({
        name: p.name,
        role: "PUSBANG",
        pusbangMatra: p.matra,
        isActive: true,
      });
      console.log(`  ✓ Update Pusbang: ${p.email} [${p.matra}]`);
    } else {
      await User.create({
        name: p.name,
        email: p.email,
        password: hashPusbang,
        phone: p.phone,
        role: "PUSBANG",
        pusbangMatra: p.matra,
        isActive: true,
      });
      console.log(`  + Dibuat Pusbang: ${p.email} [${p.matra}]`);
    }
  }

  // 2. Ambil semua UPT di database
  const uptList = await Upt.findAll({ order: [["name", "ASC"]] });
  console.log(`\n[2/3] Ditemukan ${uptList.length} UPT. Menyiapkan akun Pimpinan UPT & Admin UPT...`);

  let pimpinanCreated = 0;
  let pimpinanUpdated = 0;
  let uptAdminCreated = 0;
  let uptAdminSkipped = 0;

  for (const upt of uptList) {
    const slug = cleanCode(upt.code || upt.id.slice(0, 8));

    // Akun Pimpinan UPT
    const pimpinanEmail = `pimpinan.${slug}@bpsdmp.dephub.go.id`;
    const existPimpinan = await User.findOne({
      where: {
        [sequelize.Sequelize.Op.or]: [
          { email: pimpinanEmail },
          { uptId: upt.id, role: "PIMPINAN_UPT" },
        ],
      },
    });

    if (existPimpinan) {
      await existPimpinan.update({
        uptId: upt.id,
        role: "PIMPINAN_UPT",
        isActive: true,
      });
      pimpinanUpdated++;
    } else {
      await User.create({
        name: `Pimpinan ${upt.name}`,
        email: pimpinanEmail,
        password: hashPimpinan,
        phone: "6281200000001",
        role: "PIMPINAN_UPT",
        uptId: upt.id,
        isActive: true,
      });
      pimpinanCreated++;
      console.log(`  + Pimpinan UPT: ${pimpinanEmail} (${upt.code})`);
    }

    // Akun Admin UPT (buat jika UPT ini belum memiliki user UPT_ADMIN sama sekali)
    const existUptAdmin = await User.findOne({
      where: { uptId: upt.id, role: "UPT_ADMIN" },
    });

    if (!existUptAdmin) {
      const uptEmail = `admin.${slug}@bpsdmp.dephub.go.id`;
      const emailTaken = await User.findOne({ where: { email: uptEmail } });
      if (!emailTaken) {
        await User.create({
          name: `Admin ${upt.name}`,
          email: uptEmail,
          password: hashUpt,
          phone: "6281200000002",
          role: "UPT_ADMIN",
          uptId: upt.id,
          isActive: true,
        });
        uptAdminCreated++;
        console.log(`  + Admin UPT: ${uptEmail} (${upt.code})`);
      }
    } else {
      uptAdminSkipped++;
    }
  }

  console.log(`\n[3/3] Ringkasan:`);
  console.log(`  - Pusbang: 3 akun aktif (Password default: ${DEFAULT_PASSWORD_PUSBANG})`);
  console.log(`  - Pimpinan UPT: ${pimpinanCreated} dibuat baru, ${pimpinanUpdated} diverifikasi (Password default: ${DEFAULT_PASSWORD_PIMPINAN})`);
  console.log(`  - Admin UPT: ${uptAdminCreated} dibuat baru, ${uptAdminSkipped} sudah ada sebelumnya (Password default: ${DEFAULT_PASSWORD_UPT})`);
  console.log("\n=== SELESAI DENGAN SUKSES ===");
}

if (require.main === module) {
  seedRoles()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[fatal] Gagal seed roles:", err);
      process.exit(1);
    });
}

module.exports = { seedRoles };
