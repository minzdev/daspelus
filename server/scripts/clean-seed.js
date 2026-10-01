/**
 * Clean seed UPT: hapus 5 UPT contoh + data terkait (Target, Realization, dll)
 * Jalankan: npm run clean:seed  (dari folder server)
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { sequelize, Upt, Target, Realization, Submission, UnlockRequest, TargetSubmission, User } = require("../src/models");

const SEED_CODES = ["STIP", "PIP-SMG", "PIP-MKS", "POLTEKPEL-SBY", "BP2TD-PLG"];

async function main() {
  const { testConnection } = require("../src/lib/database");
  const ok = await testConnection();
  if (!ok) { console.error("[fatal] Tidak bisa terhubung ke MySQL."); process.exit(1); }
  await sequelize.sync({ alter: true });

  console.log(`[clean] Mencari UPT seed: ${SEED_CODES.join(", ")}`);
  const upts = await Upt.findAll({ where: { code: SEED_CODES } });
  if (upts.length === 0) {
    console.log("[clean] Tidak ada UPT seed yang ditemukan. Selesai.");
    process.exit(0);
  }
  console.log(`[clean] Ditemukan ${upts.length} UPT seed:`);
  upts.forEach(u => console.log(` - ${u.code} | ${u.name} | ${u.id}`));

  for (const upt of upts) {
    const t = await sequelize.transaction();
    try {
      const delTarget = await Target.destroy({ where: { uptId: upt.id }, transaction: t });
      const delReal = await Realization.destroy({ where: { uptId: upt.id }, transaction: t });
      const delSub = await Submission.destroy({ where: { uptId: upt.id }, transaction: t });
      const delUnlock = await UnlockRequest.destroy({ where: { uptId: upt.id }, transaction: t });
      const delTS = await TargetSubmission.destroy({ where: { uptId: upt.id }, transaction: t });
      await User.update({ uptId: null }, { where: { uptId: upt.id }, transaction: t });
      await upt.destroy({ transaction: t });
      await t.commit();
      console.log(`[ok] Hapus ${upt.code}: Target=${delTarget}, Realization=${delReal}, Submission=${delSub}, Unlock=${delUnlock}, TargetSubmission=${delTS}`);
    } catch (e) {
      await t.rollback();
      console.error(`[fail] Gagal hapus ${upt.code}:`, e.message);
    }
  }

  const remaining = await Upt.count();
  console.log(`\n=== SELESAI === Sisa UPT di DB: ${remaining}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
