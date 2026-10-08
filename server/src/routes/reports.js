const express = require("express");
const { authenticate, requireUpt, isSuperAdmin, isPusbang } = require("../middleware/auth");
const { Realization, Target, Upt, Program, Submission, Diklat, RealizationDiklat } = require("../models");
const { Op } = require("sequelize");

const router = express.Router();

router.use(authenticate);

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const ZERO_REAL = { pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0 };

function isMissingTableError(err) {
  return /doesn.?t exist|no such table|1146/i.test(err?.message || '');
}

/** Ambil rincian diklat dengan aman — kembalikan [] bila tabel belum tersinkron (server belum di-restart). */
async function findRealDiklatSafe(where) {
  try {
    return await RealizationDiklat.findAll({ where });
  } catch (err) {
    if (isMissingTableError(err)) {
      console.warn('[reports] tabel realization_diklats belum ada — restart server agar ikut tersinkron. Lanjut tanpa rincian diklat.');
      return [];
    }
    throw err;
  }
}

/** Ambil master diklat dengan aman */
async function findDiklatSafe(where) {
  try {
    return await Diklat.findAll({ where });
  } catch (err) {
    if (isMissingTableError(err)) {
      console.warn('[reports] tabel diklats belum ada. Lanjut tanpa master diklat.');
      return [];
    }
    throw err;
  }
}

function buildFlatPrograms(allProgs) {
  const parents = allProgs
    .filter((p) => !p.parentId)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
  const flat = [];
  for (const parent of parents) {
    if (parent.isActive !== false) flat.push({ ...parent, parentName: null, isParent: true });
    const children = allProgs
      .filter((c) => c.parentId === parent.id && c.isActive !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
    for (const c of children) flat.push({ ...c, parentName: parent.name, isParent: false });
  }
  return flat;
}

function buildUptReport({ upt, flat, realDocs, targetDocs, month, monthFrom, monthTo, diklatDocs = [], realDiklatDocs = [] }) {
  // Resolve effective month range
  const rangeFrom = monthFrom ? Number(monthFrom) : (month ? Number(month) : null);
  const rangeTo   = monthTo   ? Number(monthTo)   : (month ? Number(month) : null);
  const hasRange  = rangeFrom !== null && rangeTo !== null;
  const inRange   = (m) => !hasRange || (m >= rangeFrom && m <= rangeTo);
  const uptType = upt.uptType || (upt.matra === "aparatur" ? "aparatur" : "taruna");
  const visibleFlat = flat.filter((p) => {
    const tg = (p.targetGroup || "semua").toLowerCase();
    if (tg === "semua") return true;
    return tg === uptType;
  });

  const tgtByProg = new Map();
  for (const t of targetDocs) {
    if (!t.programId) continue;
    const mNum = Number(t.month);
    const prev = tgtByProg.get(t.programId) || { tpBulanan: 0, tlBulanan: 0, tpTahunan: 0, tlTahunan: 0 };
    const tp = Number(t.targetPeserta) || 0;
    const tl = Number(t.targetLulusan) || 0;

    if (mNum > 0) {
      prev.tpTahunan += tp;
      prev.tlTahunan += tl;
    } else if (mNum === 0) {
      if (prev.tpTahunan === 0) prev.tpTahunan = tp;
      if (prev.tlTahunan === 0) prev.tlTahunan = tl;
    }

    if (hasRange) {
      if (mNum >= 1 && inRange(mNum)) {
        prev.tpBulanan += tp;
        prev.tlBulanan += tl;
      }
    } else if (month) {
      if (mNum === month) {
        prev.tpBulanan += tp;
        prev.tlBulanan += tl;
      }
    } else {
      if (mNum > 0) {
        prev.tpBulanan += tp;
        prev.tlBulanan += tl;
      } else if (mNum === 0 && prev.tpBulanan === 0) {
        prev.tpBulanan = tp;
        prev.tlBulanan = tl;
      }
    }

    tgtByProg.set(t.programId, prev);
  }

  const realByProg = new Map();
  let anyLocked = false, anyDraft = false;
  for (const r of realDocs) {
    if (!r.programId) continue;
    const rMon = Number(r.month);
    if (hasRange && !inRange(rMon)) continue;
    if (!hasRange && month && rMon !== month) continue;
    const prev = realByProg.get(r.programId) || { ...ZERO_REAL, locked: false };
    const next = {
      pesertaL: prev.pesertaL + (Number(r.pesertaL) || 0), pesertaP: prev.pesertaP + (Number(r.pesertaP) || 0),
      lulusanL: prev.lulusanL + (Number(r.lulusanL) || 0), lulusanP: prev.lulusanP + (Number(r.lulusanP) || 0),
      locked: prev.locked || r.locked === true,
    };
    realByProg.set(r.programId, next);
    if (next.locked) anyLocked = true; else anyDraft = true;
  }
  const hasReported = realByProg.size > 0;

  // Build 12 months breakdown per program
  const monthlyByProg = new Map();
  for (const p of visibleFlat) {
    const monthsMap = new Map();
    for (let m = 1; m <= 12; m++) {
      monthsMap.set(m, { targetPeserta: 0, targetLulusan: 0, pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0 });
    }
    monthlyByProg.set(p.id, monthsMap);
  }

  // Kumpulkan target tahunan (month=0) per program sebagai fallback bila tidak ada target bulanan
  const annualTgtByProg = new Map(); // programId -> { tp, tl }
  for (const t of targetDocs) {
    if (!t.programId) continue;
    const mNum = Number(t.month);
    if (mNum >= 1 && mNum <= 12) {
      const pMap = monthlyByProg.get(t.programId);
      if (pMap) {
        const e = pMap.get(mNum);
        e.targetPeserta += (Number(t.targetPeserta) || 0);
        e.targetLulusan += (Number(t.targetLulusan) || 0);
      }
    } else if (mNum === 0) {
      const prev = annualTgtByProg.get(t.programId) || { tp: 0, tl: 0 };
      annualTgtByProg.set(t.programId, {
        tp: prev.tp + (Number(t.targetPeserta) || 0),
        tl: prev.tl + (Number(t.targetLulusan) || 0),
      });
    }
  }

  for (const r of realDocs) {
    if (!r.programId) continue;
    const mNum = Number(r.month);
    if (mNum >= 1 && mNum <= 12) {
      const pMap = monthlyByProg.get(r.programId);
      if (pMap) {
        const e = pMap.get(mNum);
        e.pesertaL += (Number(r.pesertaL) || 0);
        e.pesertaP += (Number(r.pesertaP) || 0);
        e.lulusanL += (Number(r.lulusanL) || 0);
        e.lulusanP += (Number(r.lulusanP) || 0);
      }
    }
  }

  // Target kanonis kini SINGLE-INPUT (month=0, nilai terbaru). Sisa dokumen
  // bulanan lama (month 1-12, termasuk yang bernilai 0) tidak boleh merusak
  // tampilan: fallback tahunan dipakai PER-PROGRAM bila program tersebut
  // tidak punya target bulanan bernilai. Flag global hanya menghitung
  // dokumen bulanan yang benar-benar bernilai.
  const hasAnyMonthlyTarget = targetDocs.some(
    (t) => Number(t.month) >= 1 && ((Number(t.targetPeserta) || 0) + (Number(t.targetLulusan) || 0)) > 0
  );
  const progHasMonthlyTarget = new Set();
  for (const [progId, pMap] of monthlyByProg.entries()) {
    for (let m = 1; m <= 12; m++) {
      const e = pMap.get(m);
      if (((e.targetPeserta || 0) + (e.targetLulusan || 0)) > 0) {
        progHasMonthlyTarget.add(String(progId));
        break;
      }
    }
  }
  // Bila program tidak punya target bulanan (single annual), distribusikan
  // target tahunan ke setiap bulan sehingga kolom "TARGET PK" tidak kosong (0).
  for (const [progId, ann] of annualTgtByProg.entries()) {
    if (progHasMonthlyTarget.has(String(progId))) continue;
    const pMap = monthlyByProg.get(progId);
    if (!pMap) continue;
    for (let m = 1; m <= 12; m++) {
      const e = pMap.get(m);
      e.targetPeserta = ann.tp;
      e.targetLulusan = ann.tl;
    }
  }

  // Rincian diklat per program (untuk tampilan hierarki induk → turunan → diklat).
  // Didefinisikan SEBELUM rows agar tidak TDZ.
  const diklats = (diklatDocs || []).map((d) => {
    const j = d.toJSON ? d.toJSON() : d;
    return { ...j, programIds: Array.isArray(j.programIds) ? j.programIds : [] };
  });
  const diklatById = new Map(diklats.map((d) => [String(d.id), d]));

  // Breakdown realisasi per diklat (menghormati filter bulan/rentang yang sama)
  const diklatRealByProg = new Map(); // programId -> diklatId -> entry
  for (const rd of realDiklatDocs || []) {
    const r = rd.toJSON ? rd.toJSON() : rd;
    if (!r.programId || !r.diklatId) continue;
    const rMon = Number(r.month);
    if (hasRange && !inRange(rMon)) continue;
    if (!hasRange && month && rMon !== month) continue;
    const pid = String(r.programId), did = String(r.diklatId);
    if (!diklatRealByProg.has(pid)) diklatRealByProg.set(pid, new Map());
    const byDiklat = diklatRealByProg.get(pid);
    if (!byDiklat.has(did)) {
      const master = diklatById.get(did);
      const tbp = (master?.targetByProgram && typeof master.targetByProgram === 'object') ? master.targetByProgram[pid] : null;
      const targetPeserta = (tbp && tbp.targetPeserta !== undefined) ? Number(tbp.targetPeserta) : (Number(master?.targetPeserta) || 0);
      const targetLulusan = (tbp && tbp.targetLulusan !== undefined) ? Number(tbp.targetLulusan) : (Number(master?.targetLulusan) || 0);
      byDiklat.set(did, {
        diklatId: r.diklatId, name: master?.name || "Diklat",
        targetPeserta,
        targetLulusan,
        pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0,
        byMonth: {},
      });
    }
    const e = byDiklat.get(did);
    e.pesertaL += Number(r.pesertaL) || 0; e.pesertaP += Number(r.pesertaP) || 0;
    e.lulusanL += Number(r.lulusanL) || 0; e.lulusanP += Number(r.lulusanP) || 0;
    const bm = e.byMonth[rMon] || { pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0 };
    bm.pesertaL += Number(r.pesertaL) || 0; bm.pesertaP += Number(r.pesertaP) || 0;
    bm.lulusanL += Number(r.lulusanL) || 0; bm.lulusanP += Number(r.lulusanP) || 0;
    e.byMonth[rMon] = bm;
  }
  const diklatDetailsByProg = new Map(
    [...diklatRealByProg.entries()].map(([pid, m]) => [pid, [...m.values()]])
  );
  // Sertakan juga diklat terpetakan yang belum ada realisasinya (angka 0) agar daftar sinkron
  for (const d of diklats) {
    for (const pid of d.programIds || []) {
      const key = String(pid);
      const arr = diklatDetailsByProg.get(key) || [];
      if (!arr.some((e) => String(e.diklatId) === String(d.id))) {
        const tbp = (d.targetByProgram && typeof d.targetByProgram === 'object') ? d.targetByProgram[key] : null;
        const targetPeserta = (tbp && tbp.targetPeserta !== undefined) ? Number(tbp.targetPeserta) : (Number(d.targetPeserta) || 0);
        const targetLulusan = (tbp && tbp.targetLulusan !== undefined) ? Number(tbp.targetLulusan) : (Number(d.targetLulusan) || 0);
        arr.push({
          diklatId: d.id, name: d.name,
          targetPeserta,
          targetLulusan,
          pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0,
          byMonth: {},
        });
        diklatDetailsByProg.set(key, arr);
      }
    }
  }
  for (const [, arr] of diklatDetailsByProg) arr.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const rows = visibleFlat.map((fp) => {
    const r = realByProg.get(fp.id) || { ...ZERO_REAL };
    const t = tgtByProg.get(fp.id) || { tpBulanan: 0, tlBulanan: 0, tpTahunan: 0, tlTahunan: 0 };
    const tpTahunan = t.tpTahunan || t.tpBulanan;
    const tlTahunan = t.tlTahunan || t.tlBulanan;
    // Acuan periode = target bulanan bila ada; bila kosong pakai tahunan
    // (single-input month=0 adalah kanonis terbaru). Per-program agar sisa
    // data bulanan lama tidak membuat baris kategori bernilai 0.
    let tpPeriode = t.tpBulanan;
    let tlPeriode = t.tlBulanan;
    if (tpPeriode === 0 && tpTahunan > 0) tpPeriode = tpTahunan;
    if (tlPeriode === 0 && tlTahunan > 0) tlPeriode = tlTahunan;
    return {
      programId: fp.id, programName: fp.name, parentId: fp.parentId || null, parentName: fp.parentName || "-", isParent: fp.isParent === true,
      targetGroup: fp.targetGroup || "semua",
      pesertaL: r.pesertaL, pesertaP: r.pesertaP, lulusanL: r.lulusanL, lulusanP: r.lulusanP,
      targetPeserta: tpPeriode, targetPesertaTahunan: tpTahunan,
      targetLulusan: tlPeriode, targetLulusanTahunan: tlTahunan,
      isSingle: !progHasMonthlyTarget.has(String(fp.id)),
      diklatDetails: diklatDetailsByProg.get(String(fp.id)) || [],
    };
  });
  const rowByPid = new Map(rows.map((r) => [r.programId, r]));

  for (const row of rows) {
    if (!row.isParent) continue;
    const kids = visibleFlat.filter((c) => !c.isParent && c.parentId === row.programId);
    if (!kids.length) continue;
    const sum = (key) => kids.reduce((s, k) => s + (rowByPid.get(k.id)?.[key] || 0), 0);
    row.pesertaL = sum("pesertaL"); row.pesertaP = sum("pesertaP");
    row.lulusanL = sum("lulusanL"); row.lulusanP = sum("lulusanP");
    row.targetPeserta = sum("targetPeserta"); row.targetPesertaTahunan = sum("targetPesertaTahunan");
    row.targetLulusan = sum("targetLulusan"); row.targetLulusanTahunan = sum("targetLulusanTahunan");

    const pMap = monthlyByProg.get(row.programId);
    if (pMap) {
      for (let m = 1; m <= 12; m++) {
        const e = pMap.get(m);
        e.targetPeserta = kids.reduce((s, k) => s + (monthlyByProg.get(k.id)?.get(m)?.targetPeserta || 0), 0);
        e.targetLulusan = kids.reduce((s, k) => s + (monthlyByProg.get(k.id)?.get(m)?.targetLulusan || 0), 0);
        e.pesertaL = kids.reduce((s, k) => s + (monthlyByProg.get(k.id)?.get(m)?.pesertaL || 0), 0);
        e.pesertaP = kids.reduce((s, k) => s + (monthlyByProg.get(k.id)?.get(m)?.pesertaP || 0), 0);
        e.lulusanL = kids.reduce((s, k) => s + (monthlyByProg.get(k.id)?.get(m)?.lulusanL || 0), 0);
        e.lulusanP = kids.reduce((s, k) => s + (monthlyByProg.get(k.id)?.get(m)?.lulusanP || 0), 0);
      }
    }
  }

  for (const row of rows) {
    const pMap = monthlyByProg.get(row.programId);
    row.byMonth = pMap ? Object.fromEntries(pMap.entries()) : {};
  }

  const parentRows = rows.filter((r) => r.isParent);
  const totalPeserta = parentRows.reduce((s, r) => s + r.pesertaL + r.pesertaP, 0);
  const totalLulusan = parentRows.reduce((s, r) => s + r.lulusanL + r.lulusanP, 0);
  const totalTargetPeserta = parentRows.reduce((s, r) => s + r.targetPeserta, 0);
  const totalTargetPesertaTahunan = parentRows.reduce((s, r) => s + (r.targetPesertaTahunan || r.targetPeserta), 0);
  const totalTargetLulusan = parentRows.reduce((s, r) => s + r.targetLulusan, 0);
  const totalTargetLulusanTahunan = parentRows.reduce((s, r) => s + (r.targetLulusanTahunan || r.targetLulusan), 0);


  return {
    uptId: upt.id, uptCode: upt.code || "-", uptName: upt.name || "-",
    matra: upt.matra || null, uptType, hasReported,
    locked: anyLocked, isDraft: anyDraft,
    totalPeserta, totalLulusan,
    totalTargetPeserta, totalTargetPesertaTahunan,
    totalTargetLulusan, totalTargetLulusanTahunan,
    isSingleTarget: !hasAnyMonthlyTarget,
    programs: rows,
    diklats,
  };
}

/** GET /api/reports?year=&month= (ADMIN & PUSBANG) */
router.get("/", async (req, res) => {
  if (!isSuperAdmin(req.user) && !isPusbang(req.user)) {
    return res.status(403).json({ error: "Akses khusus Super Admin atau Pusbang." });
  }
  const year = Number(req.query.year) || new Date().getFullYear();
  const month = req.query.month ? Number(req.query.month) : null;

  try {
    const [realDocs, targetDocs, uptDocs, progDocs, subDocs, diklatDocs] = await Promise.all([
      Realization.findAll({ where: { year } }),
      Target.findAll({ where: { year } }),
      Upt.findAll(),
      Program.findAll(),
      Submission.findAll({ where: { year } }),
      Diklat.findAll({ where: { year } }),
    ]);
    const realDiklatDocs = await findRealDiklatSafe({ year });

    const diklatByUpt = new Map();
    for (const d of diklatDocs) {
      const j = d.toJSON();
      if (!diklatByUpt.has(j.uptId)) diklatByUpt.set(j.uptId, []);
      diklatByUpt.get(j.uptId).push(j);
    }
    const realDiklatByUpt = new Map();
    for (const r of realDiklatDocs) {
      const j = r.toJSON();
      if (!realDiklatByUpt.has(j.uptId)) realDiklatByUpt.set(j.uptId, []);
      realDiklatByUpt.get(j.uptId).push(j);
    }

    const approvedByUptMonth = new Map();
    for (const s of subDocs) {
      if (s.status !== "approved") continue;
      if (month && Number(s.month) !== Number(month)) continue;
      if (!approvedByUptMonth.has(s.uptId)) approvedByUptMonth.set(s.uptId, new Set());
      approvedByUptMonth.get(s.uptId).add(Number(s.month));
    }

    let activeUpts = uptDocs
      .filter((u) => u.isActive !== false)
      .sort((a, b) => (a.code || "").localeCompare(b.code || ""));
    if (isPusbang(req.user)) {
      const matra = (req.user.pusbangMatra || "").toLowerCase();
      activeUpts = activeUpts.filter((u) => (u.matra || "").toLowerCase() === matra);
    }

    const allProgs = progDocs.map((d) => d.toJSON());
    const flat = buildFlatPrograms(allProgs);

    const realByUpt = new Map();
    for (const rDoc of realDocs) {
      const r = rDoc.toJSON();
      const approvedSet = approvedByUptMonth.get(r.uptId);
      if (!approvedSet || !approvedSet.has(Number(r.month))) continue;
      if (!realByUpt.has(r.uptId)) realByUpt.set(r.uptId, []);
      realByUpt.get(r.uptId).push(r);
    }
    const targetByUpt = new Map();
    for (const tDoc of targetDocs) {
      const t = tDoc.toJSON();
      const mNum = Number(t.month);
      if (mNum !== 0) {
        const approvedSet = approvedByUptMonth.get(t.uptId);
        if (!approvedSet || !approvedSet.has(mNum)) continue;
      } else {
        const approvedSet = approvedByUptMonth.get(t.uptId);
        if (!approvedSet || approvedSet.size === 0) continue;
      }
      if (!targetByUpt.has(t.uptId)) targetByUpt.set(t.uptId, []);
      targetByUpt.get(t.uptId).push(t);
    }

    // Rincian diklat mengikuti filter approved yang sama dengan realisasi program
    const approvedRealDiklatByUpt = new Map();
    for (const [uptId, list] of realDiklatByUpt.entries()) {
      const approvedSet = approvedByUptMonth.get(uptId);
      approvedRealDiklatByUpt.set(uptId, (list || []).filter((j) => approvedSet && approvedSet.has(Number(j.month))));
    }

    const upts = activeUpts.map((upt) =>
      buildUptReport({ upt: upt.toJSON(), flat, realDocs: realByUpt.get(upt.id) || [], targetDocs: targetByUpt.get(upt.id) || [], month, diklatDocs: diklatByUpt.get(upt.id) || [], realDiklatDocs: approvedRealDiklatByUpt.get(upt.id) || [] })
    );

    upts.sort((a, b) => {
      if (a.hasReported && !b.hasReported) return -1;
      if (!a.hasReported && b.hasReported) return 1;
      return (a.uptCode || "").localeCompare(b.uptCode || "");
    });

    const missing = upts.filter((u) => !u.hasReported).map((u) => ({ uptId: u.uptId, code: u.uptCode, name: u.uptName, matra: u.matra }));
    const totalPeserta = upts.reduce((s, u) => s + u.totalPeserta, 0);
    const totalLulusan = upts.reduce((s, u) => s + u.totalLulusan, 0);
    const totalTargetPeserta = upts.reduce((s, u) => s + u.totalTargetPeserta, 0);
    const totalTargetLulusan = upts.reduce((s, u) => s + u.totalTargetLulusan, 0);

    const summary = {
      uptTotal: activeUpts.length, uptReported: upts.filter((u) => u.hasReported).length,
      uptMissing: missing.length, totalPeserta, totalLulusan, totalTargetPeserta, totalTargetLulusan,
    };

    res.json({ year, month, monthName: month ? MONTH_NAMES[month - 1] : null, summary, upts, missing });
  } catch (err) {
    console.error("[GET /reports]", err);
    res.status(500).json({ error: `Gagal mengambil laporan realisasi: ${err.message || err}` });
  }
});

/** GET /api/reports/program-detail?year=&month= (ADMIN & PUSBANG) — rekap per program lintas matra */
router.get("/program-detail", async (req, res) => {
  if (!isSuperAdmin(req.user) && !isPusbang(req.user)) {
    return res.status(403).json({ error: "Akses khusus Super Admin atau Pusbang." });
  }
  const year = Number(req.query.year) || new Date().getFullYear();
  const month = req.query.month ? Number(req.query.month) : null;
  const matraQuery = req.query.matra ? String(req.query.matra).toLowerCase().trim() : null;
  const uptIdQuery = req.query.uptId ? String(req.query.uptId).trim() : null;
  try {
    const [realDocs, targetDocs, uptDocs, progDocs, subDocs, diklatDocs, realDiklatDocs] = await Promise.all([
      Realization.findAll({ where: { year } }),
      Target.findAll({ where: { year } }),
      Upt.findAll(),
      Program.findAll(),
      Submission.findAll({ where: { year } }),
      findDiklatSafe({ year }),
      findRealDiklatSafe({ year }),
    ]);
    const approvedByUptMonth = new Map();
    for (const s of subDocs) {
      if (s.status !== "approved") continue;
      if (month && Number(s.month) !== Number(month)) continue;
      if (!approvedByUptMonth.has(s.uptId)) approvedByUptMonth.set(s.uptId, new Set());
      approvedByUptMonth.get(s.uptId).add(Number(s.month));
    }
    let activeUpts = uptDocs.filter((u) => u.isActive !== false);
    if (isPusbang(req.user)) {
      const matra = (req.user.pusbangMatra || "").toLowerCase();
      activeUpts = activeUpts.filter((u) => (u.matra || "").toLowerCase() === matra);
    } else if (matraQuery && matraQuery !== "semua") {
      activeUpts = activeUpts.filter((u) => {
        const m = (u.matra || "").toLowerCase();
        const ut = (u.uptType || "").toLowerCase();
        if (matraQuery === "aparatur") return m === "aparatur" || ut === "aparatur";
        return m === matraQuery;
      });
    }

    if (uptIdQuery && uptIdQuery !== "semua" && uptIdQuery !== "") {
      activeUpts = activeUpts.filter((u) => String(u.id) === uptIdQuery);
    }

    const activeUptIds = new Set(activeUpts.map((u) => String(u.id)));
    const uptMap = new Map(activeUpts.map((u) => [String(u.id), u.toJSON ? u.toJSON() : u]));
    const allProgs = progDocs.map((d) => d.toJSON ? d.toJSON() : d);
    const flat = buildFlatPrograms(allProgs);
    const turunanList = flat;

    // Filter dan petakan diklat untuk UPT aktif
    const parsedDiklats = (diklatDocs || []).map((d) => {
      const j = d.toJSON ? d.toJSON() : d;
      let pids = [];
      if (Array.isArray(j.programIds)) {
        pids = j.programIds.map(String);
      } else if (typeof j.programIds === 'string') {
        try { pids = JSON.parse(j.programIds || '[]').map(String); } catch (_) { pids = []; }
      }
      return { ...j, programIds: pids };
    }).filter((d) => activeUptIds.has(String(d.uptId)) && d.isActive !== false);

    // Map realisasi diklat: `${diklatId}|${programId}|${month}` -> { pesertaL, pesertaP, lulusanL, lulusanP }
    const realDiklatMap = new Map();
    for (const rdDoc of (realDiklatDocs || [])) {
      const rd = rdDoc.toJSON ? rdDoc.toJSON() : rdDoc;
      if (!activeUptIds.has(String(rd.uptId))) continue;
      const approvedSet = approvedByUptMonth.get(rd.uptId);
      if (!approvedSet || !approvedSet.has(Number(rd.month))) continue;
      const key = `${rd.diklatId}|${rd.programId}|${rd.month}`;
      const prev = realDiklatMap.get(key) || { pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0 };
      realDiklatMap.set(key, {
        pesertaL: prev.pesertaL + (Number(rd.pesertaL) || 0),
        pesertaP: prev.pesertaP + (Number(rd.pesertaP) || 0),
        lulusanL: prev.lulusanL + (Number(rd.lulusanL) || 0),
        lulusanP: prev.lulusanP + (Number(rd.lulusanP) || 0),
      });
    }

    // Build real/target maps per UPT per program
    const realByUptProgMonth = new Map(); // uptId -> programId -> month -> {pesertaL, ...}
    for (const rDoc of realDocs) {
      const r = rDoc.toJSON ? rDoc.toJSON() : rDoc;
      const approvedSet = approvedByUptMonth.get(r.uptId);
      if (!approvedSet || !approvedSet.has(Number(r.month))) continue;
      if (month && Number(r.month) !== month) continue;
      const key = `${r.uptId}|${r.programId}|${r.month}`;
      const prev = realByUptProgMonth.get(key) || { pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0 };
      realByUptProgMonth.set(key, {
        pesertaL: prev.pesertaL + (Number(r.pesertaL) || 0),
        pesertaP: prev.pesertaP + (Number(r.pesertaP) || 0),
        lulusanL: prev.lulusanL + (Number(r.lulusanL) || 0),
        lulusanP: prev.lulusanP + (Number(r.lulusanP) || 0),
      });
    }
    const targetByUptProgMonth = new Map();
    for (const tDoc of targetDocs) {
      const t = tDoc.toJSON ? tDoc.toJSON() : tDoc;
      const mNum = Number(t.month);
      if (mNum === 0) {
        const approvedSet = approvedByUptMonth.get(t.uptId);
        if (!approvedSet || approvedSet.size === 0) continue;
      } else {
        if (month && mNum !== month) continue;
        const approvedSet = approvedByUptMonth.get(t.uptId);
        if (!approvedSet || !approvedSet.has(mNum)) continue;
      }
      if (mNum !== 0 && month && mNum !== month) continue;
      const key = `${t.uptId}|${t.programId}|${mNum}`;
      const prev = targetByUptProgMonth.get(key) || { tp: 0, tl: 0 };
      targetByUptProgMonth.set(key, { tp: prev.tp + (Number(t.targetPeserta) || 0), tl: prev.tl + (Number(t.targetLulusan) || 0) });
    }

    // Aggregate per program across all UPTs and matra
    const progAgg = [];
    for (const prog of turunanList) {
      const matraAgg = {
        darat: { pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0, targetPeserta: 0, targetLulusan: 0, uptCount: 0 },
        laut: { pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0, targetPeserta: 0, targetLulusan: 0, uptCount: 0 },
        udara: { pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0, targetPeserta: 0, targetLulusan: 0, uptCount: 0 },
        aparatur: { pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0, targetPeserta: 0, targetLulusan: 0, uptCount: 0 },
      };
      const monthly = {};
      for (let m = 1; m <= 12; m++) {
        monthly[m] = {
          pesertaL: 0, pesertaP: 0, totalPeserta: 0,
          lulusanL: 0, lulusanP: 0, totalLulusan: 0,
          targetPeserta: 0, targetLulusan: 0,
        };
      }

      let totalPesertaL = 0, totalPesertaP = 0, totalLulusanL = 0, totalLulusanP = 0, totalTargetPeserta = 0, totalTargetLulusan = 0;
      const uptSet = new Set();
      for (const upt of activeUpts) {
        const uptId = upt.id;
        const matraKey = (upt.matra || '').toLowerCase() === 'aparatur' || (upt.uptType || '').toLowerCase() === 'aparatur' ? 'aparatur' : (['darat','laut','udara'].includes((upt.matra||'').toLowerCase()) ? (upt.matra||'').toLowerCase() : null);
        if (!matraKey) continue;

        let rPesertaL = 0, rPesertaP = 0, rLulusanL = 0, rLulusanP = 0;
        let tPeserta = 0, tLulusan = 0;

        // Hitung 12 bulan
        for (let m = 1; m <= 12; m++) {
          const rKey = `${uptId}|${prog.id}|${m}`;
          const r = realByUptProgMonth.get(rKey);
          if (r) {
            monthly[m].pesertaL += r.pesertaL;
            monthly[m].pesertaP += r.pesertaP;
            monthly[m].totalPeserta += (r.pesertaL + r.pesertaP);
            monthly[m].lulusanL += r.lulusanL;
            monthly[m].lulusanP += r.lulusanP;
            monthly[m].totalLulusan += (r.lulusanL + r.lulusanP);
          }
          const tKey = `${uptId}|${prog.id}|${m}`;
          const t = targetByUptProgMonth.get(tKey);
          if (t) {
            monthly[m].targetPeserta += t.tp;
            monthly[m].targetLulusan += t.tl;
          }
        }

        if (month) {
          const rKey = `${uptId}|${prog.id}|${month}`;
          const r = realByUptProgMonth.get(rKey);
          if (r) { rPesertaL = r.pesertaL; rPesertaP = r.pesertaP; rLulusanL = r.lulusanL; rLulusanP = r.lulusanP; }
          const tKey = `${uptId}|${prog.id}|${month}`;
          const tKeyYearly = `${uptId}|${prog.id}|0`;
          const t = targetByUptProgMonth.get(tKey) || targetByUptProgMonth.get(tKeyYearly);
          if (t) { tPeserta = t.tp; tLulusan = t.tl; }
        } else {
          // All months sum
          for (let m = 1; m <= 12; m++) {
            const rKey = `${uptId}|${prog.id}|${m}`;
            const r = realByUptProgMonth.get(rKey);
            if (r) { rPesertaL += r.pesertaL; rPesertaP += r.pesertaP; rLulusanL += r.lulusanL; rLulusanP += r.lulusanP; }
            const tKey = `${uptId}|${prog.id}|${m}`;
            const t = targetByUptProgMonth.get(tKey);
            if (t) { tPeserta += t.tp; tLulusan += t.tl; }
          }
          const tYearly = targetByUptProgMonth.get(`${uptId}|${prog.id}|0`);
          if (tYearly) { tPeserta += tYearly.tp; tLulusan += tYearly.tl; }
        }

        const hasData = rPesertaL + rPesertaP + rLulusanL + rLulusanP + tPeserta + tLulusan > 0;
        if (hasData) uptSet.add(uptId);
        totalPesertaL += rPesertaL; totalPesertaP += rPesertaP; totalLulusanL += rLulusanL; totalLulusanP += rLulusanP;
        totalTargetPeserta += tPeserta; totalTargetLulusan += tLulusan;
        if (matraAgg[matraKey]) {
          matraAgg[matraKey].pesertaL += rPesertaL; matraAgg[matraKey].pesertaP += rPesertaP;
          matraAgg[matraKey].lulusanL += rLulusanL; matraAgg[matraKey].lulusanP += rLulusanP;
          matraAgg[matraKey].targetPeserta += tPeserta; matraAgg[matraKey].targetLulusan += tLulusan;
          if (hasData) matraAgg[matraKey].uptCount = (matraAgg[matraKey].uptCount || 0) + 1;
        }
      }

      // Kumpulkan detail diklat untuk program ini (hanya jika program turunan)
      const progDiklats = [];
      if (!prog.isParent) {
        for (const d of parsedDiklats) {
          if (!d.programIds.includes(String(prog.id))) continue;
          const u = uptMap.get(String(d.uptId));
          const dMonthly = {};
          let dTotPesertaL = 0, dTotPesertaP = 0, dTotLulusanL = 0, dTotLulusanP = 0;
          for (let m = 1; m <= 12; m++) {
            const rk = `${d.id}|${prog.id}|${m}`;
            const r = realDiklatMap.get(rk) || { pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0 };
            dMonthly[m] = {
              pesertaL: r.pesertaL,
              pesertaP: r.pesertaP,
              totalPeserta: r.pesertaL + r.pesertaP,
              lulusanL: r.lulusanL,
              lulusanP: r.lulusanP,
              totalLulusan: r.lulusanL + r.lulusanP,
            };
            if (!month || month === m) {
              dTotPesertaL += r.pesertaL;
              dTotPesertaP += r.pesertaP;
              dTotLulusanL += r.lulusanL;
              dTotLulusanP += r.lulusanP;
            }
          }
          progDiklats.push({
            id: d.id,
            name: d.name,
            uptId: d.uptId,
            uptCode: u?.code || '',
            uptName: u?.name || '',
            matra: u?.matra || '',
            targetPeserta: Number(d.targetPeserta) || 0,
            targetLulusan: Number(d.targetLulusan) || 0,
            totalPesertaL: dTotPesertaL,
            totalPesertaP: dTotPesertaP,
            totalPeserta: dTotPesertaL + dTotPesertaP,
            totalLulusanL: dTotLulusanL,
            totalLulusanP: dTotLulusanP,
            totalLulusan: dTotLulusanL + dTotLulusanP,
            monthly: dMonthly,
          });
        }
        progDiklats.sort((a, b) => a.name.localeCompare(b.name));
      }

      progAgg.push({
        programId: prog.id,
        programName: prog.name,
        parentName: prog.parentName,
        isParent: prog.isParent === true,
        order: prog.order || 0,
        targetGroup: prog.targetGroup || 'semua',
        category: prog.category || 'taruna',
        totalPesertaL, totalPesertaP, totalPeserta: totalPesertaL + totalPesertaP,
        totalLulusanL, totalLulusanP, totalLulusan: totalLulusanL + totalLulusanP,
        totalTargetPeserta, totalTargetLulusan,
        uptCount: uptSet.size,
        matra: matraAgg,
        monthly,
        diklats: progDiklats,
      });
    }

    // Auto-sum untuk program induk dari program-program turunannya
    const progMapAgg = new Map(progAgg.map(p => [p.programId, p]));
    for (const prog of progAgg) {
      const flatEntry = flat.find(f => f.id === prog.programId);
      if (!flatEntry || !flatEntry.isParent) continue;
      const children = flat.filter(c => c.parentId === prog.programId);
      if (!children.length) continue;
      let sPesertaL=0,sPesertaP=0,sLulusanL=0,sLulusanP=0,sTargetPeserta=0,sTargetLulusan=0;
      const mAgg = { darat: { pesertaL:0,pesertaP:0,lulusanL:0,lulusanP:0,targetPeserta:0,targetLulusan:0,uptCount:0 }, laut: { pesertaL:0,pesertaP:0,lulusanL:0,lulusanP:0,targetPeserta:0,targetLulusan:0,uptCount:0 }, udara: { pesertaL:0,pesertaP:0,lulusanL:0,lulusanP:0,targetPeserta:0,targetLulusan:0,uptCount:0 }, aparatur: { pesertaL:0,pesertaP:0,lulusanL:0,lulusanP:0,targetPeserta:0,targetLulusan:0,uptCount:0 } };
      const parentMonthly = {};
      for (let m = 1; m <= 12; m++) {
        parentMonthly[m] = {
          pesertaL: 0, pesertaP: 0, totalPeserta: 0,
          lulusanL: 0, lulusanP: 0, totalLulusan: 0,
          targetPeserta: 0, targetLulusan: 0,
        };
      }
      let totalDiklats = 0;

      for (const child of children) {
        const cAgg = progMapAgg.get(child.id);
        if (!cAgg) continue;
        sPesertaL += cAgg.totalPesertaL; sPesertaP += cAgg.totalPesertaP;
        sLulusanL += cAgg.totalLulusanL; sLulusanP += cAgg.totalLulusanP;
        sTargetPeserta += cAgg.totalTargetPeserta; sTargetLulusan += cAgg.totalTargetLulusan;
        totalDiklats += (cAgg.diklats || []).length;
        for (const mk of ['darat','laut','udara','aparatur']) {
          mAgg[mk].pesertaL += cAgg.matra[mk].pesertaL; mAgg[mk].pesertaP += cAgg.matra[mk].pesertaP;
          mAgg[mk].lulusanL += cAgg.matra[mk].lulusanL; mAgg[mk].lulusanP += cAgg.matra[mk].lulusanP;
          mAgg[mk].targetPeserta += cAgg.matra[mk].targetPeserta; mAgg[mk].targetLulusan += cAgg.matra[mk].targetLulusan;
          mAgg[mk].uptCount = Math.max(mAgg[mk].uptCount, cAgg.matra[mk].uptCount);
        }
        for (let m = 1; m <= 12; m++) {
          const cm = cAgg.monthly?.[m];
          if (cm) {
            parentMonthly[m].pesertaL += cm.pesertaL;
            parentMonthly[m].pesertaP += cm.pesertaP;
            parentMonthly[m].totalPeserta += cm.totalPeserta;
            parentMonthly[m].lulusanL += cm.lulusanL;
            parentMonthly[m].lulusanP += cm.lulusanP;
            parentMonthly[m].totalLulusan += cm.totalLulusan;
            parentMonthly[m].targetPeserta += cm.targetPeserta;
            parentMonthly[m].targetLulusan += cm.targetLulusan;
          }
        }
      }
      prog.totalPesertaL = sPesertaL; prog.totalPesertaP = sPesertaP; prog.totalPeserta = sPesertaL+sPesertaP;
      prog.totalLulusanL = sLulusanL; prog.totalLulusanP = sLulusanP; prog.totalLulusan = sLulusanL+sLulusanP;
      prog.totalTargetPeserta = sTargetPeserta; prog.totalTargetLulusan = sTargetLulusan;
      prog.matra = mAgg;
      prog.monthly = parentMonthly;
      prog.uptCount = Math.max(...children.map(c=>progMapAgg.get(c.id)?.uptCount||0),0);
      prog.diklatCount = totalDiklats;
    }
    const summary = {
      totalPrograms: progAgg.length,
      totalPeserta: progAgg.filter(p => !p.isParent).reduce((s,p)=>s+p.totalPeserta,0),
      totalLulusan: progAgg.filter(p => !p.isParent).reduce((s,p)=>s+p.totalLulusan,0),
      totalTargetPeserta: progAgg.filter(p => !p.isParent).reduce((s,p)=>s+p.totalTargetPeserta,0),
      totalTargetLulusan: progAgg.filter(p => !p.isParent).reduce((s,p)=>s+p.totalTargetLulusan,0),
      totalPesertaL: progAgg.filter(p => !p.isParent).reduce((s,p)=>s+p.totalPesertaL,0),
      totalPesertaP: progAgg.filter(p => !p.isParent).reduce((s,p)=>s+p.totalPesertaP,0),
      totalLulusanL: progAgg.filter(p => !p.isParent).reduce((s,p)=>s+p.totalLulusanL,0),
      totalLulusanP: progAgg.filter(p => !p.isParent).reduce((s,p)=>s+p.totalLulusanP,0),
    };
    const selectedUptObj = uptIdQuery && uptIdQuery !== "semua" ? uptDocs.find((u) => String(u.id) === uptIdQuery) : null;
    res.json({
      year,
      month,
      monthName: month ? MONTH_NAMES[month - 1] : null,
      matra: matraQuery || "semua",
      uptId: uptIdQuery || "",
      selectedUpt: selectedUptObj ? { id: selectedUptObj.id, code: selectedUptObj.code, name: selectedUptObj.name, matra: selectedUptObj.matra } : null,
      summary,
      programs: progAgg,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil detail data program." });
  }
});

/** GET /api/reports/my?year=&month=&monthFrom=&monthTo= (USER UPT) */
router.get("/my", requireUpt, async (req, res) => {
  const year       = Number(req.query.year) || new Date().getFullYear();
  const month      = req.query.month      ? Number(req.query.month)      : null;
  const monthFrom  = req.query.monthFrom  ? Number(req.query.monthFrom)  : null;
  const monthTo    = req.query.monthTo    ? Number(req.query.monthTo)    : null;

  try {
    const uptId = req.user.uptId;
    if (!uptId) return res.status(400).json({ error: "Akun Anda belum ditautkan ke UPT." });

    const [realDocs, targetDocs, uptDoc, progDocs, diklatDocs] = await Promise.all([
      Realization.findAll({ where: { uptId, year } }),
      Target.findAll({ where: { uptId, year } }),
      Upt.findByPk(uptId),
      Program.findAll(),
      Diklat.findAll({ where: { uptId, year } }),
    ]);
    const realDiklatDocs = await findRealDiklatSafe({ uptId, year });

    if (!uptDoc) return res.status(404).json({ error: "UPT tidak ditemukan." });

    const allProgs = progDocs.map((d) => d.toJSON());
    const flat = buildFlatPrograms(allProgs);

    const report = buildUptReport({
      upt: uptDoc.toJSON(), flat,
      realDocs: realDocs.map((r) => r.toJSON()),
      targetDocs: targetDocs.map((t) => t.toJSON()),
      month, monthFrom, monthTo,
      diklatDocs: diklatDocs.map((d) => d.toJSON()),
      realDiklatDocs: realDiklatDocs.map((r) => r.toJSON()),
    });

    const rangeLabel = monthFrom && monthTo
      ? `${MONTH_NAMES[monthFrom - 1]} - ${MONTH_NAMES[monthTo - 1]}`
      : (month ? MONTH_NAMES[month - 1] : null);

    res.json({
      year, month, monthFrom, monthTo,
      monthName: month ? MONTH_NAMES[month - 1] : null,
      rangeLabel,
      upt: report,
    });
  } catch (err) {
    console.error("[GET /reports/my]", err);
    res.status(500).json({ error: `Gagal mengambil laporan realisasi: ${err.message || err}` });
  }
});

module.exports = router;
