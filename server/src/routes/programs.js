const express = require("express");
const { authenticate, requireAdmin } = require("../middleware/auth");
const { Program, Target, Realization } = require("../models");
const { audit } = require("../lib/audit");
const { Op, fn, col, where } = require("sequelize");

const router = express.Router();

router.use(authenticate, requireAdmin);

const VALID_TARGET_GROUPS = ["taruna", "aparatur", "semua"];
function normalizeTargetGroup(raw) {
  const v = String(raw || "").trim().toLowerCase();
  return VALID_TARGET_GROUPS.includes(v) ? v : "semua";
}

/** GET /api/programs - tree induk → turunan */
router.get("/", async (req, res) => {
  try {
    const all = await Program.findAll({ order: [["order", "ASC"], ["name", "ASC"]] });
    const allData = all.map((p) => p.toJSON());

    const parents = allData
      .filter((p) => !p.parentId)
      .map((p) => ({
        ...p,
        targetGroup: p.targetGroup || "semua",
        children: allData
          .filter((c) => c.parentId === p.id)
          .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name))
          .map((c) => ({ ...c, targetGroup: c.targetGroup || "semua" })),
      }));

    const flat = allData
      .filter((p) => p.parentId)
      .map((c) => {
        const parent = allData.find((p) => p.id === c.parentId);
        return { ...c, targetGroup: c.targetGroup || "semua", parentName: parent ? parent.name : "-" };
      });

    res.json({ parents, flat });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil daftar program." });
  }
});

/** POST /api/programs - buat program */
router.post("/", async (req, res) => {
  const { name, parentId, order, targetGroup } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Nama program wajib diisi." });

  try {
    let parentName = null;
    if (parentId) {
      const parentDoc = await Program.findByPk(parentId);
      if (!parentDoc) return res.status(404).json({ error: "Program induk tidak ditemukan." });
      parentName = parentDoc.name;
    }

    // Cek nama unik dalam lingkup induk yang sama (MySQL tidak support ILIKE -> pakai LOWER)
    const whereClause = parentId ? { parentId } : { parentId: null };
    const dup = await Program.findOne({
      where: {
        [Op.and]: [whereClause, where(fn("LOWER", col("name")), name.trim().toLowerCase())],
      },
    });
    if (dup) {
      return res.status(409).json({ error: `Nama "${name}" sudah ada${parentName ? ` di ${parentName}` : ""}.` });
    }

    const isParent = !parentId;
    const prog = await Program.create({
      name: name.trim(),
      parentId: parentId || null,
      parentName: parentName,
      order: Number(order) || 0,
      isActive: true,
      isParent,
      targetGroup: normalizeTargetGroup(targetGroup),
    });

    audit(req, "CREATE_PROGRAM", "program", prog.id, { name: prog.name });
    res.status(201).json({
      id: prog.id,
      message: `Program "${name.trim()}" berhasil ditambahkan${parentName ? ` ke ${parentName}` : ""}.`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menyimpan program." });
  }
});

/** PUT /api/programs/:id - edit nama / urutan / targetGroup */
router.put("/:id", async (req, res) => {
  const { name, order, targetGroup } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Nama program wajib diisi." });

  try {
    const prog = await Program.findByPk(req.params.id);
    if (!prog) return res.status(404).json({ error: "Program tidak ditemukan." });

    // Cek nama unik (MySQL tidak support ILIKE -> pakai LOWER)
    const whereClause = prog.parentId ? { parentId: prog.parentId } : { parentId: null };
    const dup = await Program.findOne({
      where: {
        [Op.and]: [whereClause, where(fn("LOWER", col("name")), name.trim().toLowerCase()), { id: { [Op.ne]: req.params.id } }],
      },
    });
    if (dup) return res.status(409).json({ error: `Nama "${name}" sudah digunakan.` });

    await prog.update({
      name: name.trim(),
      order: Number(order) || 0,
      targetGroup: normalizeTargetGroup(targetGroup),
    });
    audit(req, "UPDATE_PROGRAM", "program", prog.id, { name: prog.name });
    res.json({ message: "Program berhasil diperbarui." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memperbarui program." });
  }
});

/** DELETE /api/programs/:id - hapus program permanen */
router.delete("/:id", async (req, res) => {
  try {
    const prog = await Program.findByPk(req.params.id);
    if (!prog) return res.status(404).json({ error: "Program tidak ditemukan." });

    const idsToDelete = [req.params.id];
    if (!prog.parentId) {
      // Jika ini induk, kumpulkan semua turunan
      const children = await Program.findAll({ where: { parentId: req.params.id } });
      children.forEach((c) => idsToDelete.push(c.id));
    }

    const force = req.query.force === "true" || req.query.force === "1";

    // Cek apakah ada data realisasi/target bermakna
    const isRealMeaningful = (r) => {
      const p = (Number(r.totalPeserta) || 0) || ((Number(r.pesertaL) || 0) + (Number(r.pesertaP) || 0));
      const l = (Number(r.totalLulusan) || 0) || ((Number(r.lulusanL) || 0) + (Number(r.lulusanP) || 0));
      return p + l > 0;
    };

    for (const pid of idsToDelete) {
      const reals = await Realization.findAll({ where: { programId: pid } });
      const meaningfulReals = reals.filter((r) => isRealMeaningful(r.toJSON()));
      if (meaningfulReals.length > 0 && !force) {
        const sample = meaningfulReals[0].toJSON();
        return res.status(400).json({
          error: `Program tidak dapat dihapus karena memiliki ${meaningfulReals.length} data realisasi. Gunakan ?force=true untuk hapus paksa.`,
        });
      }

      const targets = await Target.findAll({ where: { programId: pid } });
      const meaningfulTargets = targets.filter((t) => {
        const td = t.toJSON();
        return (Number(td.targetPeserta) || 0) + (Number(td.targetLulusan) || 0) > 0;
      });
      if (meaningfulTargets.length > 0 && !force) {
        return res.status(400).json({
          error: `Program tidak dapat dihapus karena memiliki ${meaningfulTargets.length} data target PK. Gunakan ?force=true untuk hapus paksa.`,
        });
      }
    }

    // Hapus data terkait jika force
    if (force) {
      for (const pid of idsToDelete) {
        await Realization.destroy({ where: { programId: pid } });
        await Target.destroy({ where: { programId: pid } });
      }
    } else {
      // Hapus data kosong (0)
      for (const pid of idsToDelete) {
        const reals = await Realization.findAll({ where: { programId: pid } });
        for (const r of reals) {
          if (!isRealMeaningful(r.toJSON())) await r.destroy();
        }
        const targets = await Target.findAll({ where: { programId: pid } });
        for (const t of targets) {
          const td = t.toJSON();
          if ((Number(td.targetPeserta) || 0) + (Number(td.targetLulusan) || 0) === 0) await t.destroy();
        }
      }
    }

    // Hapus program dan turunannya
    await Program.destroy({ where: { id: { [Op.in]: idsToDelete } } });

    const namaProgram = prog.name;
    const jumlahTurunan = idsToDelete.length - 1;
    audit(req, "DELETE_PROGRAM", "program", req.params.id, { name: namaProgram });
    res.json({
      message: `Program "${namaProgram}" berhasil dihapus${jumlahTurunan > 0 ? ` beserta ${jumlahTurunan} program turunan` : ""}.`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menghapus program." });
  }
});

module.exports = router;
