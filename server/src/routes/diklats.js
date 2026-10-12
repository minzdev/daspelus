const express = require("express");
const { authenticate, requireUpt, isSuperAdmin, isPimpinan } = require("../middleware/auth");
const { Diklat, Program, Upt, Target, TargetSubmission, RealizationDiklat } = require("../models");
const { audit } = require("../lib/audit");
const { recordTargetRevision } = require("./targets");
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

/** Peta id -> parentId untuk hirarki program. */
function parentMapOf(allPrograms) {
  return new Map((allPrograms || []).map((p) => [String(p.id), p.parentId ? String(p.parentId) : null]));
}

/**
 * Buang induk bila turunannya ikut dipilih — satu diklat hanya dipetakan ke
 * program paling spesifik. Tanpa ini induk ikut menjumlah (mis. 105 jadi 210)
 * karena induk otomatis = jumlah turunan + rincian langsungnya.
 */
function dropAncestorProgramIds(programIds, allPrograms) {
  const byId = parentMapOf(allPrograms);
  const ids = [...new Set((programIds || []).map(String).filter(Boolean))];
  const ancestors = new Set();
  for (const id of ids) {
    let par = byId.get(id);
    const seen = new Set([id]);
    while (par && !seen.has(par)) {
      ancestors.add(par);
      seen.add(par);
      par = byId.get(par);
    }
  }
  const next = ids.filter((id) => !ancestors.has(id));
  return next.length ? next : ids; // pengaman rantai siklik: jangan kosongkan
}

/** true bila dua set program bersinggungan langsung atau via garis keturunan. */
function pidSetsRelated(aIds, bIds, allPrograms) {
  const byId = parentMapOf(allPrograms);
  const expand = (ids) => {
    const s = new Set(ids.map(String));
    for (const id of [...s]) {
      let par = byId.get(id);
      const seen = new Set([id]);
      while (par && !seen.has(par)) {
        s.add(par);
        seen.add(par);
        par = byId.get(par);
      }
    }
    return s;
  };
  const ea = expand(aIds), eb = expand(bIds);
  for (const id of ea) if (eb.has(id)) return true;
  return false;
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
    const progObjs = [];
    for (const pid of programIds) {
      const prog = await Program.findByPk(pid);
      if (!prog) return res.status(404).json({ error: `Program "${pid}" tidak ditemukan.` });
      progObjs.push(prog.toJSON());
    }
    // Normalisasi: induk yang turunannya ikut dipilih dibuang (hindari angka ganda)
    programIds = dropAncestorProgramIds(programIds, progObjs);
    if (!programIds.length) return res.status(400).json({ error: "Pemetaan program tidak valid." });

    // Cek duplikat nama dalam program yang beririsan untuk UPT+tahun yang sama
    const existingSameName = await Diklat.findAll({
      where: { uptId, year, [Op.and]: [where(fn("LOWER", col("name")), name.toLowerCase())] },
    });
    const hasOverlap = existingSameName.some((ex) => {
      const exPids = Array.isArray(ex.programIds) ? ex.programIds.map(String) : [];
      return programIds.some((pid) => exPids.includes(String(pid)));
    });
    if (hasOverlap) {
      return res.status(409).json({ error: `Diklat "${name}" sudah terdaftar pada program yang dipilih untuk tahun ${year}.` });
    }

    const initialTbp = {};
    for (const pid of programIds) {
      initialTbp[String(pid)] = { targetPeserta: 0, targetLulusan: 0 };
    }

    const doc = await Diklat.create({
      uptId, year, name, programIds,
      targetPeserta: 0, targetLulusan: 0,
      targetByProgram: initialTbp,
      isActive: true, createdBy: req.uid,
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

  // 4. Spesifik "Pola Pembibitan" (HARUS MURNI, BUKAN Non Pola / Mandiri)
  const isPolaMurni = (clean.includes('pola pembibitan') || clean === 'pola') && !clean.includes('non') && !clean.includes('bukan') && !clean.includes('mandiri');
  if (isPolaMurni) {
    const pola = allPrograms.find((p) => {
      const pn = normalizeProgString(p.name);
      return pn.includes('pola pembibitan') && !pn.includes('non') && !pn.includes('mandiri');
    });
    if (pola) return pola.id;
  }

  // 5. Spesifik "Mandiri" atau "Non Pola Pembibitan"
  const isMandiriOrNonPola = clean.includes('mandiri') || clean.includes('non pola') || clean.includes('non-pola');
  if (isMandiriOrNonPola) {
    if (clean.includes('mandiri')) {
      const mandiri = allPrograms.find((p) => p.name.toLowerCase().includes('mandiri'));
      if (mandiri) return mandiri.id;
    }
    const nonPola = allPrograms.find((p) => {
      const pn = normalizeProgString(p.name);
      return pn.includes('mandiri') || pn.includes('non pola') || pn.includes('non-pola');
    });
    if (nonPola) return nonPola.id;
  }

  // 6. Spesifik "Pelatihan Teknis" / "Short Course"
  const isPelatihanTeknis = clean.includes('pelatihan teknis') || clean.includes('short course') || clean === 'teknis';
  if (isPelatihanTeknis) {
    const teknisLeaf = allPrograms.find((p) => {
      const pn = p.name.toLowerCase().trim();
      return (pn.includes('pelatihan teknis') || pn.includes('short course')) && p.parentId;
    });
    if (teknisLeaf) return teknisLeaf.id;

    const teknisAny = allPrograms.find((p) => {
      const pn = p.name.toLowerCase().trim();
      return pn.includes('pelatihan teknis') || pn.includes('short course');
    });
    if (teknisAny) return teknisAny.id;
  }

  // 7. Partial contains match (prioritaskan yang lebih panjang & spesifik)
  const candidates = allPrograms
    .filter((p) => {
      const pn = normalizeProgString(p.name);
      return (pn.length >= 4 && clean.includes(pn)) || (clean.length >= 4 && pn.includes(clean));
    })
    .sort((a, b) => b.name.length - a.name.length);

  if (candidates.length > 0) return candidates[0].id;

  // 8. Match parentName jika input mencantumkan nama induk
  const byParent = allPrograms.find((p) => {
    const prn = normalizeProgString(p.parentName || p.parent_name);
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
      // Normalisasi: induk yang turunannya ikut dipilih dibuang (hindari angka ganda)
      const normPids = dropAncestorProgramIds(validPids, allPrograms);

      const tp = Math.max(0, parseInt(item.targetPeserta ?? item.targetPk ?? item.target, 10) || 0);
      const tl = Math.max(0, parseInt(item.targetLulusan ?? item.targetPk ?? item.target, 10) || 0);

      // Cek apakah diklat dengan nama sama sudah ada di UPT tahun ini
      const existingDocs = await Diklat.findAll({
        where: { uptId, year, [Op.and]: [where(fn("LOWER", col("name")), lower)] },
      });

      // Cocokkan juga via garis keturunan: diklat yang sudah terpetakan ke
      // induk dianggap sama dengan pemetaan ke turunannya (lalu digabung).
      let existing = existingDocs.find((d) => {
        const cur = Array.isArray(d.programIds) ? d.programIds.map(String) : [];
        return pidSetsRelated(cur, normPids, allPrograms);
      });
      if (!existing && existingDocs.length === 1 && (!existingDocs[0].programIds || existingDocs[0].programIds.length === 0)) {
        existing = existingDocs[0];
      }

      if (existing) {
        // Update pemetaan program jika ada program baru (gabungan dinormalisasi:
        // induk yang turunannya ikut terpetakan dibuang agar tidak ganda)
        const currentPids = Array.isArray(existing.programIds) ? existing.programIds.map(String) : [];
        const mergedPids = dropAncestorProgramIds([...currentPids, ...normPids], allPrograms);
        const curTbp = (existing.targetByProgram && typeof existing.targetByProgram === 'object') ? { ...existing.targetByProgram } : {};
        for (const k of Object.keys(curTbp)) {
          if (!mergedPids.includes(String(k))) delete curTbp[k];
        }

        let hasTbpChange = false;
        for (const pid of normPids) {
          const prev = curTbp[pid] || {};
          const newTp = tp > 0 ? tp : (prev.targetPeserta || 0);
          const newTl = tl > 0 ? tl : (prev.targetLulusan || 0);
          if (newTp !== prev.targetPeserta || newTl !== prev.targetLulusan) {
            curTbp[pid] = { targetPeserta: newTp, targetLulusan: newTl };
            hasTbpChange = true;
          }
        }

        const patch = {};
        const sameSet = mergedPids.length === currentPids.length && mergedPids.every((id) => currentPids.includes(id));
        if (!sameSet) { patch.programIds = mergedPids; hasTbpChange = true; }
        if (hasTbpChange) {
          patch.targetByProgram = curTbp;
          let totTp = 0, totTl = 0;
          for (const [pKey, pVal] of Object.entries(curTbp)) {
            if (mergedPids.includes(pKey)) {
              totTp += Number(pVal?.targetPeserta) || 0;
              totTl += Number(pVal?.targetLulusan) || 0;
            }
          }
          patch.targetPeserta = totTp;
          patch.targetLulusan = totTl;
        }

        if (Object.keys(patch).length > 0) {
          await existing.update(patch);
          updated.push({ id: existing.id, name });
        } else {
          skipped.push({ name, reason: "sudah terdaftar di program ini" });
        }
      } else {
        const initialTbp = {};
        for (const pid of normPids) {
          initialTbp[String(pid)] = { targetPeserta: tp, targetLulusan: tl };
        }
        const doc = await Diklat.create({
          uptId,
          year,
          name,
          programIds: normPids,
          targetPeserta: tp * normPids.length,
          targetLulusan: tl * normPids.length,
          targetByProgram: initialTbp,
          isActive: true,
          createdBy: req.uid,
        });
        created.push({ id: doc.id, name, programIds: normPids });

        for (const pid of normPids) {
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

/** POST/DELETE /api/diklats/bulk-delete (atau /bulk) — (UPT) hapus banyak diklat yang ditandai */
const handleBulkDelete = async (req, res) => {
  try {
    const uptId = req.user.uptId;
    if (!uptId) return res.status(400).json({ error: "Akun Anda belum ditautkan ke UPT." });
    const ids = req.body?.ids || req.query?.ids;
    const year = req.body?.year || req.query?.year;
    const y = Number(year) || new Date().getFullYear();

    const idList = Array.isArray(ids) ? ids : (typeof ids === "string" ? ids.split(",").filter(Boolean) : []);

    if (!idList.length) {
      return res.status(400).json({ error: "Pilih minimal 1 diklat untuk dihapus." });
    }

    const tSid = `${uptId}_${y}_00`;
    const tSub = await TargetSubmission.findOne({ where: { id: tSid } });
    if (tSub && ["pending_pimpinan", "pending_bpsdmp", "approved"].includes(tSub.status)) {
      return res.status(403).json({ error: `Target PK ${y} sudah dikirim dan terkunci (${tSub.status}). Tidak dapat menghapus diklat.` });
    }

    const count = await Diklat.destroy({
      where: {
        id: { [Op.in]: idList },
        uptId,
        year: y,
      },
    });

    audit(req, "BULK_DELETE_DIKLAT", "diklat", null, { year: y, count, idsCount: idList.length });
    res.json({ message: `${count} diklat terpilih berhasil dihapus.`, count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menghapus diklat terpilih: " + (err.message || err) });
  }
};
router.post("/bulk-delete", requireUpt, handleBulkDelete);
router.delete("/bulk-delete", requireUpt, handleBulkDelete);
router.post("/bulk", requireUpt, handleBulkDelete);
router.delete("/bulk", requireUpt, handleBulkDelete);

/** POST/DELETE /api/diklats/delete-all (atau /all) — (UPT) hapus seluruh diklat tahun ini */
const handleDeleteAll = async (req, res) => {
  try {
    const uptId = req.user.uptId;
    if (!uptId) return res.status(400).json({ error: "Akun Anda belum ditautkan ke UPT." });
    const y = Number(req.body?.year || req.query?.year) || new Date().getFullYear();

    const tSid = `${uptId}_${y}_00`;
    const tSub = await TargetSubmission.findOne({ where: { id: tSid } });
    if (tSub && ["pending_pimpinan", "pending_bpsdmp", "approved"].includes(tSub.status)) {
      return res.status(403).json({ error: `Target PK ${y} sudah dikirim dan terkunci (${tSub.status}). Tidak dapat menghapus diklat.` });
    }

    const count = await Diklat.destroy({
      where: { uptId, year: y },
    });

    audit(req, "DELETE_ALL_DIKLAT", "diklat", null, { year: y, count });
    res.json({ message: `Seluruh diklat (${count}) tahun ${y} berhasil dihapus.`, count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menghapus seluruh diklat: " + (err.message || err) });
  }
};
router.post("/delete-all", requireUpt, handleDeleteAll);
router.delete("/delete-all", requireUpt, handleDeleteAll);
router.post("/all", requireUpt, handleDeleteAll);
router.delete("/all", requireUpt, handleDeleteAll);

/**
 * POST /api/diklats/normalize-programs — (UPT) rapikan pemetaan ganda induk→turunan.
 * Bila satu diklat terpetakan ke induk DAN turunannya, yang dipertahankan hanya
 * yang paling spesifik (turunan) karena induk otomatis = jumlah turunan.
 * Target program yang kehilangan pemetaan dihitung ulang dari rincian diklat,
 * realisasi per diklat ikut dipindah, dan perubahan tercatat di riwayat revisi.
 * Body: { year } — tahun yang diperbaiki.
 */
router.post("/normalize-programs", requireUpt, async (req, res) => {
  try {
    const uptId = req.user.uptId;
    if (!uptId) return res.status(400).json({ error: "Akun Anda belum ditautkan ke UPT." });
    const y = Number(req.body?.year) || new Date().getFullYear();

    const tSid = `${uptId}_${y}_00`;
    const tSub = await TargetSubmission.findOne({ where: { id: tSid } });
    if (tSub && ["pending_pimpinan", "pending_bpsdmp", "approved"].includes(tSub.status)) {
      return res.status(403).json({ error: `Target PK ${y} terkunci (${tSub.status}). Ajukan Perubahan Target PK (unlock) dulu sebelum merapikan pemetaan.` });
    }

    const allPrograms = (await Program.findAll()).map((p) => p.toJSON());
    const progNameOf = (id) => allPrograms.find((p) => String(p.id) === String(id))?.name || "Program";
    const diklats = await Diklat.findAll({ where: { uptId, year: y }, order: [["name", "ASC"]] });
    if (!diklats.length) return res.json({ message: `Tidak ada diklat tahun ${y} untuk dirapikan.`, fixed: 0 });

    let fixed = 0;
    let movedReal = 0;
    let unmigrated = 0;
    const fixedNames = [];
    const removedPids = new Set();

    for (const d of diklats) {
      const cur = [...new Set((Array.isArray(d.programIds) ? d.programIds : []).map(String).filter(Boolean))];
      if (!cur.length) continue;
      const next = dropAncestorProgramIds(cur, allPrograms);
      if (next.length === cur.length && next.every((id) => cur.includes(id))) continue;
      if (!next.length) continue;
      const dropped = cur.filter((id) => !next.includes(id));

      const tbp = (d.targetByProgram && typeof d.targetByProgram === "object") ? { ...d.targetByProgram } : {};
      // Porsi lama per pid (untuk entri rincian yang belum ada)
      const oldTotTp = Number(d.targetPeserta) || 0;
      const oldTotTl = Number(d.targetLulusan) || 0;
      const shareTp = cur.length ? oldTotTp / cur.length : 0;
      const shareTl = cur.length ? oldTotTl / cur.length : 0;
      for (const pid of next) {
        if (tbp[String(pid)] === undefined) {
          tbp[String(pid)] = { targetPeserta: Math.round(shareTp), targetLulusan: Math.round(shareTl) };
        }
      }
      for (const pid of dropped) {
        delete tbp[pid];
        removedPids.add(String(pid));
      }
      let totTp = 0, totTl = 0;
      for (const pid of next) {
        const v = tbp[String(pid)];
        totTp += Number(v?.targetPeserta) || 0;
        totTl += Number(v?.targetLulusan) || 0;
      }
      await d.update({ programIds: next, targetByProgram: tbp, targetPeserta: totTp, targetLulusan: totTl });
      fixed++;
      if (fixedNames.length < 5) fixedNames.push(d.name);

      // Pindahkan realisasi per diklat dari induk yang dibuang (bila hanya 1
      // turunan dipertahankan; digabung bila baris tujuan sudah ada)
      if (next.length === 1) {
        const rows = await RealizationDiklat.findAll({ where: { uptId, diklatId: d.id, programId: { [Op.in]: dropped } } }).catch(() => []);
        for (const r of rows) {
          const rj = r.toJSON();
          const exist = await RealizationDiklat.findOne({ where: { uptId, year: rj.year, month: rj.month, programId: next[0], diklatId: d.id } });
          if (exist && String(exist.id) !== String(rj.id)) {
            const ej = exist.toJSON();
            await exist.update({
              pesertaL: (Number(ej.pesertaL) || 0) + (Number(rj.pesertaL) || 0),
              pesertaP: (Number(ej.pesertaP) || 0) + (Number(rj.pesertaP) || 0),
              lulusanL: (Number(ej.lulusanL) || 0) + (Number(rj.lulusanL) || 0),
              lulusanP: (Number(ej.lulusanP) || 0) + (Number(rj.lulusanP) || 0),
              totalPeserta: (Number(ej.totalPeserta) || 0) + (Number(rj.totalPeserta) || 0),
              totalLulusan: (Number(ej.totalLulusan) || 0) + (Number(rj.totalLulusan) || 0),
            });
            await r.destroy();
          } else {
            await r.update({ programId: next[0] });
          }
          movedReal++;
        }
      } else {
        const n = await RealizationDiklat.count({ where: { uptId, diklatId: d.id, programId: { [Op.in]: dropped } } }).catch(() => 0);
        unmigrated += n;
      }
    }

    if (!fixed) {
      return res.json({ message: `Pemetaan diklat tahun ${y} sudah rapi — tidak ada yang terpetakan ganda.`, fixed: 0 });
    }

    // Hitung ulang Target PK (month=0) program yang kehilangan pemetaan
    let targetUpdates = 0;
    if (removedPids.size) {
      const allD = await Diklat.findAll({ where: { uptId, year: y } });
      for (const pid of removedPids) {
        let tp = 0, tl = 0;
        for (const dd of allD) {
          const ids = (Array.isArray(dd.programIds) ? dd.programIds : []).map(String);
          if (!ids.includes(String(pid))) continue;
          const tb = (dd.targetByProgram && typeof dd.targetByProgram === "object") ? dd.targetByProgram[String(pid)] : null;
          tp += (tb && tb.targetPeserta !== undefined) ? Number(tb.targetPeserta) || 0 : 0;
          tl += (tb && tb.targetLulusan !== undefined) ? Number(tb.targetLulusan) || 0 : 0;
        }
        if (tp + tl > 0) {
          await Target.upsert({ uptId, year: y, month: 0, programId: pid, targetPeserta: tp, targetLulusan: tl, isYearly: true, createdBy: req.uid });
        } else {
          await Target.destroy({ where: { uptId, year: y, programId: pid, month: 0 } });
        }
        targetUpdates++;
      }
      await recordTargetRevision({ uptId, year: y, trigger: "perbaikan", user: { uid: req.uid, name: req.user?.name, email: req.user?.email } });
    }

    audit(req, "NORMALIZE_DIKLAT_PROGRAMS", "diklat", `${uptId}_${y}`, { year: y, fixed, movedReal });
    const sample = fixedNames.length ? `: ${fixedNames.join(", ")}${fixed > fixedNames.length ? ` (+${fixed - fixedNames.length} lainnya)` : ""}` : "";
    res.json({
      message: `Berhasil merapikan ${fixed} diklat tahun ${y}${sample} — kini hanya terpetakan ke kategori paling spesifik. ${targetUpdates} target program dihitung ulang${movedReal ? `, ${movedReal} realisasi diklat ikut dipindah` : ""}${unmigrated ? ` (${unmigrated} baris realisasi perlu cek manual)` : ""}. Cek kembali angka di Input Target PK.`,
      fixed, movedReal, unmigrated, targetUpdates,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal merapikan pemetaan: " + (err.message || err) });
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
      const progObjs = [];
      for (const pid of programIds) {
        const prog = await Program.findByPk(pid);
        if (!prog) return res.status(404).json({ error: `Program "${pid}" tidak ditemukan.` });
        progObjs.push(prog.toJSON());
      }
      // Normalisasi: induk yang turunannya ikut dipilih dibuang + rincian target dirapikan
      programIds = dropAncestorProgramIds(programIds, progObjs);
      if (!programIds.length) return res.status(400).json({ error: "Pemetaan program tidak valid." });
      patch.programIds = programIds;
      const curTbp = (doc.targetByProgram && typeof doc.targetByProgram === 'object') ? { ...doc.targetByProgram } : {};
      for (const k of Object.keys(curTbp)) {
        if (!programIds.includes(String(k))) delete curTbp[k];
      }
      let totTp = 0, totTl = 0;
      for (const pid of programIds) {
        const v = curTbp[String(pid)];
        totTp += Number(v?.targetPeserta) || 0;
        totTl += Number(v?.targetLulusan) || 0;
      }
      patch.targetByProgram = curTbp;
      patch.targetPeserta = totTp;
      patch.targetLulusan = totTl;
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
