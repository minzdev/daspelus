const express = require("express");
const { authenticate, requireAdmin, requireUpt, isSuperAdmin, isPusbang, isPimpinan } = require("../middleware/auth");
const { Target, TargetSubmission, TargetRevision, Program, Upt, Submission, Realization, Diklat } = require("../models");
const { audit } = require("../lib/audit");
const notifier = require("../lib/notifier");
const { Op, where, fn, col } = require("sequelize");

const router = express.Router();

router.use(authenticate);

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** Ambil semua program aktif (sertakan targetGroup/category untuk filter per UPT) */
async function getTargetablePrograms(uptType = null) {
  const all = await Program.findAll({ order: [["order", "ASC"], ["name", "ASC"]] });
  const allData = all.map((p) => p.toJSON());

  const parents = allData
    .filter((p) => !p.parentId)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));

  const flat = [];
  for (const parent of parents) {
    if (parent.isActive !== false) {
      flat.push({ ...parent, parentName: parent.name, isParent: true });
    }
    const children = allData
      .filter((c) => c.parentId === parent.id && c.isActive !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
    for (const child of children) {
      flat.push({ ...child, parentName: parent.name, isParent: false });
    }
  }

  const filtered = uptType
    ? flat.filter((p) => {
        const tg = (p.targetGroup || p.category || 'semua').toLowerCase();
        if (tg === 'semua') return true;
        return tg === uptType.toLowerCase();
      })
    : flat;

  return filtered.map((p, index) => ({
    id: p.id,
    name: p.name,
    parentId: p.parentId || null,
    parentName: p.parentName || p.name,
    order: p.order || 0,
    sortOrder: index,
    isActive: true,
    isParent: p.isParent === true,
    category: p.category || 'taruna',
    targetGroup: p.targetGroup || p.category || 'semua',
  }));
}

function classifyTargets(docs) {
  const monthly = [];
  const yearly = [];
  for (const t of docs) {
    if (!t.programId || t.month == null) continue;
    if (Number(t.month) === 0) yearly.push(t);
    else monthly.push(t);
  }
  return { monthly, yearly };
}

/**
 * Catat snapshot revisi Target PK (month=0) UPT/tahun bila nilai berubah.
 * Dipanggil setelah PUT /my, POST /import, DELETE program. Kegagalan
 * pencatatan tidak boleh menggagalkan simpan utama.
 */
async function recordTargetRevision({ uptId, year, trigger, user }) {
  try {
    const rows = await Target.findAll({ where: { uptId, year, month: 0 } });
    const items = [];
    let tp = 0, tl = 0;
    for (const r of rows) {
      const j = r.toJSON();
      const p = Number(j.targetPeserta) || 0;
      const l = Number(j.targetLulusan) || 0;
      if (p + l <= 0) continue;
      tp += p; tl += l;
      items.push({ programId: String(j.programId), targetPeserta: p, targetLulusan: l });
    }
    items.sort((a, b) => a.programId.localeCompare(b.programId));
    const signature = JSON.stringify({ tp, tl, items });
    const latest = await TargetRevision.findOne({
      where: { uptId, year },
      order: [["revisionNo", "DESC"]],
    });
    if (latest) {
      const lj = latest.toJSON();
      const prevSig = JSON.stringify({
        tp: Number(lj.targetPeserta) || 0,
        tl: Number(lj.targetLulusan) || 0,
        items: Array.isArray(lj.items) ? lj.items : [],
      });
      if (prevSig === signature) return null; // tidak berubah -> jangan duplikat
      await TargetRevision.create({
        uptId, year, revisionNo: (Number(lj.revisionNo) || 0) + 1,
        trigger, targetPeserta: tp, targetLulusan: tl, items,
        createdBy: user?.uid || user?.id || null,
        createdByName: user?.name || user?.email || null,
      });
      return (Number(lj.revisionNo) || 0) + 1;
    }
    await TargetRevision.create({
      uptId, year, revisionNo: 1,
      trigger, targetPeserta: tp, targetLulusan: tl, items,
      createdBy: user?.uid || user?.id || null,
      createdByName: user?.name || user?.email || null,
    });
    return 1;
  } catch (e) {
    console.warn("[target-revision] gagal mencatat:", e.message);
    return null;
  }
}

// ============================================================================
// ADMIN — read-only
// ============================================================================

/** GET /api/targets?year=2026 - (ADMIN) */
router.get("/", requireAdmin, async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  try {
    const [targetSnap, upts, programs, targetSubSnap, diklatSnap, revisionSnap] = await Promise.all([
      Target.findAll({ where: { year } }),
      Upt.findAll({ order: [["code", "ASC"]] }),
      getTargetablePrograms(),
      TargetSubmission.findAll({ where: { year, status: "approved" } }),
      Diklat.findAll({ where: { year } }),
      TargetRevision.findAll({ where: { year }, order: [["uptId", "ASC"], ["revisionNo", "ASC"]] }),
    ]);
    const diklatByUpt = new Map();
    for (const d of diklatSnap) {
      const j = d.toJSON();
      if (!diklatByUpt.has(j.uptId)) diklatByUpt.set(j.uptId, []);
      diklatByUpt.get(j.uptId).push({ ...j, programIds: Array.isArray(j.programIds) ? j.programIds : [] });
    }

    const sortOrderMap = new Map(programs.map((p) => [p.id, p.sortOrder ?? 9999]));
    const sortByProgramOrder = (a, b) => (sortOrderMap.get(a.programId) ?? 9999) - (sortOrderMap.get(b.programId) ?? 9999);

    // Peta UPT -> Set(month) approved
    const approvedTargetMonths = new Map();
    const approvedTargetYearly = new Map();
    for (const s of targetSubSnap) {
      if (!approvedTargetMonths.has(s.uptId)) approvedTargetMonths.set(s.uptId, new Set());
      if (Number(s.month) === 0) {
        approvedTargetYearly.set(s.uptId, true);
      } else {
        approvedTargetMonths.get(s.uptId).add(Number(s.month));
      }
    }

    const byUptMonthly = new Map();
    const byUptYearly = new Map();
    for (const t of targetSnap) {
      const mNum = Number(t.month);
      const appSet = approvedTargetMonths.get(t.uptId);
      const isYearlyApp = approvedTargetYearly.get(t.uptId);

      if (mNum === 0) {
        if (!isYearlyApp && targetSubSnap.length > 0) continue;
        if (!byUptYearly.has(t.uptId)) byUptYearly.set(t.uptId, []);
        byUptYearly.get(t.uptId).push(t);
      } else {
        if ((!appSet || !appSet.has(mNum)) && targetSubSnap.length > 0) continue;
        if (!byUptMonthly.has(t.uptId)) byUptMonthly.set(t.uptId, []);
        byUptMonthly.get(t.uptId).push(t);
      }
    }

    const progMap = new Map(programs.map((p) => [p.id, p]));

    // Ringkasan revisi per UPT: PK Awal (revisi #1) vs PK Revisi (terakhir)
    const revisionByUpt = new Map();
    for (const revDoc of revisionSnap) {
      const r = revDoc.toJSON();
      if (!revisionByUpt.has(r.uptId)) revisionByUpt.set(r.uptId, []);
      revisionByUpt.get(r.uptId).push(r);
    }
    const revisionSummary = (uptId) => {
      const list = revisionByUpt.get(uptId) || [];
      if (!list.length) return { count: 0, first: null, last: null };
      const pick = (r) => ({
        no: Number(r.revisionNo) || 0,
        peserta: Number(r.targetPeserta) || 0,
        lulusan: Number(r.targetLulusan) || 0,
        total: (Number(r.targetPeserta) || 0) + (Number(r.targetLulusan) || 0),
        at: r.createdAt || null,
        trigger: r.trigger || null,
      });
      return { count: list.length, first: pick(list[0]), last: pick(list[list.length - 1]) };
    };

    const targets = upts.map((upt) => {
      const monthlyDocs = (byUptMonthly.get(upt.id) || []).map((t) => t.toJSON());
      const yearlyDocs = (byUptYearly.get(upt.id) || []).map((t) => t.toJSON());

      // Monthly grouped
      const byProgramMonthly = new Map();
      for (const t of monthlyDocs) {
        if (!byProgramMonthly.has(t.programId)) byProgramMonthly.set(t.programId, []);
        byProgramMonthly.get(t.programId).push(t);
      }
      const itemsMonthly = [];
      for (const [pid, monthDocs] of byProgramMonthly.entries()) {
        const prog = progMap.get(pid);
        const months = monthDocs
          .map((t) => ({ month: Number(t.month), targetPeserta: t.targetPeserta || 0, targetLulusan: t.targetLulusan || 0 }))
          .sort((a, b) => a.month - b.month);
        itemsMonthly.push({
          programId: pid, programName: prog ? prog.name : "Program terhapus",
          parentId: prog ? prog.parentId : null, parentName: prog ? prog.parentName : "-",
          months,
          targetPeserta: months.reduce((s, m) => s + m.targetPeserta, 0),
          targetLulusan: months.reduce((s, m) => s + m.targetLulusan, 0),
        });
      }
      itemsMonthly.sort(sortByProgramOrder);

      // Yearly (Kumulatif bulan 1-12)
      const yearlyMap = new Map();
      for (const it of itemsMonthly) {
        yearlyMap.set(it.programId, {
          programId: it.programId, programName: it.programName,
          parentId: it.parentId, parentName: it.parentName,
          targetPeserta: it.targetPeserta,
          targetLulusan: it.targetLulusan,
          isCumulative: true,
        });
      }
      for (const t of yearlyDocs) {
        if (!yearlyMap.has(t.programId)) {
          const prog = progMap.get(t.programId);
          yearlyMap.set(t.programId, {
            programId: t.programId, programName: prog ? prog.name : "Program terhapus",
            parentId: prog ? prog.parentId : null, parentName: prog ? prog.parentName : "-",
            targetPeserta: t.targetPeserta || 0, targetLulusan: t.targetLulusan || 0,
            isCumulative: false,
          });
        }
      }
      const yearlyItems = [...yearlyMap.values()].sort(sortByProgramOrder);

      const monthlyPeserta = itemsMonthly.reduce((s, i) => s + i.targetPeserta, 0);
      const monthlyLulusan = itemsMonthly.reduce((s, i) => s + i.targetLulusan, 0);
      const yearlyPeserta = yearlyItems.reduce((s, i) => s + i.targetPeserta, 0);
      const yearlyLulusan = yearlyItems.reduce((s, i) => s + i.targetLulusan, 0);

      // SINGLE-INPUT: items kanonis = yearlyItems bila ada, fallback ke agregat bulanan lama
      const singleItems = yearlyItems.length > 0 ? yearlyItems : itemsMonthly.map((it) => ({
        programId: it.programId, programName: it.programName,
        parentId: it.parentId, parentName: it.parentName,
        targetPeserta: it.targetPeserta, targetLulusan: it.targetLulusan,
        isSingle: true,
      }));
      return {
        uptId: upt.id, uptCode: upt.code, uptName: upt.name,
        isActiveUpt: upt.isActive, matra: upt.matra || null, uptType: upt.uptType || null, year,
        items: singleItems, monthlyItems: itemsMonthly, yearlyItems,
        targetPeserta: yearlyPeserta,
        targetLulusan: yearlyLulusan,
        monthlyPeserta, monthlyLulusan, yearlyPeserta, yearlyLulusan,
        diklats: diklatByUpt.get(upt.id) || [],
        diklatCount: (diklatByUpt.get(upt.id) || []).length,
        revision: revisionSummary(upt.id),
      };
    });

    res.json({ year, programs, targets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil target PK." });
  }
});

// ============================================================================
// UPT — isi target PK milik sendiri
// ============================================================================

/** GET /api/targets/my?year=2026 */
router.get("/my", requireUpt, async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  try {
    const uptId = req.user.uptId;
    if (!uptId) return res.status(400).json({ error: "Akun Anda belum ditautkan ke UPT." });

    const uptDoc = await Upt.findByPk(uptId);
    if (!uptDoc) return res.status(404).json({ error: "UPT tidak ditemukan." });

    // Tentukan tipe UPT untuk filter program (taruna / aparatur)
    const uptType = uptDoc.uptType || (uptDoc.matra === "aparatur" ? "aparatur" : "taruna");

    const [targetDocs, programs, diklatDocs] = await Promise.all([
      Target.findAll({ where: { uptId, year } }),
      getTargetablePrograms(uptType),
      Diklat.findAll({ where: { uptId, year }, order: [["name", "ASC"]] }),
    ]);

    const progMap = new Map(programs.map((p) => [p.id, p]));
    const sortOrderMap = new Map(programs.map((p) => [p.id, p.sortOrder ?? 9999]));
    const sortByProgramOrder = (a, b) => (sortOrderMap.get(a.programId) ?? 9999) - (sortOrderMap.get(b.programId) ?? 9999);

    const { monthly, yearly } = classifyTargets(targetDocs.map((t) => t.toJSON()));

    const byProgramMonthly = new Map();
    for (const t of monthly) {
      if (!byProgramMonthly.has(t.programId)) byProgramMonthly.set(t.programId, []);
      byProgramMonthly.get(t.programId).push(t);
    }
    const itemsMonthly = [];
    for (const [pid, monthDocs] of byProgramMonthly.entries()) {
      const prog = progMap.get(pid);
      const months = monthDocs
        .map((t) => ({ month: Number(t.month), targetPeserta: t.targetPeserta || 0, targetLulusan: t.targetLulusan || 0 }))
        .sort((a, b) => a.month - b.month);
      itemsMonthly.push({
        programId: pid, programName: prog ? prog.name : "Program terhapus",
        parentId: prog ? prog.parentId : null, parentName: prog ? prog.parentName : "-",
        months,
        targetPeserta: months.reduce((s, m) => s + m.targetPeserta, 0),
        targetLulusan: months.reduce((s, m) => s + m.targetLulusan, 0),
      });
    }
    itemsMonthly.sort(sortByProgramOrder);

    // Target Tahunan (Kumulatif bulan 1-12)
    const yearlyMap = new Map();
    for (const it of itemsMonthly) {
      yearlyMap.set(it.programId, {
        programId: it.programId, programName: it.programName,
        parentId: it.parentId, parentName: it.parentName,
        targetPeserta: it.targetPeserta,
        targetLulusan: it.targetLulusan,
        isCumulative: true,
      });
    }
    for (const t of yearly) {
      if (!yearlyMap.has(t.programId)) {
        const prog = progMap.get(t.programId);
        yearlyMap.set(t.programId, {
          programId: t.programId, programName: prog ? prog.name : "Program terhapus",
          parentId: prog ? prog.parentId : null, parentName: prog ? prog.parentName : "-",
          targetPeserta: t.targetPeserta || 0, targetLulusan: t.targetLulusan || 0,
          isCumulative: false,
        });
      }
    }
    const yearlyItems = [...yearlyMap.values()].sort(sortByProgramOrder);

    const monthlyPeserta = itemsMonthly.reduce((s, i) => s + i.targetPeserta, 0);
    const monthlyLulusan = itemsMonthly.reduce((s, i) => s + i.targetLulusan, 0);
    const yearlyPeserta = yearlyItems.reduce((s, i) => s + i.targetPeserta, 0);
    const yearlyLulusan = yearlyItems.reduce((s, i) => s + i.targetLulusan, 0);

    // Cek status persetujuan
    const subSnap = await TargetSubmission.findAll({ where: { uptId, year } });
    const approvedMonths = new Set();
    for (const sd of subSnap) {
      if (sd.status === "approved") {
        if (sd.month === 0 || sd.month === "00") {
          for (let i = 1; i <= 12; i++) approvedMonths.add(i);
        } else {
          approvedMonths.add(Number(sd.month));
        }
      }
    }

    const progNameMap = new Map(programs.map((p) => [p.id, p.name]));
    const diklats = diklatDocs.map((d) => {
      const j = d.toJSON();
      const ids = Array.isArray(j.programIds) ? j.programIds : [];
      return {
        ...j,
        programIds: ids,
        programNames: ids.map((id) => progNameMap.get(id) || "Program terhapus"),
      };
    });

    // Single-input: dokumen month=0 adalah kanonis. Fallback agregat lama (bulanan) bila belum migrasi.
    const singleItems = yearlyItems.length > 0 ? yearlyItems : itemsMonthly.map((it) => ({
      programId: it.programId, programName: it.programName,
      parentId: it.parentId, parentName: it.parentName,
      targetPeserta: it.targetPeserta, targetLulusan: it.targetLulusan,
      isSingle: true,
    }));
    const singlePeserta = singleItems.reduce((s, i) => s + (i.targetPeserta || 0), 0);
    const singleLulusan = singleItems.reduce((s, i) => s + (i.targetLulusan || 0), 0);

    const target = {
      uptId, uptCode: uptDoc.code, uptName: uptDoc.name,
      isActiveUpt: uptDoc.isActive, matra: uptDoc.matra || null, year,
      items: singleItems, yearlyItems, monthlyItems: itemsMonthly,
      targetPeserta: singlePeserta,
      targetLulusan: singleLulusan,
      monthlyPeserta, monthlyLulusan, yearlyPeserta, yearlyLulusan,
      singlePeserta, singleLulusan,
    };

    // Untuk popup Input Realisasi: kirim status per bulan (belum diatur / pending_pimpinan / pending_bpsdmp / approved / rejected)
    const targetSubmissions = subSnap.map((s) => s.toJSON());
    const isApproved = subSnap.some((s) => Number(s.month) === 0 && s.status === "approved");

    res.json({ year, programs, target, diklats, upt: uptDoc.toJSON(), approvedMonths: [...approvedMonths], targetSubmissions, isApproved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil target PK Anda." });
  }
});

/** GET /api/targets/history - riwayat Target PK untuk UPT (untuk filter Riwayat Input) */
router.get("/history", requireUpt, async (req, res) => {
  const uptId = req.user.uptId;
  if (!uptId) return res.status(400).json({ error: "Akun belum tertaut ke UPT." });
  try {
    const list = await TargetSubmission.findAll({ where: { uptId }, order: [["year", "DESC"], ["month", "DESC"]] });
    res.json({ submissions: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil riwayat Target PK." });
  }
});

/**
 * PUT /api/targets/my - (UPT) upsert target SINGLE-INPUT (satu kali per tahun).
 * Body:
 *  - items: [{ programId, targetPeserta, targetLulusan }] untuk program tanpa rincian diklat
 *  - diklatTargets: [{ diklatId, targetPeserta, targetLulusan }] angka per diklat;
 *    total per program = jumlah diklat yang memetakan program tersebut + items langsung.
 * Kompatibel lama: item { programId, months:[{month, targetPeserta, targetLulusan}] } akan dijumlahkan jadi single.
 */
router.put("/my", requireUpt, async (req, res) => {
  const { year, items: rawItems, diklatTargets: rawDiklatTargets } = req.body;
  const y = Number(year);
  if (!y || y < 2000 || y > 2100) return res.status(400).json({ error: "Tahun wajib diisi." });
  const uptId = req.user.uptId;
  if (!uptId) return res.status(400).json({ error: "Akun Anda belum ditautkan ke UPT." });

  try {
    const uptDoc = await Upt.findByPk(uptId);
    if (!uptDoc) return res.status(404).json({ error: "UPT tidak ditemukan." });

    // Kunci: jika Target PK single tahun ini sudah dikirim/disetujui, tolak edit
    const tSid = `${uptId}_${y}_00`;
    const tSub = await TargetSubmission.findOne({ where: { id: tSid } });
    if (tSub && ["pending_pimpinan", "pending_bpsdmp", "approved"].includes(tSub.status)) {
      return res.status(403).json({ error: `Target PK ${y} sudah dikirim ke Pimpinan dan terkunci (${tSub.status}). Ajukan Perubahan Target PK untuk revisi.` });
    }

    // 1) Terapkan target per diklat (independen per program via targetByProgram)
    const diklatTargets = Array.isArray(rawDiklatTargets) ? rawDiklatTargets : [];
    const diklatUpdates = new Map(); // diklatId -> { doc, byProg, fallbackTp, fallbackTl }
    for (const dt of diklatTargets) {
      const diklat = await Diklat.findByPk(dt.diklatId);
      if (!diklat) return res.status(404).json({ error: `Diklat "${dt.diklatId}" tidak ditemukan.` });
      if (diklat.uptId !== uptId || Number(diklat.year) !== y) {
        return res.status(403).json({ error: `Diklat "${diklat.name}" bukan milik UPT/tahun ini.` });
      }
      const singleTarget = dt.target !== undefined ? dt.target : dt.targetPk;
      const tp = Number(singleTarget !== undefined ? singleTarget : dt.targetPeserta);
      const tl = Number(singleTarget !== undefined ? singleTarget : dt.targetLulusan);
      if (!Number.isFinite(tp) || !Number.isFinite(tl) || tp < 0 || tl < 0) {
        return res.status(400).json({ error: `Target diklat "${diklat.name}" harus angka ≥ 0.` });
      }
      if (tl > tp && singleTarget === undefined) {
        return res.status(400).json({ error: `Diklat "${diklat.name}": Lulusan (${tl}) tidak boleh lebih besar dari Peserta (${tp}).` });
      }
      const dKey = String(diklat.id);
      if (!diklatUpdates.has(dKey)) {
        const curTbp = (diklat.targetByProgram && typeof diklat.targetByProgram === 'object') ? { ...diklat.targetByProgram } : {};
        diklatUpdates.set(dKey, { doc: diklat, byProg: curTbp, fallbackTp: tp, fallbackTl: tl });
      }
      const u = diklatUpdates.get(dKey);
      if (dt.programId) {
        u.byProg[String(dt.programId)] = { targetPeserta: tp, targetLulusan: tl };
      } else {
        u.fallbackTp = tp;
        u.fallbackTl = tl;
      }
    }
    for (const [, u] of diklatUpdates) {
      const pids = Array.isArray(u.doc.programIds) ? u.doc.programIds.map(String) : [];
      let totTp = 0;
      let totTl = 0;
      if (Object.keys(u.byProg).length > 0) {
        for (const [pid, val] of Object.entries(u.byProg)) {
          if (!pids.length || pids.includes(String(pid))) {
            totTp += Number(val?.targetPeserta) || 0;
            totTl += Number(val?.targetLulusan) || 0;
          }
        }
      } else {
        totTp = u.fallbackTp;
        totTl = u.fallbackTl;
      }
      await u.doc.update({ targetPeserta: totTp, targetLulusan: totTl, targetByProgram: u.byProg });
    }

    // 2) Target langsung per program (untuk program tanpa rincian). Selalu catat disebut agar 0 bisa menghapus.
    let items = Array.isArray(rawItems) ? rawItems : [];
    const directMap = new Map(); // programId -> { tp, tl }
    for (const it of items) {
      if (!it.programId) continue;
      let tp, tl;
      const singleTarget = it.target !== undefined ? it.target : it.targetPk;
      if (singleTarget !== undefined) {
        tp = Number(singleTarget);
        tl = Number(singleTarget);
      } else if (Array.isArray(it.months)) {
        // kompat lama: jumlahkan months jadi single
        tp = it.months.reduce((s, m) => s + (Number(m.targetPeserta) || 0), 0);
        tl = it.months.reduce((s, m) => s + (Number(m.targetLulusan) || 0), 0);
        if (it.targetPeserta !== undefined) tp = Number(it.targetPeserta);
        if (it.targetLulusan !== undefined) tl = Number(it.targetLulusan);
      } else {
        tp = Number(it.targetPeserta);
        tl = Number(it.targetLulusan);
      }
      if (!Number.isFinite(tp) || !Number.isFinite(tl) || tp < 0 || tl < 0) {
        return res.status(400).json({ error: `Target program harus angka ≥ 0.` });
      }
      if (tl > tp && singleTarget === undefined) {
        const prog = await Program.findByPk(it.programId);
        return res.status(400).json({ error: `"${prog ? prog.name : it.programId}": Lulusan (${tl}) tidak boleh lebih besar dari Peserta (${tp}).` });
      }
      directMap.set(String(it.programId), { tp, tl });
    }

    if (diklatUpdates.size === 0 && directMap.size === 0) {
      return res.status(400).json({ error: "Isi target minimal untuk satu program atau satu diklat." });
    }

    // 3) Hitung ulang total per program dari SELURUH diklat di DB + nilai langsung, untuk program yang tersentuh
    const touched = new Set();
    for (const [, u] of diklatUpdates) {
      const ids = Array.isArray(u.doc.programIds) ? u.doc.programIds : [];
      for (const pid of ids) touched.add(String(pid));
      for (const pid of Object.keys(u.byProg)) touched.add(String(pid));
    }
    for (const pid of directMap.keys()) touched.add(String(pid));

    const allDiklats = await Diklat.findAll({ where: { uptId, year: y } });
    const progSum = new Map(); // pid -> { tp, tl }
    for (const pid of touched) progSum.set(pid, { tp: 0, tl: 0 });
    for (const d of allDiklats) {
      const ids = Array.isArray(d.programIds) ? d.programIds : [];
      const tbp = (d.targetByProgram && typeof d.targetByProgram === 'object') ? d.targetByProgram : {};
      for (const pid of ids) {
        const key = String(pid);
        if (!touched.has(key)) continue;
        const cur = progSum.get(key) || { tp: 0, tl: 0 };
        const progVal = tbp[key];
        const tp = (progVal && progVal.targetPeserta !== undefined) ? Number(progVal.targetPeserta) : (Number(d.targetPeserta) || 0);
        const tl = (progVal && progVal.targetLulusan !== undefined) ? Number(progVal.targetLulusan) : (Number(d.targetLulusan) || 0);
        cur.tp += tp;
        cur.tl += tl;
        progSum.set(key, cur);
      }
    }
    // Tambahkan nilai langsung (program tanpa rincian). Jika program punya rincian diklat,
    // nilai langsung diabaikan agar tidak ganda — frontend sudah menyembunyikannya.
    for (const [pid, v] of directMap.entries()) {
      const hasRincian = allDiklats.some((d) => (Array.isArray(d.programIds) ? d.programIds.map(String) : []).includes(pid));
      if (hasRincian) continue;
      progSum.set(pid, { tp: v.tp, tl: v.tl });
    }

    // 4) Upsert Target month=0 per program hasil agregasi; hapus sisa bulanan lama agar single kanonis
    let setCount = 0;
    for (const [pid, v] of progSum.entries()) {
      const prog = await Program.findByPk(pid);
      if (!prog) return res.status(404).json({ error: `Program "${pid}" tidak ditemukan.` });
      // Bersihkan sisa data bulanan lama program ini agar tidak ganda di agregat
      await Target.destroy({ where: { uptId, year: y, programId: pid, month: { [Op.ne]: 0 } } });
      if (v.tp + v.tl <= 0) {
        await Target.destroy({ where: { uptId, year: y, programId: pid, month: 0 } });
        continue;
      }
      await Target.upsert({
        uptId, year: y, month: 0, programId: pid,
        targetPeserta: v.tp, targetLulusan: v.tl, isYearly: true, createdBy: req.uid,
      });
      setCount++;
    }

    audit(req, "SAVE_TARGET", "target", `${uptId}_${y}`, { year: y, programs: setCount });
    await recordTargetRevision({ uptId, year: y, trigger: "save", user: { uid: req.uid, name: req.user?.name, email: req.user?.email } });
    res.json({
      message: `Target PK ${y} tersimpan — ${setCount} program (${diklatTargets.length} rincian diklat). Satu kali input, siap dikirim ke Pimpinan.`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menyimpan target PK." });
  }
});

/** POST /api/targets/import — (UPT) import data target PK per diklat/program dari file excel */
router.post("/import", requireUpt, async (req, res) => {
  try {
    const uptId = req.user.uptId;
    if (!uptId) return res.status(400).json({ error: "Akun Anda belum ditautkan ke UPT." });
    const y = Number(req.body.year) || new Date().getFullYear();

    const tSid = `${uptId}_${y}_00`;
    const tSub = await TargetSubmission.findOne({ where: { id: tSid } });
    if (tSub && ["pending_pimpinan", "pending_bpsdmp", "approved"].includes(tSub.status)) {
      return res.status(403).json({ error: `Target PK ${y} sudah dikirim dan terkunci (${tSub.status}). Ajukan Perubahan Target PK untuk merevisi target.` });
    }

    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    if (!rawItems.length) return res.status(400).json({ error: "Tidak ada baris data target untuk diimpor." });

    const allPrograms = (await Program.findAll()).map((p) => p.toJSON());
    const progMap = new Map(allPrograms.map((p) => [p.id, p]));

    let updatedCount = 0;
    let createdCount = 0;
    const diklatTargets = [];
    const directItems = [];

    function resolveProgId(inputName) {
      if (!inputName) return null;
      const raw = String(inputName).trim();
      const rawLower = raw.toLowerCase();
      const clean = rawLower.replace(/^[a-z0-9][\.\-\)]\s*/i, '').replace(/\(.*?\)/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

      const byId = allPrograms.find((p) => String(p.id) === raw);
      if (byId) return byId.id;
      const byExact = allPrograms.find((p) => p.name.trim().toLowerCase() === rawLower);
      if (byExact) return byExact.id;
      const byClean = allPrograms.find((p) => p.name.toLowerCase().trim() === clean);
      if (byClean) return byClean.id;

      // 4. Spesifik "Pola Pembibitan" (HARUS MURNI, BUKAN Non Pola / Mandiri)
      const isPolaMurni = (clean.includes('pola pembibitan') || clean === 'pola') && !clean.includes('non') && !clean.includes('bukan') && !clean.includes('mandiri');
      if (isPolaMurni) {
        const pola = allPrograms.find((p) => {
          const pn = p.name.toLowerCase().trim();
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
          const pn = p.name.toLowerCase().trim();
          return pn.includes('mandiri') || pn.includes('non pola') || pn.includes('non-pola');
        });
        if (nonPola) return nonPola.id;
      }

      // 6. Spesifik "Pelatihan Teknis" / "Short Course"
      const isPelatihanTeknis = clean.includes('pelatihan teknis') || clean.includes('short course') || clean === 'teknis';
      if (isPelatihanTeknis) {
        // Prioritaskan yang leaf / turunan bila ada, atau yang mengandung pelatihan teknis
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
          const pn = p.name.toLowerCase().trim();
          return (pn.length >= 4 && clean.includes(pn)) || (clean.length >= 4 && pn.includes(clean));
        })
        .sort((a, b) => b.name.length - a.name.length);
      if (candidates.length > 0) return candidates[0].id;

      // 8. Match parentName jika input mencantumkan nama induk
      const byParent = allPrograms.find((p) => {
        const prn = (p.parentName || p.parent_name || '').toLowerCase().trim();
        return prn && (prn === clean || clean.includes(prn));
      });
      if (byParent) return byParent.id;

      return null;
    }

    for (const item of rawItems) {
      const rawName = String(item.name || "").trim();
      const targetVal = Math.max(0, parseInt(item.target ?? item.targetPk ?? item.targetPeserta, 10) || 0);

      // Cari program
      let pid = item.programId;
      if (!pid && item.programName) {
        pid = resolveProgId(item.programName);
      }
      if (!pid || !progMap.has(pid)) continue;

      if (rawName) {
        // Cari diklat yang namanya sama
        const existingDocs = await Diklat.findAll({
          where: { uptId, year: y, [Op.and]: [where(fn("LOWER", col("name")), rawName.toLowerCase())] }
        });

        // Cari yang programIds-nya SUDAH mengandung pid ini
        let doc = existingDocs.find((d) => {
          const pids = Array.isArray(d.programIds) ? d.programIds.map(String) : [];
          return pids.includes(String(pid));
        });

        if (!doc && existingDocs.length === 1 && (!existingDocs[0].programIds || existingDocs[0].programIds.length === 0)) {
          doc = existingDocs[0];
        }

        if (!doc) {
          const tbp = { [String(pid)]: { targetPeserta: targetVal, targetLulusan: targetVal, targetPk: targetVal } };
          doc = await Diklat.create({
            uptId, year: y, name: rawName, programIds: [String(pid)],
            targetPeserta: targetVal, targetLulusan: targetVal,
            targetByProgram: tbp,
            isActive: true, createdBy: req.uid,
          });
          createdCount++;
        } else {
          const curPids = Array.isArray(doc.programIds) ? doc.programIds.map(String) : [];
          if (!curPids.includes(String(pid))) curPids.push(String(pid));
          const curTbp = (doc.targetByProgram && typeof doc.targetByProgram === 'object') ? { ...doc.targetByProgram } : {};
          curTbp[String(pid)] = { targetPeserta: targetVal, targetLulusan: targetVal, targetPk: targetVal };
          let tot = 0;
          for (const [k, v] of Object.entries(curTbp)) {
            if (curPids.includes(k)) tot += Number(v?.targetPeserta ?? v?.targetPk) || 0;
          }
          await doc.update({ programIds: curPids, targetByProgram: curTbp, targetPeserta: tot, targetLulusan: tot });
          updatedCount++;
        }
        diklatTargets.push({ diklatId: doc.id, programId: pid, targetPeserta: targetVal, targetLulusan: targetVal, targetPk: targetVal, target: targetVal });
      } else {
        directItems.push({ programId: pid, targetPeserta: targetVal, targetLulusan: targetVal, targetPk: targetVal, target: targetVal });
      }
    }

    // Hitung ulang target tahunan dan upsert ke Target (month = 0)
    const allDiklats = await Diklat.findAll({ where: { uptId, year: y } });
    const progSum = new Map();
    for (const d of allDiklats) {
      const ids = Array.isArray(d.programIds) ? d.programIds : [];
      const tbp = (d.targetByProgram && typeof d.targetByProgram === 'object') ? d.targetByProgram : {};
      for (const p of ids) {
        const key = String(p);
        const cur = progSum.get(key) || { tp: 0, tl: 0 };
        const pv = tbp[key];
        const val = (pv && (pv.targetPeserta !== undefined || pv.targetPk !== undefined))
          ? Number(pv.targetPk ?? pv.targetPeserta)
          : (ids.length === 1 ? (Number(d.targetPeserta) || 0) : 0);
        cur.tp += val;
        cur.tl += val;
        progSum.set(key, cur);
      }
    }
    for (const dit of directItems) {
      const key = String(dit.programId);
      const hasD = allDiklats.some(d => (Array.isArray(d.programIds) ? d.programIds.map(String) : []).includes(key));
      if (!hasD) {
        progSum.set(key, { tp: dit.targetPeserta, tl: dit.targetLulusan });
      }
    }

    let savedProgs = 0;
    for (const [pid, v] of progSum.entries()) {
      await Target.destroy({ where: { uptId, year: y, programId: pid, month: { [Op.ne]: 0 } } });
      if (v.tp <= 0) {
        await Target.destroy({ where: { uptId, year: y, programId: pid, month: 0 } });
        continue;
      }
      await Target.upsert({
        uptId, year: y, month: 0, programId: pid,
        targetPeserta: v.tp, targetLulusan: v.tl, isYearly: true, createdBy: req.uid,
      });
      savedProgs++;
    }

    audit(req, "IMPORT_TARGET_PK", "target", `${uptId}_${y}`, { year: y, updated: updatedCount, created: createdCount });
    await recordTargetRevision({ uptId, year: y, trigger: "import", user: { uid: req.uid, name: req.user?.name, email: req.user?.email } });
    res.json({
      message: `Berhasil import Target PK: ${createdCount} diklat baru dibuat, ${updatedCount} target diklat diperbarui (${savedProgs} program terdata).`,
      createdCount,
      updatedCount,
      totalPrograms: savedProgs,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal import Target PK: " + (err.message || err) });
  }
});

/** PUT /api/targets/my/yearly - DEPRECATED: gunakan PUT /api/targets/my (single-input) */
router.put("/my/yearly", requireUpt, async (req, res) => {
  return res.status(410).json({ error: "Endpoint tahunan/bulanan dihapus. Gunakan PUT /api/targets/my satu kali input." });
});

/** DELETE /api/targets/my/:year/:programId */
router.delete("/my/:year/:programId", requireUpt, async (req, res) => {
  const programId = req.params.programId;
  const year = Number(req.params.year);
  const uptId = req.user.uptId;
  if (!uptId) return res.status(400).json({ error: "Akun Anda belum ditautkan ke UPT." });
  try {
    await Target.destroy({ where: { uptId, year, programId } });
    audit(req, "DELETE_TARGET", "target", `${uptId}_${year}_${programId}`, { year });
    await recordTargetRevision({ uptId, year, trigger: "delete", user: { uid: req.uid, name: req.user?.name, email: req.user?.email } });
    res.json({ message: "Semua target program ini dihapus (bulanan & tahunan)." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menghapus target PK." });
  }
});

// ============================================================================
// LEGACY ADMIN PUT/DELETE — diblokir
// ============================================================================

router.put("/", requireAdmin, async (req, res) => {
  return res.status(403).json({
    error: "Target PK kini diisi mandiri oleh masing-masing UPT. Admin hanya dapat memantau (read-only).",
  });
});

router.delete("/:uptId/:year/:programId", requireAdmin, async (req, res) => {
  return res.status(403).json({
    error: "Target PK kini dikelola oleh UPT. Admin tidak dapat menghapus target milik UPT.",
  });
});

// ============================================================================
// TARGET SUBMISSIONS
// ============================================================================

/** POST /api/targets/my/submit - UPT kirim Target PK (SINGLE-INPUT, month=0) ke Pimpinan */
router.post("/my/submit", requireUpt, async (req, res) => {
  const { year } = req.body;
  const y = Number(year), m = 0;
  if (!y || y < 2000 || y > 2100) return res.status(400).json({ error: "Tahun target tidak valid." });

  const uptId = req.user.uptId;
  if (!uptId) return res.status(400).json({ error: "Akun Anda belum ditautkan ke UPT." });

  try {
    const uptDoc = await Upt.findByPk(uptId);
    if (!uptDoc) return res.status(404).json({ error: "UPT tidak ditemukan." });

    const tSid = `${uptId}_${y}_00`;
    const existing = await TargetSubmission.findOne({ where: { id: tSid } });
    if (existing && existing.status === "approved") {
      return res.status(400).json({ error: `Target PK ${y} sudah disetujui BPSDMP dan terkunci.` });
    }
    if (existing && existing.status === "pending_pimpinan") {
      return res.status(400).json({ error: `Target PK ${y} masih menunggu persetujuan Pimpinan UPT.` });
    }
    if (existing && existing.status === "pending_bpsdmp") {
      return res.status(400).json({ error: `Target PK ${y} masih menunggu persetujuan Admin BPSDMP.` });
    }

    let targs = await Target.findAll({ where: { uptId, year: y, month: 0 } });
    if (!targs.length) {
      // fallback: agregat sisa bulanan lama bila belum migrasi
      targs = await Target.findAll({ where: { uptId, year: y } });
    }
    if (!targs.length) {
      return res.status(400).json({ error: `Belum ada isian target PK untuk ${y}. Isi target satu kali terlebih dahulu.` });
    }

    const diklatSnap = await Diklat.findAll({ where: { uptId, year: y } });

    const snapshot = {
      targets: targs.map((t) => (t.toJSON ? t.toJSON() : t)),
      diklats: diklatSnap.map((d) => (d.toJSON ? d.toJSON() : d)),
    };

    // Simpan eksplisit (create / update) agar tidak bergantung pada upsert+JSON
    const prev = await TargetSubmission.findByPk(tSid);
    if (prev) {
      await prev.update({
        uptCode: uptDoc.code || "-", uptName: uptDoc.name || "-",
        matra: uptDoc.matra || "", uptType: uptDoc.uptType || "taruna",
        year: y, month: m, status: "pending_pimpinan",
        submittedBy: req.uid, submittedByName: req.user.name || req.user.email,
        targetSnapshot: snapshot,
      });
    } else {
      await TargetSubmission.create({
        id: tSid,
        uptId, uptCode: uptDoc.code || "-", uptName: uptDoc.name || "-",
        matra: uptDoc.matra || "", uptType: uptDoc.uptType || "taruna",
        year: y, month: m, status: "pending_pimpinan",
        submittedBy: req.uid, submittedByName: req.user.name || req.user.email,
        targetSnapshot: snapshot,
      });
    }

    notifier.notifyTargetPkSubmit({ upt: uptDoc.toJSON ? uptDoc.toJSON() : uptDoc, year: y, month: m, user: req.user });

    audit(req, "SUBMIT_TARGET", "target", tSid, { year: y });
    res.json({ message: `Target PK ${y} berhasil dikirim ke Pimpinan UPT.`, id: tSid });
  } catch (err) {
    console.error("[POST /targets/my/submit]", err);
    res.status(500).json({ error: `Gagal mengirim Target PK: ${err.message || err}` });
  }
});

/** GET /api/targets/submissions/inbox */
router.get("/submissions/inbox", async (req, res) => {
  const user = req.user;
  try {
    let where = {};
    if (isSuperAdmin(user)) {
      where = { status: "pending_bpsdmp" };
    } else if (isPusbang(user)) {
      const submissions = await TargetSubmission.findAll({ where: { status: "pending_bpsdmp" } });
      const matra = (user.pusbangMatra || "").toLowerCase();
      const filtered = submissions.filter((s) => (s.matra || "").toLowerCase() === matra);
      return res.json({ targetSubmissions: filtered });
    } else if (isPimpinan(user)) {
      where = { uptId: user.uptId, status: "pending_pimpinan" };
    } else {
      return res.status(403).json({ error: "Tidak ada inbox target PK untuk role ini." });
    }
    const list = await TargetSubmission.findAll({ where });
    res.json({ targetSubmissions: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil inbox Target PK." });
  }
});

/** GET /api/targets/submissions/processed - riwayat persetujuan PK (sama seperti persetujuan laporan) */
router.get("/submissions/processed", async (req, res) => {
  const user = req.user;
  try {
    let docs = await TargetSubmission.findAll({ order: [["updatedAt", "DESC"]] });
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
    res.json({ targetSubmissions: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil riwayat persetujuan PK." });
  }
});

/** GET /api/targets/admin-history - seluruh riwayat PK untuk monitoring Super Admin */
router.get("/admin-history", async (req, res) => {
  if (!isSuperAdmin(req.user)) return res.status(403).json({ error: "Akses khusus Super Admin BPSDMP." });
  try {
    const submissions = await TargetSubmission.findAll({ order: [["updatedAt", "DESC"]] });
    res.json({ targetSubmissions: submissions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil riwayat PK." });
  }
});

/** GET /api/targets/submissions/:id/detail - ambil rincian program & target angka untuk modal audit */
router.get("/submissions/:id/detail", async (req, res) => {
  try {
    const doc = await TargetSubmission.findByPk(req.params.id);
    if (!doc) return res.status(404).json({ error: "Target PK tidak ditemukan." });

    const sub = doc.toJSON();
    // Pimpinan hanya boleh mereview Target PK UPT-nya sendiri
    if (isPimpinan(req.user) && sub.uptId !== req.user.uptId) {
      return res.status(403).json({ error: "Anda hanya dapat mereview Target PK UPT Anda sendiri." });
    }
    const upt = await Upt.findByPk(sub.uptId);
    const visibleFlat = await getTargetablePrograms(upt?.uptType || sub.uptType);

    // Snapshot baru: { targets:[], diklats:[] } ; lama: array targets langsung
    let snapTargets = [];
    let snapDiklats = [];
    if (Array.isArray(sub.targetSnapshot)) {
      snapTargets = sub.targetSnapshot;
    } else if (sub.targetSnapshot && Array.isArray(sub.targetSnapshot.targets)) {
      snapTargets = sub.targetSnapshot.targets;
      snapDiklats = Array.isArray(sub.targetSnapshot.diklats) ? sub.targetSnapshot.diklats : [];
    }

    let targs = snapTargets.length > 0
      ? snapTargets
      : await Target.findAll({ where: { uptId: sub.uptId, year: sub.year, month: 0 } });

    if (!targs.length) {
      targs = await Target.findAll({ where: { uptId: sub.uptId, year: sub.year } });
    }
    if (!snapDiklats.length) {
      snapDiklats = (await Diklat.findAll({ where: { uptId: sub.uptId, year: sub.year } })).map((d) => d.toJSON());
    }

    const targByPid = new Map((targs || []).map((t) => [t.programId, t]));
    const programs = visibleFlat.map((fp) => {
      const t = targByPid.get(fp.id) || { targetPeserta: 0, targetLulusan: 0, targetAnggaran: 0 };
      return {
        programId: fp.id,
        programName: fp.name,
        parentId: fp.parentId || null,
        parentName: fp.parentName || "-",
        isParent: fp.isParent,
        targetPeserta: Number(t.targetPeserta) || 0,
        targetLulusan: Number(t.targetLulusan) || 0,
        targetAnggaran: Number(t.targetAnggaran) || 0,
      };
    });

    // Auto-sum untuk program induk
    const byPid = new Map(programs.map((r) => [r.programId, r]));
    for (const row of programs) {
      if (!row.isParent) continue;
      const kids = visibleFlat.filter((c) => !c.isParent && c.parentId === row.programId);
      if (!kids.length) continue;
      const sum = (key) => kids.reduce((s, k) => s + (byPid.get(k.id)?.[key] || 0), 0);
      row.targetPeserta = sum("targetPeserta");
      row.targetLulusan = sum("targetLulusan");
      row.targetAnggaran = sum("targetAnggaran");
    }

    res.json({
      submission: sub,
      programs,
      diklats: snapDiklats,
      upt: {
        id: upt?.id || sub.uptId,
        code: upt?.code || sub.uptCode,
        name: upt?.name || sub.uptName,
        matra: upt?.matra || sub.matra,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil detail Target PK." });
  }
});

/** PATCH /api/targets/submissions/:id/approve - Pimpinan approve -> pending_bpsdmp */
router.patch("/submissions/:id/approve", async (req, res) => {
  const user = req.user;
  if (!isPimpinan(user) && !isSuperAdmin(user)) {
    return res.status(403).json({ error: "Hanya Pimpinan UPT yang dapat menyetujui Target PK." });
  }
  try {
    const doc = await TargetSubmission.findByPk(req.params.id);
    if (!doc) return res.status(404).json({ error: "Target PK tidak ditemukan." });
    if (isPimpinan(user) && doc.uptId !== user.uptId) {
      return res.status(403).json({ error: "Anda hanya dapat menyetujui Target PK UPT Anda sendiri." });
    }
    await doc.update({
      status: "pending_bpsdmp",
      pimpinanApprovedBy: req.uid,
      pimpinanApprovedByName: user.name || user.email,
    });

    notifier.notifyTargetPkPimpinanReview({ doc, upt: { id: doc.uptId, name: doc.uptName, code: doc.uptCode }, year: doc.year, month: doc.month, action: 'approve', user });

    audit(req, "APPROVE_TARGET_PIMPINAN", "target", doc.id, { uptCode: doc.uptCode, year: doc.year });
    res.json({ message: `Target PK ${doc.uptCode} disetujui Pimpinan dan diteruskan ke Admin BPSDMP.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menyetujui Target PK." });
  }
});

/** Pusbang hanya boleh memproses Target PK matra-nya sendiri. */
function assertPusbangMatra(user, doc) {
  if (!isPusbang(user)) return null;
  const matra = (user.pusbangMatra || "").toLowerCase();
  if ((doc.matra || "").toLowerCase() !== matra) {
    return "Anda hanya dapat memproses Target PK matra Anda sendiri.";
  }
  return null;
}

/** PATCH /api/targets/submissions/:id/approve-bpsdmp - BPSDMP approve -> approved */
router.patch("/submissions/:id/approve-bpsdmp", async (req, res) => {
  const user = req.user;
  if (!isSuperAdmin(user) && !isPusbang(user)) {
    return res.status(403).json({ error: "Hanya Admin BPSDMP atau Pusbang yang dapat menyetujui final Target PK." });
  }
  try {
    const doc = await TargetSubmission.findByPk(req.params.id);
    if (!doc) return res.status(404).json({ error: "Target PK tidak ditemukan." });
    const matraErr = assertPusbangMatra(user, doc);
    if (matraErr) return res.status(403).json({ error: matraErr });
    await doc.update({
      status: "approved",
      approvedBy: req.uid,
      approvedByName: user.name || user.email,
    });

    notifier.notifyTargetPkBpsdmpReview({ doc, upt: { id: doc.uptId, name: doc.uptName, code: doc.uptCode }, year: doc.year, month: doc.month, action: 'approve', user });

    audit(req, "APPROVE_TARGET_BPSDMP", "target", doc.id, { uptCode: doc.uptCode, year: doc.year });
    res.json({ message: `Target PK ${doc.uptCode} disetujui BPSDMP dan resmi aktif.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menyetujui Target PK oleh BPSDMP." });
  }
});

/** PATCH /api/targets/submissions/:id/reject */
async function rejectTargetSubmission(req, res) {
  const { note } = req.body;
  const user = req.user;
  if (!isPimpinan(user) && !isSuperAdmin(user) && !isPusbang(user)) {
    return res.status(403).json({ error: "Hanya Pimpinan UPT, Admin BPSDMP, atau Pusbang yang dapat menolak Target PK." });
  }
  try {
    const doc = await TargetSubmission.findByPk(req.params.id);
    if (!doc) return res.status(404).json({ error: "Target PK tidak ditemukan." });
    if (isPimpinan(user) && doc.uptId !== user.uptId) {
      return res.status(403).json({ error: "Anda hanya dapat menolak Target PK UPT Anda sendiri." });
    }
    const matraErr = assertPusbangMatra(user, doc);
    if (matraErr) return res.status(403).json({ error: matraErr });
    await doc.update({
      status: "rejected",
      rejectedBy: req.uid,
      rejectNote: note || "",
    });

    if (isPimpinan(user)) {
      notifier.notifyTargetPkPimpinanReview({ doc, upt: { id: doc.uptId, name: doc.uptName, code: doc.uptCode }, year: doc.year, month: doc.month, action: 'reject', note, user });
    } else {
      notifier.notifyTargetPkBpsdmpReview({ doc, upt: { id: doc.uptId, name: doc.uptName, code: doc.uptCode }, year: doc.year, month: doc.month, action: 'reject', note, user });
    }

    audit(req, "REJECT_TARGET", "target", doc.id, { uptCode: doc.uptCode, year: doc.year, note: note || "" });
    res.json({ message: "Target PK ditolak, Admin UPT dapat merevisi." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menolak Target PK." });
  }
}

/** PATCH /api/targets/submissions/:id/reject */
router.patch("/submissions/:id/reject", rejectTargetSubmission);

/** PATCH /api/targets/submissions/:id/reject-bpsdmp — alias untuk hub Admin BPSDMP */
router.patch("/submissions/:id/reject-bpsdmp", rejectTargetSubmission);

module.exports = router;
