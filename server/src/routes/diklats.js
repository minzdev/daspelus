const express = require("express");
const { authenticate, requireUpt, isSuperAdmin, isPimpinan } = require("../middleware/auth");
const { Diklat, Program, Upt, TargetSubmission } = require("../models");
const { audit } = require("../lib/audit");
const { Op, fn, col, where } = require("sequelize");

const router = express.Router();
router.use(authenticate);

function resolveUptId(req, queryUptId) {
  const user = req.user;
  if (isSuperAdmin(user)) return queryUptId || user.uptId || null; // admin boleh lihat semua / filter
  // Pimpinan & Admin UPT terkunci ke UPT sendiri
  return user.uptId || null;
}

async function programMap() {
  const all = await Program.findAll();
  return new Map(all.map((p) => [p.id, p.toJSON()]));
}

function withProgramNames(diklats, pmap) {
  return diklats.map((d) => {
    const j = d.toJSON ? d.toJSON() : d;
    const ids = Array.isArray(j.programIds) ? j.programIds : [];
    const programNames = ids.map((id) => pmap.get(id)?.name || "Program terhapus");
    const parentNames = [...new Set(ids.map((id) => pmap.get(id)?.parentName || pmap.get(id)?.parent_name || "-"))];
    return { ...j, programIds: ids, programNames, parentNames };
  });
}

/** GET /api/diklats?year=2026&uptId=... — daftar diklat UPT */
router.get("/", async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const uptId = resolveUptId(req, req.query.uptId);
    const whereClause = { year };
    if (uptId) {
      whereClause.uptId = uptId;
    } else if (!isSuperAdmin(req.user)) {
      return res.status(400).json({ error: "Akun Anda belum ditautkan ke UPT." });
    }
    const list = await Diklat.findAll({ where: whereClause, order: [["name", "ASC"]] });
    const pmap = await programMap();
    res.json({ year, uptId, diklats: withProgramNames(list, pmap) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil daftar diklat." });
  }
});

/** POST /api/diklats — (UPT) tambah nama diklat + petakan ke 1+ program */
router.post("/", requireUpt, async (req, res) => {
  try {
    const uptId = req.user.uptId;
    if (!uptId) return res.status(400).json({ error: "Akun Anda belum ditautkan ke UPT." });
    const year = Number(req.body.year) || new Date().getFullYear();
    const name = String(req.body.name || "").trim();
    let programIds = req.body.programIds || req.body.programId;
    if (!Array.isArray(programIds)) programIds = programIds ? [programIds] : [];
    programIds = [...new Set(programIds.map(String).filter(Boolean))];

    if (!name) return res.status(400).json({ error: "Nama diklat wajib diisi." });
    if (!programIds.length) return res.status(400).json({ error: "Pilih minimal 1 program untuk diklat ini (bisa lebih dari satu)." });
    if (!year || year < 2000 || year > 2100) return res.status(400).json({ error: "Tahun tidak valid." });

    // Target terkunci? jika Target PK tahun ini sudah dikirim/disetujui, kunci master diklat juga
    const tSid = `${uptId}_${year}_00`;
    const tSub = await TargetSubmission.findOne({ where: { id: tSid } });
    if (tSub && ["pending_pimpinan", "pending_bpsdmp", "approved"].includes(tSub.status)) {
      return res.status(403).json({ error: `Target PK ${year} sudah dikirim dan terkunci (${tSub.status}). Ajukan Perubahan Target PK untuk menambah diklat.` });
    }

    // Validasi program ada
    for (const pid of programIds) {
      const prog = await Program.findByPk(pid);
      if (!prog) return res.status(404).json({ error: `Program "${pid}" tidak ditemukan.` });
    }

    // Cek duplikat nama dalam UPT+tahun yang sama
    const dup = await Diklat.findOne({
      where: { uptId, year, [Op.and]: [where(fn("LOWER", col("name")), name.toLowerCase())] },
    });
    if (dup) return res.status(409).json({ error: `Diklat "${name}" sudah ada untuk tahun ${year}.` });

    const doc = await Diklat.create({
      uptId, year, name, programIds,
      targetPeserta: 0, targetLulusan: 0, isActive: true, createdBy: req.uid,
    });
    audit(req, "CREATE_DIKLAT", "diklat", doc.id, { name, year });
    res.status(201).json({ id: doc.id, message: `Diklat "${name}" ditambahkan.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menyimpan diklat." });
  }
});

/** PUT /api/diklats/:id — (UPT) ubah nama / pemetaan program */
router.put("/:id", requireUpt, async (req, res) => {
  try {
    const uptId = req.user.uptId;
    const doc = await Diklat.findByPk(req.params.id);
    if (!doc) return res.status(404).json({ error: "Diklat tidak ditemukan." });
    if (doc.uptId !== uptId) return res.status(403).json({ error: "Anda hanya dapat mengubah diklat UPT Anda sendiri." });

    const tSid = `${uptId}_${doc.year}_00`;
    const tSub = await TargetSubmission.findOne({ where: { id: tSid } });
    if (tSub && ["pending_pimpinan", "pending_bpsdmp", "approved"].includes(tSub.status)) {
      return res.status(403).json({ error: `Target PK ${doc.year} sudah dikirim dan terkunci (${tSub.status}).` });
    }

    const patch = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name || "").trim();
      if (!name) return res.status(400).json({ error: "Nama diklat wajib diisi." });
      const dup = await Diklat.findOne({
        where: { uptId, year: doc.year, id: { [Op.ne]: doc.id }, [Op.and]: [where(fn("LOWER", col("name")), name.toLowerCase())] },
      });
      if (dup) return res.status(409).json({ error: `Diklat "${name}" sudah ada untuk tahun ${doc.year}.` });
      patch.name = name;
    }
    if (req.body.programIds !== undefined || req.body.programId !== undefined) {
      let programIds = req.body.programIds ?? req.body.programId;
      if (!Array.isArray(programIds)) programIds = programIds ? [programIds] : [];
      programIds = [...new Set(programIds.map(String).filter(Boolean))];
      if (!programIds.length) return res.status(400).json({ error: "Pilih minimal 1 program (bisa lebih dari satu)." });
      for (const pid of programIds) {
        const prog = await Program.findByPk(pid);
        if (!prog) return res.status(404).json({ error: `Program "${pid}" tidak ditemukan.` });
      }
      patch.programIds = programIds;
    }
    if (req.body.isActive !== undefined) patch.isActive = !!req.body.isActive;

    await doc.update(patch);
    audit(req, "UPDATE_DIKLAT", "diklat", doc.id, { name: doc.name });
    res.json({ message: "Diklat berhasil diperbarui." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memperbarui diklat." });
  }
});

/** DELETE /api/diklats/:id — (UPT) hapus diklat */
router.delete("/:id", requireUpt, async (req, res) => {
  try {
    const uptId = req.user.uptId;
    const doc = await Diklat.findByPk(req.params.id);
    if (!doc) return res.status(404).json({ error: "Diklat tidak ditemukan." });
    if (doc.uptId !== uptId) return res.status(403).json({ error: "Anda hanya dapat menghapus diklat UPT Anda sendiri." });

    const tSid = `${uptId}_${doc.year}_00`;
    const tSub = await TargetSubmission.findOne({ where: { id: tSid } });
    if (tSub && ["pending_pimpinan", "pending_bpsdmp", "approved"].includes(tSub.status)) {
      return res.status(403).json({ error: `Target PK ${doc.year} sudah dikirim dan terkunci (${tSub.status}).` });
    }
    const delName = doc.name;
    await doc.destroy();
    audit(req, "DELETE_DIKLAT", "diklat", req.params.id, { name: delName });
    res.json({ message: `Diklat "${delName}" dihapus.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menghapus diklat." });
  }
});

module.exports = router;
