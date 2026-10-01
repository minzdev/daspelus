/**
 * Seed script: membuat admin pertama + UPT contoh + program + target PK contoh.
 * Jalankan: npm run seed   (dari folder server)
 * Env opsional: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const bcrypt = require("bcryptjs");
const { testConnection } = require("../src/lib/database");
const { sequelize, models } = require("../src/models");
const { User, Upt, Program, Target } = models;

const SAMPLE_UPTS = [
  { code: "STIP", name: "Sekolah Tinggi Ilmu Pelayaran Jakarta", province: "DKI Jakarta", matra: "darat" },
  { code: "PIP-SMG", name: "Politeknik Ilmu Pelayaran Semarang", province: "Jawa Tengah", matra: "laut" },
  { code: "PIP-MKS", name: "Politeknik Ilmu Pelayaran Makassar", province: "Sulawesi Selatan", matra: "laut" },
  { code: "POLTEKPEL-SBY", name: "Politeknik Pelayaran Surabaya", province: "Jawa Timur", matra: "laut" },
  { code: "BP2TD-PLG", name: "Balai Pendidikan dan Pelatihan Transportasi Darat Palembang", province: "Sumatera Selatan", matra: "darat" },
];

const PROGRAMS = [
  // === TARUNA ===
  { name: "Diklat Dasar", order: 1, isParent: true, category: "taruna" },
  { name: "Diklat Dasar Kelas I", parentName: "Diklat Dasar", order: 1, category: "taruna" },
  { name: "Diklat Dasar Kelas II", parentName: "Diklat Dasar", order: 2, category: "taruna" },
  { name: "Diklat Teknis", order: 2, isParent: true, category: "taruna" },
  { name: "Diklat Teknis Kapal", parentName: "Diklat Teknis", order: 1, category: "taruna" },
  { name: "Diklat Teknis Darat", parentName: "Diklat Teknis", order: 2, category: "taruna" },
  { name: "Diklat Teknis Udara", parentName: "Diklat Teknis", order: 3, category: "taruna" },
  { name: "Diklat Spesialis", order: 3, isParent: true, category: "taruna" },
  { name: "Spesialis Pelayaran", parentName: "Diklat Spesialis", order: 1, category: "taruna" },
  { name: "Spesialis Transportasi", parentName: "Diklat Spesialis", order: 2, category: "taruna" },
  // === APARATUR ===
  { name: "Diklat Aparatur", order: 4, isParent: true, category: "aparatur" },
  { name: "Diklat Pembinaan Dasar", parentName: "Diklat Aparatur", order: 1, category: "aparatur" },
  { name: "Diklat Pembinaan Lanjutan", parentName: "Diklat Aparatur", order: 2, category: "aparatur" },
  { name: "Diklat Kepemimpinan", order: 5, isParent: true, category: "aparatur" },
  { name: "Kepemimpinan Dasar", parentName: "Diklat Kepemimpinan", order: 1, category: "aparatur" },
  { name: "Kepemimpinan Menengah", parentName: "Diklat Kepemimpinan", order: 2, category: "aparatur" },
  { name: "Kepemimpinan Tinggi", parentName: "Diklat Kepemimpinan", order: 3, category: "aparatur" },
  { name: "Pelatihan Teknis", order: 6, isParent: true, category: "aparatur" },
  { name: "Teknis Administrasi", parentName: "Pelatihan Teknis", order: 1, category: "aparatur" },
  { name: "Teknis Pengembangan", parentName: "Pelatihan Teknis", order: 2, category: "aparatur" },
];

async function main() {
  const dbOk = await testConnection();
  if (!dbOk) { console.error("[fatal] Tidak bisa terhubung ke MySQL."); process.exit(1); }

  await sequelize.sync({ alter: true });
  console.log("[db] Tabel sinkron.");

  const email = process.env.SEED_ADMIN_EMAIL || "admin@bpsdmp.dephub.go.id";
  const password = process.env.SEED_ADMIN_PASSWORD || "admin12345";
  const year = new Date().getFullYear();

  // 1. Admin pertama
  let adminUser = await User.findOne({ where: { email } });
  if (adminUser) {
    console.log(`[skip] Admin sudah ada: ${email}`);
  } else {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    adminUser = await User.create({
      name: "Admin BPSDMP", email, password: hash, role: "SUPER_ADMIN", isActive: true,
    });
    console.log(`[ok] Admin dibuat: ${email} / ${password}`);
  }

  // 2. UPT contoh
  for (const u of SAMPLE_UPTS) {
    const exists = await Upt.findOne({ where: { code: u.code } });
    if (exists) { console.log(`[skip] UPT ${u.code} sudah ada`); continue; }
    await Upt.create({ ...u, isActive: true });
    console.log(`[ok] UPT ditambahkan: ${u.code} - ${u.name}`);
  }

  // 3. Programs
  const parentIdMap = {};
  for (const p of PROGRAMS) {
    const exists = await Program.findOne({ where: { name: p.name } });
    if (exists) {
      if (p.isParent) parentIdMap[p.name] = exists.id;
      console.log(`[skip] Program sudah ada: ${p.name}`);
      continue;
    }
    if (p.isParent) {
      const prog = await Program.create({
        name: p.name, parentId: null, parentName: null, order: p.order || 0,
        isActive: true, isParent: true, category: p.category || "taruna",
      });
      parentIdMap[p.name] = prog.id;
      console.log(`[ok] Program induk: ${p.name} [${p.category || "taruna"}]`);
    } else {
      const parentId = parentIdMap[p.parentName];
      if (!parentId) { console.log(`[warn] Induk "${p.parentName}" belum ada untuk "${p.name}"`); continue; }
      await Program.create({
        name: p.name, parentId, parentName: p.parentName, order: p.order || 0,
        isActive: true, isParent: false, category: p.category || "taruna",
      });
      console.log(`[ok] Program anak: ${p.name} [${p.category}]`);
    }
  }

  // 4. Target PK per UPT per program
  const allUpts = await Upt.findAll();
  const allProgs = await Program.findAll({ where: { isParent: false } });
  for (const upt of allUpts) {
    for (const prog of allProgs) {
      // Bulanan (1-12)
      for (let m = 1; m <= 12; m++) {
        await Target.upsert({
          uptId: upt.id, year, month: m, programId: prog.id,
          targetPeserta: 10, targetLulusan: 5, isYearly: false, createdBy: adminUser.id,
        });
      }
    }
    console.log(`[ok] Target PK diisi untuk ${upt.code} (${allProgs.length} program × 12 bulan)`);
  }

  console.log(`\n=== SELESAI ===`);
  console.log(`Login admin: ${email} / ${password}`);
  console.log(`Tahun: ${year}`);
  console.log(`UPT: ${allUpts.length} UPT`);
  console.log(`Program: ${PROGRAMS.length} program`);
  console.log(`Target PK: sudah diisi per UPT per bulan`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed gagal:", err);
  process.exit(1);
});