/**
 * Kosongkan DATA untuk go-live bersih.
 * SELALU DIHAPUS (transaksional): targets, target_submissions, realizations,
 *   realization_diklats, submissions, unlock_requests, diklats, grad_absorptions,
 *   absorption_submissions, tarunas, taruna_submissions, notifications, activity_logs.
 * DIPERTAHANKAN: users, upts.
 * Dengan flag --full: programs + prodis ikut dikosongkan (master diinput ulang dari menu).
 *
 * Jalankan DI VPS PRODUKSI:
 *   npm run clean:production -- --yes            (transaksional saja)
 *   npm run clean:production -- --yes --full    (termasuk programs + prodis)
 * (flag --yes wajib sebagai pengaman agar tak terpencet.)
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { sequelize } = require("../src/models");
const {
  Target, TargetSubmission, Realization, RealizationDiklat, Submission,
  UnlockRequest, Diklat, GradAbsorption, AbsorptionSubmission,
  Taruna, TarunaSubmission, Notification, ActivityLog, Program, Prodi,
} = require("../src/models");

async function main() {
  if (!process.argv.includes("--yes")) {
    console.error("BATAL: tambahkan flag --yes untuk konfirmasi penghapusan.");
    console.error("Contoh: npm run clean:production -- --yes [--full]");
    process.exit(1);
  }
  const full = process.argv.includes("--full");
  const { testConnection } = require("../src/lib/database");
  const ok = await testConnection();
  if (!ok) { console.error("[fatal] Tidak bisa terhubung ke MySQL."); process.exit(1); }

  const targets = [
    ["notifications", Notification],
    ["activity_logs", ActivityLog],
    ["unlock_requests", UnlockRequest],
    ["target_submissions", TargetSubmission],
    ["targets", Target],
    ["realization_diklats", RealizationDiklat],
    ["realizations", Realization],
    ["submissions", Submission],
    ["grad_absorptions", GradAbsorption],
    ["absorption_submissions", AbsorptionSubmission],
    ["tarunas", Taruna],
    ["taruna_submissions", TarunaSubmission],
    ["diklats", Diklat],
  ];

  const t = await sequelize.transaction();
  try {
    for (const [label, model] of targets) {
      const n = await model.destroy({ where: {}, truncate: false, transaction: t });
      console.log(`[ok] ${label}: ${n} baris dihapus`);
    }
    if (full) {
      // Master dihapus TERAKHIR (setelah semua yang mereferensinya bersih)
      const nProdi = await Prodi.destroy({ where: {}, truncate: false, transaction: t });
      console.log(`[ok] prodis: ${nProdi} baris dihapus`);
      const nProg = await Program.destroy({ where: {}, truncate: false, transaction: t });
      console.log(`[ok] programs: ${nProg} baris dihapus`);
    }
    await t.commit();
  } catch (e) {
    await t.rollback();
    console.error("[fail]", e.message);
    process.exit(1);
  }

  const { User, Upt, Program: ProgramM, Prodi: ProdiM } = require("../src/models");
  const [users, upts, programs, prodis] = await Promise.all([
    User.count(), Upt.count(), ProgramM.count(), ProdiM.count(),
  ]);
  console.log(`\n=== SELESAI === dipertahankan: users=${users}, upts=${upts}, programs=${programs}, prodis=${prodis}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
