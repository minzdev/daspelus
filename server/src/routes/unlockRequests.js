const express = require("express");
const { authenticate, isSuperAdmin, isPusbang, isPimpinan, isUptAdmin } = require("../middleware/auth");
const { UnlockRequest, Upt, Submission, Realization, TargetSubmission } = require("../models");
const notifier = require("../lib/notifier");
const { audit } = require("../lib/audit");
const { Op } = require("sequelize");

const router = express.Router();
router.use(authenticate);

function canActForUnlock(user, unlockDoc) {
  const status = unlockDoc.status;
  if (status === "pending_pimpinan" && isPimpinan(user) && unlockDoc.uptId === user.uptId) return true;
  if (status === "pending_pusbang" && isPusbang(user)) {
    const matra = (user.pusbangMatra || "").toLowerCase();
    return (unlockDoc.matra || "").toLowerCase() === matra;
  }
  if (status === "pending_bpsdmp" && isSuperAdmin(user)) return true;
  return false;
}

/** POST /api/unlock-requests - UPT_ADMIN ajukan unlock (Capaian atau Target PK) */
router.post("/", async (req, res) => {
  const { year, month, reason, type = 'capaian' } = req.body;
  const reqType = type === 'target_pk' ? 'target_pk' : 'capaian';
  const y = Number(year);
  let m = Number(month);
  if (reqType === 'target_pk') m = 0; // single-input: selalu tahunan/single

  if (!y || y < 2000 || y > 2100) return res.status(400).json({ error: "Tahun wajib diisi." });
  if (m == null || isNaN(m)) return res.status(400).json({ error: "Tahun dan bulan wajib diisi." });
  if (reqType === 'capaian' && (m < 1 || m > 12)) return res.status(400).json({ error: "Bulan capaian harus 1-12." });
  if (!reason || !String(reason).trim()) return res.status(400).json({ error: "Alasan unlock wajib diisi." });

  const user = req.user;
  if (!isUptAdmin(user)) return res.status(403).json({ error: "Hanya Admin UPT yang dapat mengajukan unlock." });
  const uptId = user.uptId;
  if (!uptId) return res.status(400).json({ error: "Akun belum tertaut ke UPT." });

  try {
    const uptDoc = await Upt.findByPk(uptId);
    if (!uptDoc) return res.status(404).json({ error: "UPT tidak ditemukan." });
    const upt = uptDoc.toJSON();

    if (reqType === 'target_pk') {
      const tSid = `${uptId}_${y}_00`;
      const tSub = await TargetSubmission.findOne({ where: { id: tSid } });
      if (!tSub || !['approved', 'pending_bpsdmp', 'pending_pimpinan'].includes(tSub.status)) {
        return res.status(400).json({ error: `Target PK ${y} belum dikirim / terkunci. Tidak perlu unlock.` });
      }

      const existing = await UnlockRequest.findOne({
        where: { uptId, year: y, month: m, type: 'target_pk', status: { [Op.in]: ["pending_pimpinan", "pending_pusbang", "pending_bpsdmp"] } },
      });
      if (existing) return res.status(400).json({ error: "Sudah ada pengajuan unlock Target PK yang masih diproses." });
    } else {
      const sid = `${uptId}_${y}_${String(m).padStart(2, "0")}`;
      const subDoc = await Submission.findOne({ where: { submissionId: sid } });
      if (!subDoc || subDoc.status !== "approved") {
        return res.status(400).json({ error: `Laporan Capaian ${m}/${y} belum terkunci (belum di-approve). Tidak perlu unlock.` });
      }

      const existing = await UnlockRequest.findOne({
        where: { uptId, year: y, month: m, type: { [Op.or]: ['capaian', null] }, status: { [Op.in]: ["pending_pimpinan", "pending_pusbang", "pending_bpsdmp"] } },
      });
      if (existing) return res.status(400).json({ error: "Sudah ada pengajuan unlock Capaian yang masih diproses untuk bulan ini." });
    }

    const reqDoc = await UnlockRequest.create({
      uptId, uptCode: upt.code || "-", uptName: upt.name || "-",
      matra: upt.matra || "", uptType: upt.uptType || "taruna",
      type: reqType,
      year: y, month: m, reason: String(reason).trim(),
      status: "pending_pimpinan",
      requestedBy: req.uid, requestedByName: user.name || user.email,
      trail: [{ role: user.role, uid: req.uid, name: user.name || user.email, decision: "submitted", note: reason, at: new Date().toISOString() }],
    });

    notifier.notifyUnlockRequestSubmit({ doc: reqDoc, upt, year: y, month: m, type: reqType, reason: String(reason).trim(), user });

    const targetLabel = reqType === 'target_pk' ? `Target PK ${y}` : `Capaian ${m}/${y}`;
    audit(req, "REQUEST_UNLOCK", "unlock", reqDoc.id, { type: reqType, year: y, month: m });
    res.json({ message: `Pengajuan unlock ${targetLabel} dikirim ke Pimpinan UPT.`, id: reqDoc.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengajukan unlock." });
  }
});

/** GET /api/unlock-requests/my */
router.get("/my", async (req, res) => {
  const user = req.user;
  const uptId = user.uptId;
  if (!uptId) return res.status(400).json({ error: "Akun belum tertaut ke UPT." });
  const typeFilter = req.query.type;
  try {
    const where = { uptId };
    if (typeFilter === 'target_pk') {
      where.type = 'target_pk';
    } else if (typeFilter === 'capaian') {
      where.type = { [Op.or]: ['capaian', null] };
    }
    const list = await UnlockRequest.findAll({ where, order: [["createdAt", "DESC"]] });
    res.json({ requests: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil pengajuan." });
  }
});

/** GET /api/unlock-requests/inbox */
router.get("/inbox", async (req, res) => {
  const user = req.user;
  try {
    let list;
    if (isSuperAdmin(user)) {
      list = await UnlockRequest.findAll({ where: { status: "pending_bpsdmp" }, order: [["createdAt", "DESC"]] });
    } else if (isPusbang(user)) {
      const all = await UnlockRequest.findAll({ where: { status: "pending_pusbang" }, order: [["createdAt", "DESC"]] });
      const matra = (user.pusbangMatra || "").toLowerCase();
      list = all.filter((d) => (d.matra || "").toLowerCase() === matra);
    } else if (isPimpinan(user)) {
      list = await UnlockRequest.findAll({ where: { uptId: user.uptId, status: "pending_pimpinan" }, order: [["createdAt", "DESC"]] });
    } else {
      return res.status(403).json({ error: "Tidak ada inbox untuk role ini." });
    }
    res.json({ requests: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil inbox." });
  }
});

/** GET /api/unlock-requests/processed - riwayat unlock yang sudah diproses (per role) */
router.get("/processed", async (req, res) => {
  const user = req.user;
  try {
    if (isSuperAdmin(user)) {
      const list = await UnlockRequest.findAll({
        where: { status: { [Op.in]: ["approved", "rejected"] } },
        order: [["createdAt", "DESC"]],
      });
      return res.json({ requests: list });
    }
    if (isPusbang(user)) {
      const all = await UnlockRequest.findAll({
        where: { status: { [Op.in]: ["pending_bpsdmp", "approved", "rejected"] } },
        order: [["createdAt", "DESC"]],
      });
      const matra = (user.pusbangMatra || "").toLowerCase();
      return res.json({ requests: all.filter((d) => (d.matra || "").toLowerCase() === matra) });
    }
    if (isPimpinan(user)) {
      if (!user.uptId) return res.status(400).json({ error: "Akun belum tertaut ke UPT." });
      const list = await UnlockRequest.findAll({
        where: { uptId: user.uptId, status: { [Op.notIn]: ["pending_pimpinan"] } },
        order: [["createdAt", "DESC"]],
      });
      return res.json({ requests: list });
    }
    return res.status(403).json({ error: "Tidak ada riwayat unlock untuk role ini." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil riwayat unlock." });
  }
});

/** PATCH /api/unlock-requests/:id/decision */
router.patch("/:id/decision", async (req, res) => {
  const { decision, note } = req.body;
  if (!["approve", "reject"].includes(decision)) return res.status(400).json({ error: "Keputusan harus approve atau reject." });
  const user = req.user;
  try {
    const doc = await UnlockRequest.findByPk(req.params.id);
    if (!doc) return res.status(404).json({ error: "Pengajuan tidak ditemukan." });
    const data = doc.toJSON();

    if (!canActForUnlock(user, data)) {
      return res.status(403).json({ error: `Anda tidak berwenang untuk status ${data.status}.` });
    }

    let nextStatus;
    if (decision === "reject") {
      nextStatus = "rejected";
    } else {
      if (data.status === "pending_pimpinan") nextStatus = "pending_pusbang";
      else if (data.status === "pending_pusbang") nextStatus = "pending_bpsdmp";
      else if (data.status === "pending_bpsdmp") nextStatus = "approved";
      else nextStatus = data.status;
    }

    const trailEntry = {
      role: user.role, uid: req.uid, name: user.name || user.email,
      decision, note: note || "", at: new Date().toISOString(),
    };

    const updates = {
      status: nextStatus,
      trail: [...(data.trail || []), trailEntry],
    };
    if (decision === "reject") { updates.rejectedBy = req.uid; updates.rejectedAt = new Date(); }
    if (nextStatus === "approved") { updates.approvedBy = req.uid; updates.approvedAt = new Date(); }

    await doc.update(updates);

    // Jika approved final, buka kunci sesuai tipe pengajuan
    if (nextStatus === "approved") {
      const mStr = String(data.month).padStart(2, "0");
      if (data.type === 'target_pk') {
        const tSid = `${data.uptId}_${data.year}_${mStr}`;
        await TargetSubmission.update({ status: "draft" }, { where: { id: tSid } });
      } else if (data.type === 'taruna') {
        const { TarunaSubmission } = require('../models');
        await TarunaSubmission.update(
          { status: "draft" },
          { where: { uptId: data.uptId, year: data.year } }
        );
      } else {
        const sid = `${data.uptId}_${data.year}_${mStr}`;
        await Submission.update({ status: "draft", locked: false }, { where: { submissionId: sid } });
        await Realization.update({ locked: false }, { where: { uptId: data.uptId, year: data.year, month: data.month } });
      }
    }

    notifier.notifyUnlockRequestDecision({ doc: data, decision, note, user, nextStatus });

    audit(req, decision === "approve" ? "APPROVE_UNLOCK" : "REJECT_UNLOCK", "unlock", doc.id, { type: data.type, year: data.year, month: data.month, nextStatus });
    res.json({ message: decision === "approve" ? `Pengajuan diteruskan ke ${nextStatus}.` : "Pengajuan ditolak.", nextStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memproses keputusan." });
  }
});

module.exports = router;
