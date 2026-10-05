const express = require("express");
const { authenticate, isSuperAdmin, isPusbang, isPimpinan, isUptAdmin } = require("../middleware/auth");
const { Submission, Realization, Target, Program, Upt } = require("../models");
const notifier = require("../lib/notifier");
const { audit } = require("../lib/audit");
const { Op } = require("sequelize");

const router = express.Router();
router.use(authenticate);

/** POST /api/submissions - UPT_ADMIN kirim laporan */
router.post("/", async (req, res) => {
  const { year, month } = req.body;
  const y = Number(year), m = Number(month);
  if (!y || !m || m < 1 || m > 12) return res.status(400).json({ error: "Tahun dan bulan wajib diisi." });

  const user = req.user;
  if (!isUptAdmin(user) && !isPimpinan(user)) return res.status(403).json({ error: "Hanya Admin UPT yang dapat mengirim laporan." });
  const uptId = user.uptId;
  if (!uptId) return res.status(400).json({ error: "Akun belum tertaut ke UPT." });

  try {
    const uptDoc = await Upt.findByPk(uptId);
    if (!uptDoc) return res.status(404).json({ error: "UPT tidak ditemukan." });
    const upt = uptDoc.toJSON();

    const sid = `${uptId}_${y}_${String(m).padStart(2, "0")}`;
    const existing = await Submission.findOne({ where: { submissionId: sid } });
    if (existing && existing.status === "approved") return res.status(400).json({ error: `Laporan ${m}/${y} sudah disetujui dan terkunci.` });
    if (existing && existing.status === "pending_pimpinan") return res.status(400).json({ error: `Laporan ${m}/${y} masih menunggu persetujuan Pimpinan.` });

    const [realDocs, targetDocs] = await Promise.all([
      Realization.findAll({ where: { uptId, year: y, month: m } }),
      Target.findAll({ where: { uptId, year: y, month: { [Op.in]: [m, 0] } } }),
    ]);
    const reals = realDocs.map((r) => r.toJSON());
    const targs = targetDocs.map((t) => t.toJSON());

    await Submission.upsert({
      submissionId: sid, uptId, uptCode: upt.code || "-", uptName: upt.name || "-",
      matra: upt.matra || "", uptType: upt.uptType || "taruna",
      year: y, month: m, status: "pending_pimpinan",
      submittedBy: req.uid, submittedByName: user.name || user.email,
      approvedBy: null, rejectedBy: null, rejectNote: null, locked: false,
      realSnapshot: reals, targetSnapshot: targs,
    });

    notifier.notifyRealisasiSubmit({ upt: uptDoc, year: y, month: m, user: req.user });

    audit(req, "SUBMIT_REALISASI", "realisasi", sid, { year: y, month: m });
    res.json({ message: `Laporan ${m}/${y} berhasil dikirim ke Pimpinan UPT untuk direview.`, id: sid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengirim laporan." });
  }
});

/** GET /api/submissions/my */
router.get("/my", async (req, res) => {
  const user = req.user;
  const uptId = user.uptId;
  if (!uptId) return res.status(400).json({ error: "Akun belum tertaut ke UPT." });
  try {
    const list = await Submission.findAll({ where: { uptId }, order: [["year", "DESC"], ["month", "DESC"]] });
    res.json({ submissions: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil laporan." });
  }
});

/** GET /api/submissions/inbox */
router.get("/inbox", async (req, res) => {
  const user = req.user;
  try {
    let list;
    if (isSuperAdmin(user)) {
      list = await Submission.findAll({ where: { status: "pending_bpsdmp" } });
    } else if (isPusbang(user)) {
      const all = await Submission.findAll({ where: { status: "pending_bpsdmp" } });
      const matra = (user.pusbangMatra || "").toLowerCase();
      list = all.filter((d) => (d.matra || "").toLowerCase() === matra);
    } else if (isPimpinan(user)) {
      list = await Submission.findAll({ where: { uptId: user.uptId, status: "pending_pimpinan" } });
    } else {
      return res.status(403).json({ error: "Tidak ada inbox untuk role ini." });
    }
    res.json({ submissions: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil inbox." });
  }
});

async function findSubmissionDoc(id) {
  if (!id) return null;
  let doc = await Submission.findByPk(id);
  if (!doc) {
    doc = await Submission.findOne({ where: { submissionId: id } });
  }
  return doc;
}

/** PATCH /api/submissions/:id/approve - Pimpinan approve -> pending_bpsdmp */
router.patch("/:id/approve", async (req, res) => {
  const user = req.user;
  if (!isPimpinan(user) && !isSuperAdmin(user)) return res.status(403).json({ error: "Hanya Pimpinan UPT (atau Super Admin) yang dapat menyetujui." });
  try {
    const doc = await findSubmissionDoc(req.params.id);
    if (!doc) return res.status(404).json({ error: "Laporan tidak ditemukan." });
    if (doc.status !== "pending_pimpinan") return res.status(400).json({ error: `Status laporan ${doc.status}, tidak bisa di-approve.` });
    if (isPimpinan(user) && doc.uptId !== user.uptId) return res.status(403).json({ error: "Anda hanya dapat menyetujui laporan UPT Anda sendiri." });

    await doc.update({
      status: "pending_bpsdmp",
      pimpinanApprovedBy: req.uid,
      pimpinanApprovedByName: user.name || user.email,
    });

    notifier.notifyRealisasiPimpinanReview({ doc, upt: { id: doc.uptId, name: doc.uptName, code: doc.uptCode }, year: doc.year, month: doc.month, action: 'approve', user });

    audit(req, "APPROVE_REALISASI_PIMPINAN", "realisasi", doc.submissionId || doc.id, { uptCode: doc.uptCode, year: doc.year, month: doc.month });
    res.json({ message: `Laporan ${doc.month}/${doc.year} disetujui Pimpinan dan diteruskan ke Admin BPSDMP.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menyetujui laporan." });
  }
});

/** PATCH /api/submissions/:id/approve-bpsdmp - BPSDMP / Pusbang approve -> locked */
router.patch("/:id/approve-bpsdmp", async (req, res) => {
  const user = req.user;
  if (!isSuperAdmin(user) && !isPusbang(user)) return res.status(403).json({ error: "Hanya Super Admin BPSDMP atau Pusbang yang dapat menyetujui." });
  try {
    const doc = await findSubmissionDoc(req.params.id);
    if (!doc) return res.status(404).json({ error: "Laporan tidak ditemukan." });
    if (isPusbang(user)) {
      const matra = (user.pusbangMatra || "").toLowerCase();
      if ((doc.matra || "").toLowerCase() !== matra) {
        return res.status(403).json({ error: "Anda hanya dapat memproses laporan matra Anda sendiri." });
      }
    }
    if (doc.status !== "pending_bpsdmp") return res.status(400).json({ error: `Status laporan ${doc.status}, tidak bisa di-approve BPSDMP.` });

    await doc.update({
      status: "approved", locked: true,
      approvedBy: req.uid, approvedByName: user.name || user.email,
    });

    // Lock realizations for this month
    await Realization.update({ locked: true }, { where: { uptId: doc.uptId, year: doc.year, month: doc.month } });

    notifier.notifyRealisasiBpsdmpReview({ doc, upt: { id: doc.uptId, name: doc.uptName, code: doc.uptCode }, year: doc.year, month: doc.month, action: 'approve', user });

    audit(req, "APPROVE_REALISASI_BPSDMP", "realisasi", doc.submissionId || doc.id, { uptCode: doc.uptCode, year: doc.year, month: doc.month });
    res.json({ message: `Laporan ${doc.month}/${doc.year} disetujui dan terkunci permanen.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menyetujui laporan." });
  }
});

/** PATCH /api/submissions/:id/reject - Pimpinan / Admin / Pusbang reject */
router.patch("/:id/reject", async (req, res) => {
  const { note } = req.body;
  const user = req.user;
  if (!isPimpinan(user) && !isSuperAdmin(user) && !isPusbang(user)) return res.status(403).json({ error: "Hanya Pimpinan, Admin BPSDMP, atau Pusbang yang dapat menolak." });
  try {
    const doc = await findSubmissionDoc(req.params.id);
    if (!doc) return res.status(404).json({ error: "Laporan tidak ditemukan." });
    if (isPimpinan(user) && doc.uptId !== user.uptId) return res.status(403).json({ error: "Hanya untuk UPT Anda." });
    if (isPusbang(user)) {
      const matra = (user.pusbangMatra || "").toLowerCase();
      if ((doc.matra || "").toLowerCase() !== matra) {
        return res.status(403).json({ error: "Anda hanya dapat memproses laporan matra Anda sendiri." });
      }
    }

    await doc.update({
      status: "rejected", rejectedBy: req.uid, rejectedAt: new Date(), rejectNote: note || "",
    });

    notifier.notifyRealisasiPimpinanReview({ doc, upt: { id: doc.uptId, name: doc.uptName, code: doc.uptCode }, year: doc.year, month: doc.month, action: 'reject', note, user });

    audit(req, "REJECT_REALISASI", "realisasi", doc.submissionId || doc.id, { uptCode: doc.uptCode, year: doc.year, month: doc.month });
    res.json({ message: "Laporan ditolak, UPT dapat merevisi dan kirim ulang." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menolak laporan." });
  }
});

/** GET /api/submissions/processed - riwayat persetujuan */
router.get("/processed", async (req, res) => {
  const user = req.user;
  try {
    let docs = await Submission.findAll({ order: [["updatedAt", "DESC"]] });
    let list = docs.map((d) => d.toJSON());
    if (isSuperAdmin(user)) {
      list = list.filter((d) => ["approved", "rejected"].includes(d.status) || d.pimpinanApprovedBy);
    } else if (isPusbang(user)) {
      const matra = (user.pusbangMatra || "").toLowerCase();
      list = list.filter((d) => (d.matra || "").toLowerCase() === matra && ["approved", "rejected", "pending_bpsdmp"].includes(d.status));
    } else if (isPimpinan(user)) {
      list = list.filter((d) => d.uptId === user.uptId && ["approved", "rejected", "pending_bpsdmp"].includes(d.status));
    } else {
      return res.status(403).json({ error: "Akses tidak diizinkan." });
    }
    res.json({ submissions: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil riwayat persetujuan." });
  }
});

/** GET /api/submissions/admin-history - seluruh riwayat laporan untuk monitoring Super Admin */
router.get("/admin-history", async (req, res) => {
  if (!isSuperAdmin(req.user)) return res.status(403).json({ error: "Akses khusus Super Admin BPSDMP." });
  try {
    const submissions = await Submission.findAll({ order: [["updatedAt", "DESC"]] });
    res.json({ submissions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil riwayat laporan." });
  }
});

/** GET /api/submissions/:id/detail */
router.get("/:id/detail", async (req, res) => {
  const user = req.user;
  try {
    const doc = await findSubmissionDoc(req.params.id);
    if (!doc) return res.status(404).json({ error: "Laporan tidak ditemukan." });
    const sub = doc.toJSON();
    if (isPimpinan(user) && sub.uptId !== user.uptId) return res.status(403).json({ error: "Hanya untuk UPT Anda." });
    if (isPusbang(user) && (sub.matra || "").toLowerCase() !== (user.pusbangMatra || "").toLowerCase()) {
      return res.status(403).json({ error: "Hanya untuk matra Anda." });
    }

    const [realDocs, targetDocs, progSnap, uptDoc] = await Promise.all([
      Realization.findAll({ where: { uptId: sub.uptId, year: sub.year } }),
      Target.findAll({ where: { uptId: sub.uptId, year: sub.year } }),
      Program.findAll(),
      Upt.findByPk(sub.uptId),
    ]);

    const reals = realDocs.map((r) => r.toJSON()).filter((r) => Number(r.month) === Number(sub.month));
    const targs = targetDocs.map((t) => t.toJSON()).filter((t) => Number(t.month) === Number(sub.month) || Number(t.month) === 0);
    const allProgs = progSnap.map((d) => d.toJSON());
    const flat = [];
    const parents = allProgs.filter((p) => !p.parentId).sort((a, b) => (a.order || 0) - (b.order || 0));
    for (const parent of parents) {
      if (parent.isActive === false) continue;
      flat.push({ ...parent, parentName: null, isParent: true });
      const children = allProgs.filter((c) => c.parentId === parent.id && c.isActive !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
      for (const c of children) flat.push({ ...c, parentName: parent.name, isParent: false });
    }

    const upt = uptDoc ? uptDoc.toJSON() : {};
    const uptType = upt.uptType || "taruna";
    const visibleFlat = flat.filter((p) => {
      const tg = p.targetGroup || "semua";
      if (tg === "semua") return true;
      return tg === uptType;
    });

    const realByPid = new Map(reals.map((r) => [r.programId, r]));
    const targByPid = new Map(targs.map((t) => [t.programId, t]));

    const programs = visibleFlat.map((fp) => {
      const r = realByPid.get(fp.id) || { pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0 };
      const t = targByPid.get(fp.id) || { targetPeserta: 0, targetLulusan: 0 };
      return {
        programId: fp.id, programName: fp.name, parentName: fp.parentName || "-", isParent: fp.isParent,
        targetGroup: fp.targetGroup || "semua",
        pesertaL: Number(r.pesertaL) || 0, pesertaP: Number(r.pesertaP) || 0,
        lulusanL: Number(r.lulusanL) || 0, lulusanP: Number(r.lulusanP) || 0,
        targetPeserta: Number(t.targetPeserta) || 0, targetLulusan: Number(t.targetLulusan) || 0,
      };
    });

    // Induk auto-sum
    const byPid = new Map(programs.map((r) => [r.programId, r]));
    for (const row of programs) {
      if (!row.isParent) continue;
      const kids = visibleFlat.filter((c) => !c.isParent && c.parentId === row.programId);
      if (!kids.length) continue;
      const sum = (key) => kids.reduce((s, k) => s + (byPid.get(k.id)?.[key] || 0), 0);
      row.pesertaL = sum("pesertaL"); row.pesertaP = sum("pesertaP");
      row.lulusanL = sum("lulusanL"); row.lulusanP = sum("lulusanP");
      row.targetPeserta = sum("targetPeserta"); row.targetLulusan = sum("targetLulusan");
    }

    res.json({ submission: { id: doc.id, ...sub }, programs, upt: { id: sub.uptId, code: sub.uptCode, name: sub.uptName, matra: sub.matra } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil detail laporan." });
  }
});

/** GET /api/submissions/history */
router.get("/history", async (req, res) => {
  const user = req.user;
  const uptId = user.uptId;
  if (!uptId) return res.status(400).json({ error: "Akun belum tertaut ke UPT." });
  try {
    const list = await Submission.findAll({ where: { uptId }, order: [["year", "DESC"], ["month", "DESC"]] });
    res.json({ submissions: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil riwayat." });
  }
});

module.exports = router;
