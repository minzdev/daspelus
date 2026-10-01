const express = require("express");
const { authenticate, requireAdmin, isPusbang, isSuperAdmin } = require("../middleware/auth");
const { sequelize, Upt, User, Target, Realization, Submission, UnlockRequest, TargetSubmission } = require("../models");
const { audit } = require("../lib/audit");
const { Op } = require("sequelize");

const router = express.Router();

router.use(authenticate);

const MATRA = ["darat", "laut", "udara", "aparatur"];
const UPT_TYPES = ["taruna", "aparatur"];

function normalizeMatra(raw) {
  const v = String(raw || "").trim().toLowerCase();
  return MATRA.includes(v) ? v : "";
}

function normalizeUptType(raw) {
  const v = String(raw || "").trim().toLowerCase();
  return UPT_TYPES.includes(v) ? v : "taruna";
}

/** POST /api/upts/sync-status - sinkronkan isActive semua UPT dari user aktif. */
router.post("/sync-status", requireAdmin, async (req, res) => {
  try {
    const activeUsers = await User.findAll({ where: { role: { [Op.in]: ["UPT_ADMIN", "PIMPINAN_UPT"] }, isActive: true } });
    const activeUptIds = new Set(activeUsers.filter(u => u.uptId).map(u => u.uptId));
    const allUpts = await Upt.findAll();
    for (const upt of allUpts) {
      const desired = activeUptIds.has(upt.id);
      if (upt.isActive !== desired) {
        await upt.update({ isActive: desired });
      }
    }
    res.json({ message: "Status UPT disinkronkan dengan user aktif." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menyinkronkan status UPT." });
  }
});

/** GET /api/upts - daftar UPT */
router.get("/", async (req, res) => {
  try {
    let upts = await Upt.findAll({ order: [["code", "ASC"]] });
    // Pusbang hanya lihat matra tugasnya
    if (isPusbang(req.user)) {
      const matra = (req.user.pusbangMatra || "").toLowerCase();
      upts = upts.filter((u) => (u.matra || "").toLowerCase() === matra);
    }
    res.json({ upts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil daftar UPT." });
  }
});

/** GET /api/upts/options - dropdown UPT */
router.get("/options", async (req, res) => {
  if (!isSuperAdmin(req.user) && !isPusbang(req.user)) {
    return res.status(403).json({ error: "Akses khusus Admin / Pusbang." });
  }
  try {
    let options = (await Upt.findAll({ order: [["code", "ASC"]] })).map((u) => ({
      id: u.id, code: u.code, name: u.name, matra: u.matra || "", isActive: u.isActive !== false,
    }));
    if (isPusbang(req.user)) {
      const matra = (req.user.pusbangMatra || "").toLowerCase();
      options = options.filter((o) => (o.matra || "").toLowerCase() === matra);
    }
    res.json({ options });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil opsi UPT." });
  }
});

/** POST /api/upts - buat UPT baru */
router.post("/", requireAdmin, async (req, res) => {
  const { code, name, matra, uptType } = req.body;
  if (!code || !name) return res.status(400).json({ error: "Kode dan nama UPT wajib diisi." });
  if (matra && !MATRA.includes(String(matra).trim().toLowerCase())) {
    return res.status(400).json({ error: "Matra harus darat, laut, udara, atau aparatur." });
  }
  try {
    const newCode = code.trim().toUpperCase();
    const dup = await Upt.findOne({ where: { code: newCode } });
    if (dup) return res.status(409).json({ error: `Kode UPT "${code}" sudah digunakan.` });

    const upt = await Upt.create({
      code: newCode, name: name.trim(), matra: normalizeMatra(matra), uptType: normalizeUptType(uptType), isActive: true,
    });
    audit(req, "CREATE_UPT", "upt", upt.id, { code: upt.code });
    res.status(201).json({ id: upt.id, message: "UPT berhasil ditambahkan." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menyimpan UPT." });
  }
});

/** PUT /api/upts/:id - edit UPT */
router.put("/:id", requireAdmin, async (req, res) => {
  const { code, name, matra, uptType } = req.body;
  if (!code || !name) return res.status(400).json({ error: "Kode dan nama UPT wajib diisi." });
  if (matra && !MATRA.includes(String(matra).trim().toLowerCase())) {
    return res.status(400).json({ error: "Matra harus darat, laut, udara, atau aparatur." });
  }
  try {
    const upt = await Upt.findByPk(req.params.id);
    if (!upt) return res.status(404).json({ error: "UPT tidak ditemukan." });

    const newCode = code.trim().toUpperCase();
    const dup = await Upt.findOne({ where: { code: newCode, id: { [Op.ne]: req.params.id } } });
    if (dup) return res.status(409).json({ error: `Kode UPT "${code}" sudah digunakan.` });

    await upt.update({ code: newCode, name: name.trim(), matra: normalizeMatra(matra), uptType: normalizeUptType(uptType) });
    audit(req, "UPDATE_UPT", "upt", req.params.id, null);
    res.json({ message: "UPT berhasil diperbarui." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memperbarui UPT." });
  }
});

/** PATCH /api/upts/:id/status - aktif/nonaktifkan UPT */
router.patch("/:id/status", requireAdmin, async (req, res) => {
  try {
    const upt = await Upt.findByPk(req.params.id);
    if (!upt) return res.status(404).json({ error: "UPT tidak ditemukan." });
    const next = !(upt.isActive !== false);
    await upt.update({ isActive: next });
    audit(req, next ? "ACTIVATE_UPT" : "DEACTIVATE_UPT", "upt", req.params.id, null);
    res.json({ message: "Status UPT diperbarui.", isActive: next });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengubah status UPT." });
  }
});

/** DELETE /api/upts/:id - hapus UPT NONAKTIF (cascade hapus data terkait) */
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const upt = await Upt.findByPk(req.params.id);
    if (!upt) return res.status(404).json({ error: "UPT tidak ditemukan." });
    if (upt.isActive !== false) {
      return res.status(400).json({ error: "Hanya UPT nonaktif yang dapat dihapus. Nonaktifkan UPT terlebih dahulu." });
    }

    const t = await sequelize.transaction();
    try {
      // Hapus semua data terkait UPT (seed data memiliki Target/Realization)
      await Target.destroy({ where: { uptId: upt.id }, transaction: t });
      await Realization.destroy({ where: { uptId: upt.id }, transaction: t });
      await Submission.destroy({ where: { uptId: upt.id }, transaction: t });
      await UnlockRequest.destroy({ where: { uptId: upt.id }, transaction: t });
      await TargetSubmission.destroy({ where: { uptId: upt.id }, transaction: t });
      // User yang terikat ke UPT -> lepas relasi (jangan hapus user)
      await User.update({ uptId: null }, { where: { uptId: upt.id }, transaction: t });

      await upt.destroy({ transaction: t });
      await t.commit();
      audit(req, "DELETE_UPT", "upt", req.params.id, null);
      res.json({ message: "UPT berhasil dihapus beserta data terkait." });
    } catch (inner) {
      await t.rollback();
      throw inner;
    }
  } catch (err) {
    console.error("[delete upt]", err);
    // Beri pesan yang lebih jelas jika masih FK error
    if (err.name === "SequelizeForeignKeyConstraintError") {
      return res.status(400).json({ error: "Gagal menghapus UPT karena masih memiliki data terkait. Hubungi admin." });
    }
    res.status(500).json({ error: "Gagal menghapus UPT." });
  }
});

module.exports = router;
