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

const MAX_IMPORT_NAMES = 500;
const MAX_NAME_LEN = 150;

function normalizeProgString(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/^[a-z0-9][\.\-\)]\s*/i, '') // hapus awalan seperti A. atau 1.
    .replace(/\(.*?\)/g, '')              // hapus tanda kurung
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveProgramIdFromInput(input, allPrograms) {
  if (!input) return null;
  const raw = String(input).trim();
  const lower = raw.toLowerCase();
  const clean = normalizeProgString(raw);

  // 1. Direct ID match
  const byId = allPrograms.find((p) => String(p.id) === raw);
  if (byId) return byId.id;

  // 2. Exact name match (case-insensitive)
  const byExact = allPrograms.find((p) => p.name.trim().toLowerCase() === lower);
  if (byExact) return byExact.id;

  // 3. Clean name match
  const byClean = allPrograms.find((p) => normalizeProgString(p.name) === clean);
  if (byClean) return byClean.id;

  // 4. Sinonim umum (Mandiri -> Non Pola Pembibitan)
  if (clean.includes('mandiri')) {
    const nonPola = allPrograms.find((p) => {
      const pn = normalizeProgString(p.name);
      return pn.includes('non pola') || pn.includes('mandiri');
    });
    if (nonPola) return nonPola.id;
  }
  if (clean.includes('pola pembibitan')) {
    const pola = allPrograms.find((p) => normalizeProgString(p.name).includes('pola pembibitan'));
    if (pola) return pola.id;
  }

  // 5. Partial contains match
  const byIncludes = allPrograms.find((p) => {
    const pn = normalizeProgString(p.name);
    return (pn.length >= 4 && clean.includes(pn)) || (clean.length >= 4 && pn.includes(clean));
  });
  if (byIncludes) return byIncludes.id;

  // 6. Match parentName jika input mencantumkan nama induk
  const byParent = allPrograms.find((p) => {
    const prn = normalizeProgString(p.parentName);
    return prn && (prn === clean || clean.includes(prn));
  });
  if (byParent) return byParent.id;

  return null;
}

/** POST /api/diklats/import — (UPT) import banyak diklat sekaligus (mendukung multi-program dalam 1 file) */
router.post("/import", requireUpt, async (req, res) => {
  try {
    const uptId = req.user.uptId;
    if (!uptId) return res.status(400).json({ error: "Akun Anda belum ditautkan ke UPT." });
    const year = Number(req.body.year) || new Date().getFullYear();

    if (!year || year < 2000 || year > 2100) return res.status(400).json({ error: "Tahun tidak valid." });

    const tSid = `${uptId}_${year}_00`;
    const tSub = await TargetSubmission.findOne({ where: { id: tSid } });
    if (tSub && ["pending_pimpinan", "pending_bpsdmp", "approved"].includes(tSub.status)) {
      return res.status(403).json({ error: `Target PK ${year} sudah dikirim dan terkunci (${tSub.status}). Ajukan Perubahan Target PK untuk menambah diklat.` });
    }

    const allPrograms = (await Program.findAll()).map((p) => p.toJSON());
    const progMap = new Map(allPrograms.map((p) => [p.id, p]));

    // Format baru: items = [ { name, programId, programName, targetPeserta, targetLulusan } ]
    // Format lama: names = [ "Diklat A", ... ], programIds = [ "uuid", ... ]
    let rawItems = [];
    if (Array.isArray(req.body.items) && req.body.items.length > 0) {
      rawItems = req.body.items;
    } else if (Array.isArray(req.body.names) && req.body.names.length > 0) {
      let defaultProgIds = req.body.programIds || req.body.programId;
      if (!Array.isArray(defaultProgIds)) defaultProgIds = defaultProgIds ? [defaultProgIds] : [];
      defaultProgIds = defaultProgIds.map(String).filter(Boolean);
      rawItems = req.body.names.map((n) => ({
        name: n,
        programIds: defaultProgIds,
      }));
    }

    if (!rawItems.length) {
      return res.status(400).json({ error: "Tidak ada data diklat yang bisa diimport." });
    }
    if (rawItems.length > MAX_IMPORT_NAMES) {
      return res.status(400).json({ error: `Maksimal ${MAX_IMPORT_NAMES} baris per sekali import.` });
    }

    const created = [];
    const updated = [];
    const skipped = [];
    const programCountMap = new Map();

    for (const item of rawItems) {
      const rawName = String(item.name || "").trim();
      if (!rawName) continue;
      const name = rawName.length > MAX_NAME_LEN ? rawName.slice(0, MAX_NAME_LEN) : rawName;
      const lower = name.toLowerCase();

      // Resolve program IDs
      let pids = [];
      if (item.programId) pids.push(String(item.programId));
      if (Array.isArray(item.programIds)) pids.push(...item.programIds.map(String));
      if (item.programName) {
        const resolvedId = resolveProgramIdFromInput(item.programName, allPrograms);
        if (resolvedId) pids.push(String(resolvedId));
      }
      pids = [...new Set(pids.filter(Boolean))];

      // Jika program tidak ditemukan dan UPT punya program default, atau lewati bila tidak ada program
      if (!pids.length) {
        skipped.push({ name, reason: `Program "${item.programName || '-'}" tidak dikenali di sistem` });
        continue;
      }

      // Pastikan program exists
      const validPids = pids.filter((id) => progMap.has(id));
      if (!validPids.length) {
        skipped.push({ name, reason: "Program tidak ditemukan" });
        continue;
      }

      const tp = Math.max(0, parseInt(item.targetPeserta, 10) || 0);
      const tl = Math.max(0, parseInt(item.targetLulusan, 10) || 0);

      // Cek apakah diklat dengan nama sama sudah ada di UPT tahun ini
      const existing = await Diklat.findOne({
        where: { uptId, year, [Op.and]: [where(fn("LOWER", col("name")), lower)] },
      });

      if (existing) {
        // Update pemetaan program jika ada program baru
        const currentPids = Array.isArray(existing.programIds) ? existing.programIds.map(String) : [];
        const mergedPids = [...new Set([...currentPids, ...validPids])];
        const patch = {};
        if (mergedPids.length > currentPids.length) patch.programIds = mergedPids;
        if (tp > 0 && (!existing.targetPeserta || existing.targetPeserta === 0)) patch.targetPeserta = tp;
        if (tl > 0 && (!existing.targetLulusan || existing.targetLulusan === 0)) patch.targetLulusan = tl;

        if (Object.keys(patch).length > 0) {
          await existing.update(patch);
          updated.push({ id: existing.id, name });
        } else {
          skipped.push({ name, reason: "sudah terdaftar di program ini" });
        }
      } else {
        const doc = await Diklat.create({
          uptId,
          year,
          name,
          programIds: validPids,
          targetPeserta: tp,
          targetLulusan: tl,
          isActive: true,
          createdBy: req.uid,
        });
        created.push({ id: doc.id, name, programIds: validPids });

        for (const pid of validPids) {
          const pName = progMap.get(pid)?.name || "Program";
          programCountMap.set(pName, (programCountMap.get(pName) || 0) + 1);
        }
      }
    }

    const summaryPrograms = [...programCountMap.entries()].map(([pName, count]) => `${pName} (${count})`).join(", ");
    audit(req, "IMPORT_DIKLAT_MULTI", "diklat", null, {
      year,
      dibuat: created.length,
      diperbarui: updated.length,
      dilewati: skipped.length,
      program: summaryPrograms || "-",
    });

    const msg = created.length > 0
      ? `Berhasil mengimpor ${created.length} diklat baru${updated.length ? ` dan memperbarui ${updated.length} diklat` : ''}${summaryPrograms ? ` ke program: ${summaryPrograms}` : ''}.${skipped.length ? ` (${skipped.length} dilewati/duplikat)` : ''}`
      : updated.length > 0
      ? `${updated.length} diklat diperbarui pemetaan programnya.${skipped.length ? ` (${skipped.length} dilewati)` : ''}`
      : `Tidak ada diklat baru yang diimpor. ${skipped.length} baris dilewati karena sudah ada atau program tidak cocok.`;

    res.status(201).json({
      message: msg,
      createdCount: created.length,
      updatedCount: updated.length,
      skippedCount: skipped.length,
      created,
      updated,
      skipped,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal import diklat: " + (err.message || err) });
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
