const express = require("express");
const { authenticate, requireAdmin, requireUpt, isSuperAdmin, isPusbang } = require("../middleware/auth");
const { Realization, Target, Program, Upt, Submission, TargetSubmission, User, Diklat, RealizationDiklat } = require("../models");
const { audit } = require("../lib/audit");
const { Op, fn, col, literal } = require("sequelize");
const { computeAchievement } = require("../lib/capaian");

const router = express.Router();

router.use(authenticate);

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Ambil semua program aktif + peta id->program. */
async function getProgramMaps() {
  const all = await Program.findAll({ order: [["order", "ASC"], ["name", "ASC"]] });
  const allData = all.map((p) => p.toJSON());
  const byId = new Map(allData.map((p) => [p.id, p]));

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

  return { all: allData, byId, flat };
}

/** GET /api/realizations/programs - pilihan program aktif untuk input */
router.get("/programs", requireUpt, async (req, res) => {
  try {
    let uptType = "taruna";
    if (req.user.uptId) {
      const uptDoc = await Upt.findByPk(req.user.uptId);
      if (uptDoc) uptType = uptDoc.uptType || "taruna";
    }

    const { flat } = await getProgramMaps();
    const programs = flat
      .filter((p) => {
        if (p.isActive === false) return false;
        const tg = p.targetGroup || "semua";
        if (tg === "semua") return true;
        return tg === uptType;
      })
      .map((p) => ({
        id: p.id, name: p.name, parentName: p.parentName,
        isParent: p.isParent, parentId: p.parentId || null,
        order: p.order || 0, targetGroup: p.targetGroup || "semua",
      }));

    res.json({ programs, uptType });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil daftar program." });
  }
});

/** POST /api/realizations - user UPT input realisasi bulanan */
router.post("/", requireUpt, async (req, res) => {
  const { year, month } = req.body;
  const y = Number(year);
  const m = Number(month);
  if (!y || y < 2000 || y > 2100 || !m || m < 1 || m > 12) {
    return res.status(400).json({ error: "Tahun dan bulan tidak valid." });
  }

  let items;
  if (Array.isArray(req.body.items)) {
    items = req.body.items;
  } else {
    items = [{ programId: req.body.programId, pesertaL: req.body.pesertaL, pesertaP: req.body.pesertaP, lulusanL: req.body.lulusanL, lulusanP: req.body.lulusanP }];
  }
  const hasDiklatItems = Array.isArray(req.body.diklatItems) && req.body.diklatItems.length > 0;
  if (!items.length && !hasDiklatItems) return res.status(400).json({ error: "Tidak ada data yang dikirim." });

  const normalized = items.map((it) => {
    const v = [it.pesertaL, it.pesertaP, it.lulusanL, it.lulusanP].map((n) => Number(n));
    return { programId: it.programId, v };
  });
  if (normalized.some((it) => !it.programId)) return res.status(400).json({ error: "Program wajib dipilih pada setiap baris." });
  if (normalized.some((it) => it.v.some((n) => !Number.isFinite(n) || n < 0))) {
    return res.status(400).json({ error: "Semua kolom harus berupa angka >= 0." });
  }
  // Validasi: lulusan tidak boleh > peserta per JENIS KELAMIN (L & P) per program
  for (const it of normalized) {
    const pesertaL = it.v[0] || 0, pesertaP = it.v[1] || 0, lulusanL = it.v[2] || 0, lulusanP = it.v[3] || 0;
    if (lulusanL > pesertaL) {
      const prog = await Program.findByPk(it.programId);
      const progName = prog ? prog.name : it.programId;
      return res.status(400).json({ error: `Program "${progName}": Lulusan Laki-laki (${lulusanL}) tidak boleh lebih besar dari Peserta Laki-laki (${pesertaL}).` });
    }
    if (lulusanP > pesertaP) {
      const prog = await Program.findByPk(it.programId);
      const progName = prog ? prog.name : it.programId;
      return res.status(400).json({ error: `Program "${progName}": Lulusan Perempuan (${lulusanP}) tidak boleh lebih besar dari Peserta Perempuan (${pesertaP}).` });
    }
  }

  try {
    const uptId = req.user.uptId;
    if (!uptId) return res.status(400).json({ error: "Akun Anda belum ditautkan ke UPT." });

    // Validasi program ada & aktif
    for (const it of normalized) {
      const prog = await Program.findByPk(it.programId);
      if (!prog) return res.status(404).json({ error: "Salah satu program tidak ditemukan." });
      if (prog.isActive === false) return res.status(400).json({ error: `Program "${prog.name}" sedang nonaktif.` });
    }

    // Cek target PK ada & sudah disetujui (popup: belum diatur / menunggu pimpinan / menunggu BPSDMP / ditolak)
    const hasTargetForMonth = (await Target.findOne({ where: { uptId, year: y, month: m } })) || (await Target.findOne({ where: { uptId, year: y, month: 0 } }));
    if (!hasTargetForMonth) {
      return res.status(403).json({
        error: `PK Belum Diatur: Target PK untuk ${MONTH_NAMES[m - 1]} ${y} belum diisi. Silakan isi Target PK terlebih dahulu di menu Target PK.`,
        targetPending: true,
        reason: 'belum_atur',
      });
    }
    const hasAnyTargetSub = await TargetSubmission.findOne({ where: { uptId, year: y } });
    // Jika ada target tapi belum ada submission atau belum approved, cek status detail untuk popup yang sesuai
    const [tSubMonthly, tSubYearly] = await Promise.all([
      TargetSubmission.findOne({ where: { id: `${uptId}_${y}_${String(m).padStart(2, "0")}` } }),
      TargetSubmission.findOne({ where: { id: `${uptId}_${y}_00` } }),
    ]);
    const isMonthlyApproved = tSubMonthly && tSubMonthly.status === "approved";
    const isYearlyApproved = tSubYearly && tSubYearly.status === "approved";
    if (!isMonthlyApproved && !isYearlyApproved) {
      // Ada target tapi belum approved -> beri keterangan sesuai status
      const relevant = tSubMonthly || tSubYearly;
      if (!relevant && hasAnyTargetSub) {
        // ada submission lain tahun ini tapi bukan bulan ini
        return res.status(403).json({
          error: `PK Belum Dikirim: Target PK ${MONTH_NAMES[m - 1]} ${y} belum dikirim ke Pimpinan. Silakan kirim di menu Target PK → Kirim Ke Pimpinan.`,
          targetPending: true,
          reason: 'belum_kirim',
        });
      }
      if (!relevant) {
        return res.status(403).json({
          error: `PK Belum Dikirim: Target PK ${MONTH_NAMES[m - 1]} ${y} sudah diisi tapi belum dikirim ke Pimpinan. Silakan kirim di menu Target PK.`,
          targetPending: true,
          reason: 'belum_kirim',
        });
      }
      if (relevant.status === 'pending_pimpinan') {
        return res.status(403).json({
          error: `Menunggu Persetujuan Pimpinan UPT: Target PK ${relevant.month === 0 ? 'Tahunan' : `Bulan ${relevant.month}`} ${y} menunggu persetujuan Pimpinan UPT.`,
          targetPending: true,
          reason: 'pending_pimpinan',
        });
      }
      if (relevant.status === 'pending_bpsdmp') {
        return res.status(403).json({
          error: `Menunggu Persetujuan Admin BPSDMP: Target PK ${relevant.month === 0 ? 'Tahunan' : `Bulan ${relevant.month}`} ${y} menunggu persetujuan final Admin BPSDMP.`,
          targetPending: true,
          reason: 'pending_bpsdmp',
        });
      }
      if (relevant.status === 'rejected') {
        return res.status(403).json({
          error: `Target PK Ditolak${relevant.rejectNote ? `: ${relevant.rejectNote}` : ''}. Silakan revisi di menu Target PK.`,
          targetPending: true,
          reason: 'rejected',
        });
      }
      return res.status(403).json({
        error: `Input realisasi ${MONTH_NAMES[m - 1]} ${y} belum dapat dilakukan karena Target PK untuk periode ini belum disetujui oleh Admin BPSDMP.`,
        targetPending: true,
        reason: 'belum_approve',
      });
    }

    // Cek submission status
    const subSnap = await Submission.findOne({ where: { uptId, year: y, month: m } });
    if (subSnap) {
      const st = subSnap.status;
      if (st === "pending_pimpinan") return res.status(403).json({ error: `Laporan ${MONTH_NAMES[m - 1]} ${y} masih menunggu persetujuan Pimpinan UPT.`, locked: true });
      if (st === "approved") return res.status(403).json({ error: `Realisasi ${MONTH_NAMES[m - 1]} ${y} sudah disetujui Pimpinan dan terkunci.`, locked: true });
    }

    // Cek locked lama
    const existingReals = await Realization.findAll({ where: { uptId, year: y, month: m } });
    for (const r of existingReals) {
      if (r.locked === true && !subSnap) {
        return res.status(403).json({ error: `Realisasi ${MONTH_NAMES[m - 1]} ${y} sudah dikunci (final).`, locked: true });
      }
    }

    // Rincian per diklat (opsional): validasi + upsert, lalu agregat jadi nilai program
    const rawDiklatItems = Array.isArray(req.body.diklatItems) ? req.body.diklatItems : [];
    const diklatUpdates = new Map(); // key `${programId}|${diklatId}` -> { programId, diklat, v:[pl,pp,ll,lp] }
    for (const dt of rawDiklatItems) {
      const v = [dt.pesertaL, dt.pesertaP, dt.lulusanL, dt.lulusanP].map((n) => Number(n));
      if (!dt.diklatId || !dt.programId) return res.status(400).json({ error: "Rincian diklat wajib menyertakan diklat dan program." });
      if (v.some((n) => !Number.isFinite(n) || n < 0)) {
        return res.status(400).json({ error: "Rincian diklat harus berupa angka >= 0." });
      }
      const diklat = await Diklat.findByPk(dt.diklatId);
      if (!diklat) return res.status(404).json({ error: "Salah satu diklat tidak ditemukan." });
      if (diklat.uptId !== uptId || Number(diklat.year) !== y) {
        return res.status(403).json({ error: `Diklat "${diklat.name}" bukan milik UPT/tahun ini.` });
      }
      const mapped = Array.isArray(diklat.programIds) ? diklat.programIds.map(String) : [];
      if (!mapped.includes(String(dt.programId))) {
        return res.status(400).json({ error: `Diklat "${diklat.name}" tidak terpetakan ke program tersebut.` });
      }
      if (v[2] > v[0]) {
        return res.status(400).json({ error: `Diklat "${diklat.name}": Lulusan Laki-laki (${v[2]}) tidak boleh lebih besar dari Peserta Laki-laki (${v[0]}).` });
      }
      if (v[3] > v[1]) {
        return res.status(400).json({ error: `Diklat "${diklat.name}": Lulusan Perempuan (${v[3]}) tidak boleh lebih besar dari Peserta Perempuan (${v[1]}).` });
      }
      diklatUpdates.set(`${dt.programId}|${dt.diklatId}`, { programId: String(dt.programId), diklat, v });
    }
    for (const [, u] of diklatUpdates) {
      const [pl, pp, ll, lp] = u.v;
      if (pl + pp + ll + lp <= 0) {
        await RealizationDiklat.destroy({ where: { uptId, year: y, month: m, programId: u.programId, diklatId: u.diklat.id } });
      } else {
        await RealizationDiklat.upsert({
          uptId, year: y, month: m, programId: u.programId, diklatId: u.diklat.id,
          pesertaL: pl, pesertaP: pp, lulusanL: ll, lulusanP: lp,
          totalPeserta: pl + pp, totalLulusan: ll + lp,
          inputBy: req.uid,
        });
      }
    }

    // Program yang tersentuh rincian diklat → nilai = jumlah SELURUH diklatnya bulan ini (agar edit parsial aman)
    const touchedProgs = new Set([...diklatUpdates.values()].map((u) => u.programId));
    const diklatSumByProg = new Map();
    if (touchedProgs.size > 0) {
      const allRows = await RealizationDiklat.findAll({ where: { uptId, year: y, month: m } });
      for (const r of allRows) {
        const pid = String(r.programId);
        if (!touchedProgs.has(pid)) continue;
        const cur = diklatSumByProg.get(pid) || [0, 0, 0, 0];
        cur[0] += Number(r.pesertaL) || 0; cur[1] += Number(r.pesertaP) || 0;
        cur[2] += Number(r.lulusanL) || 0; cur[3] += Number(r.lulusanP) || 0;
        diklatSumByProg.set(pid, cur);
      }
      for (const pid of touchedProgs) {
        if (!diklatSumByProg.has(pid)) diklatSumByProg.set(pid, [0, 0, 0, 0]);
      }
    }

    const finalize = req.body.finalize === true;
    let totalPeserta = 0;
    let totalLulusan = 0;

    const directByProg = new Map(normalized.map((it) => [String(it.programId), it]));
    const finalProgIds = new Set([...directByProg.keys(), ...diklatSumByProg.keys()]);

    for (const pid of finalProgIds) {
      // Program ber-diklat memakai agregat diklat (isian langsung diabaikan agar tidak ganda)
      const vals = diklatSumByProg.has(pid) ? diklatSumByProg.get(pid) : directByProg.get(pid).v;
      const tp = vals[0] + vals[1];
      const tl = vals[2] + vals[3];
      totalPeserta += tp;
      totalLulusan += tl;

      await Realization.upsert({
        uptId, year: y, month: m, programId: pid,
        pesertaL: vals[0], pesertaP: vals[1], lulusanL: vals[2], lulusanP: vals[3],
        totalPeserta: tp, totalLulusan: tl, locked: false,
        inputBy: req.uid, inputByName: req.user.name,
      });
    }

    if (finalize) {
      const uptDoc = await Upt.findByPk(uptId);
      const upt = uptDoc ? uptDoc.toJSON() : {};
      await Submission.upsert({
        submissionId: `${uptId}_${y}_${String(m).padStart(2, "0")}`,
        uptId, uptCode: upt.code || "-", uptName: upt.name || "-",
        matra: upt.matra || "", uptType: upt.uptType || "taruna",
        year: y, month: m, status: "pending_pimpinan",
        submittedBy: req.uid, submittedByName: req.user.name || req.user.email,
      });
    }

    const progCount = typeof finalProgIds !== 'undefined' ? finalProgIds.size : normalized.length;
    audit(req, finalize ? "SUBMIT_REALISASI" : "SAVE_REALISASI", "realisasi", `${uptId}_${y}_${String(m).padStart(2, "0")}`, { year: y, month: m, programs: progCount });
    res.json({
      message: finalize
        ? `Realisasi ${MONTH_NAMES[m - 1]} ${y} berhasil dikirim ke Pimpinan UPT (${progCount} program${diklatUpdates.size ? `, ${diklatUpdates.size} rincian diklat` : ''}).`
        : `Realisasi ${MONTH_NAMES[m - 1]} ${y} tersimpan sebagai draf untuk ${progCount} program${diklatUpdates.size ? ` (${diklatUpdates.size} rincian diklat)` : ''}.`,
      totalPeserta, totalLulusan, count: progCount,
      locked: false, pending: finalize,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menyimpan realisasi." });
  }
});

/** GET /api/realizations/my?year=2026 - riwayat UPT sendiri */
router.get("/my", requireUpt, async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  try {
    const uptId = req.user.uptId;

    // Ambil UPT terlebih dahulu agar bisa filter program berdasarkan uptType
    const uptDoc = uptId ? await Upt.findByPk(uptId) : null;
    const uptType = uptDoc ? (uptDoc.uptType || (uptDoc.matra === "aparatur" ? "aparatur" : "taruna")) : "taruna";

    const [realDocs, targetDocs, progMaps] = await Promise.all([
      Realization.findAll({ where: { uptId, year } }),
      Target.findAll({ where: { uptId, year } }),
      getProgramMaps(),
    ]);

    const realizations = realDocs
      .map((r) => r.toJSON())
      .filter((r) => r.programId)
      .sort((a, b) => a.month - b.month || (a.programId || "").localeCompare(b.programId || ""));

    // Build targetsMap: programId -> {monthly, yearly}
    const targetsMap = new Map();
    for (const tDoc of targetDocs) {
      const t = tDoc.toJSON();
      if (!t.programId || t.month == null) continue;
      if (!targetsMap.has(t.programId)) targetsMap.set(t.programId, { monthly: [], yearly: null });
      const entry = targetsMap.get(t.programId);
      if (Number(t.month) === 0) {
        entry.yearly = { targetPeserta: t.targetPeserta || 0, targetLulusan: t.targetLulusan || 0 };
      } else {
        entry.monthly.push({ month: Number(t.month), targetPeserta: t.targetPeserta || 0, targetLulusan: t.targetLulusan || 0 });
      }
    }
    for (const item of targetsMap.values()) {
      const monthlyPeserta = item.monthly.reduce((s, m) => s + m.targetPeserta, 0);
      const monthlyLulusan = item.monthly.reduce((s, m) => s + m.targetLulusan, 0);
      const yearlyPeserta = item.yearly ? item.yearly.targetPeserta : 0;
      const yearlyLulusan = item.yearly ? item.yearly.targetLulusan : 0;
      item.monthlyPeserta = monthlyPeserta;
      item.monthlyLulusan = monthlyLulusan;
      item.yearlyPeserta = yearlyPeserta;
      item.yearlyLulusan = yearlyLulusan;
      item.hasYearly = !!item.yearly;
      item.targetPeserta = monthlyPeserta + yearlyPeserta;
      item.targetLulusan = monthlyLulusan + yearlyLulusan;
    }

    function upToMonth(yr) {
      const now = new Date();
      return yr === now.getFullYear() ? now.getMonth() + 1 : 12;
    }
    const upTo = upToMonth(year);
    const programIds = [...new Set(realizations.map((r) => r.programId))];

    const byProgram = programIds
      .map((pid) => {
        const reals = realizations.filter((r) => r.programId === pid);
        const prog = progMaps.byId.get(pid);
        const target = targetsMap.get(pid) || null;
        return {
          programId: pid,
          programName: prog ? prog.name : "Program terhapus",
          parentName: prog ? (prog.parentId ? progMaps.byId.get(prog.parentId)?.name || "-" : prog.name) : "-",
          target: target ? { targetPeserta: target.targetPeserta, targetLulusan: target.targetLulusan } : null,
          achievement: computeAchievement(reals, target, upTo),
        };
      })
      .sort((a, b) => a.parentName.localeCompare(b.parentName) || a.programName.localeCompare(b.programName));

    // Combined target
    let combinedTarget = null;
    if (targetsMap.size > 0) {
      const byMonth = new Map();
      let yearlyPeserta = 0;
      let yearlyLulusan = 0;
      for (const item of targetsMap.values()) {
        for (const m of item.monthly) {
          const prev = byMonth.get(m.month) || { targetPeserta: 0, targetLulusan: 0 };
          byMonth.set(m.month, { targetPeserta: prev.targetPeserta + m.targetPeserta, targetLulusan: prev.targetLulusan + m.targetLulusan });
        }
        if (item.yearly) { yearlyPeserta += item.yearly.targetPeserta || 0; yearlyLulusan += item.yearly.targetLulusan || 0; }
      }
      const monthly = [...byMonth.entries()].map(([month, v]) => ({ month, ...v })).sort((a, b) => a.month - b.month);
      const totalPeserta = monthly.reduce((s, m) => s + m.targetPeserta, 0) + yearlyPeserta;
      const totalLulusan = monthly.reduce((s, m) => s + m.targetLulusan, 0) + yearlyLulusan;
      combinedTarget = { monthly, yearlyPeserta, yearlyLulusan, hasYearly: yearlyPeserta + yearlyLulusan > 0, targetPeserta: totalPeserta, targetLulusan: totalLulusan };
    }
    const hasAnyTarget = targetsMap.size > 0;
    const achievement = computeAchievement(realizations, combinedTarget, upTo);

    const programs = progMaps.flat
      .filter((p) => {
        if (p.isActive === false) return false;
        const tg = (p.targetGroup || p.category || 'semua').toLowerCase();
        if (tg === 'semua') return true;
        return tg === uptType;
      })
      .map((p) => ({ id: p.id, name: p.name, parentId: p.parentId || null, parentName: p.parentName || null, isParent: p.isParent === true }));

    res.json({ year, realizations, achievement, byProgram, hasAnyTarget, programs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil riwayat realisasi." });
  }
});

/** GET /api/realizations/diklats?year=&month= - rincian realisasi per diklat (UPT sendiri, untuk prefill) */
router.get("/diklats", requireUpt, async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const month = req.query.month ? Number(req.query.month) : null;
  try {
    const uptId = req.user.uptId;
    if (!uptId) return res.status(400).json({ error: "Akun Anda belum ditautkan ke UPT." });
    const where = { uptId, year };
    if (month) where.month = month;
    let rows = [];
    try {
      rows = await RealizationDiklat.findAll({ where, order: [["month", "ASC"]] });
    } catch (err) {
      if (/doesn.?t exist|no such table|1146/i.test(err?.message || '')) {
        console.warn('[realizations/diklats] tabel realization_diklats belum ada — restart server agar ikut tersinkron.');
        return res.json({ year, month, diklatRealisations: [] });
      }
      throw err;
    }
    res.json({ year, month, diklatRealisations: rows.map((r) => r.toJSON()) });
  } catch (err) {
    console.error("[GET /realizations/diklats]", err);
    res.status(500).json({ error: "Gagal mengambil rincian diklat." });
  }
});

/** GET /api/realizations?year=&month=&uptId=&detail=1 - monitoring rekap admin & pusbang */
router.get("/", async (req, res) => {
  if (!isSuperAdmin(req.user) && !isPusbang(req.user)) {
    return res.status(403).json({ error: "Akses khusus Super Admin BPSDMP atau Pusbang." });
  }
  const year = Number(req.query.year) || new Date().getFullYear();
  const month = req.query.month ? Number(req.query.month) : null;
  const uptIdFilter = req.query.uptId || null;
  const detail = req.query.detail === "1" || req.query.detail === "true";

  try {
    function upToMonth(yr) {
      const now = new Date();
      return yr === now.getFullYear() ? now.getMonth() + 1 : 12;
    }

    const targetWhere = { year };
    if (uptIdFilter) targetWhere.uptId = uptIdFilter;
    // SINGLE-INPUT: target month=0 berlaku untuk semua bulan — jangan filter habis
    else if (month) targetWhere.month = { [Op.in]: [month, 0] };

    const realWhere = { year };
    if (uptIdFilter) realWhere.uptId = uptIdFilter;
    else if (month) realWhere.month = month;

    const [realSnapRaw, targetSnapRaw, upts, progMaps, subSnapRaw] = await Promise.all([
      Realization.findAll({ where: realWhere }),
      Target.findAll({ where: targetWhere }),
      Upt.findAll({ order: [["code", "ASC"]] }),
      getProgramMaps(),
      Submission.findAll({ where: { year } }),
    ]);

    // Approved map: uptId -> Set(month)
    const approvedByUptMonth = new Map();
    for (const s of subSnapRaw) {
      if (s.status !== "approved") continue;
      if (!approvedByUptMonth.has(s.uptId)) approvedByUptMonth.set(s.uptId, new Set());
      approvedByUptMonth.get(s.uptId).add(Number(s.month));
    }

    // Filter realizations: only approved
    const realDocs = realSnapRaw.filter((d) => {
      const data = d.toJSON();
      if (month && Number(data.month) !== month) return false;
      if (uptIdFilter && data.uptId !== uptIdFilter) return false;
      const appSet = approvedByUptMonth.get(data.uptId);
      if (!appSet || !appSet.has(Number(data.month))) return false;
      return true;
    }).map((d) => d.toJSON());

    // Filter targets
    const targetDocs = targetSnapRaw.filter((d) => {
      const data = d.toJSON();
      if (month && Number(data.month) !== month && Number(data.month) !== 0) return false;
      if (uptIdFilter && data.uptId !== uptIdFilter) return false;
      return true;
    }).map((d) => d.toJSON());

    const uptMap = new Map(upts.map((u) => [u.id, u.toJSON()]));

    // Target per bulan per program
    const targetByUpt = new Map();
    const yearlyByUpt = new Map();
    for (const t of targetDocs) {
      if (!t.programId || t.month == null) continue;
      const mNum = Number(t.month);
      if (mNum === 0) {
        if (!yearlyByUpt.has(t.uptId)) yearlyByUpt.set(t.uptId, { peserta: 0, lulusan: 0 });
        const agg = yearlyByUpt.get(t.uptId);
        agg.peserta += Number(t.targetPeserta) || 0;
        agg.lulusan += Number(t.targetLulusan) || 0;
        continue;
      }
      if (!targetByUpt.has(t.uptId)) targetByUpt.set(t.uptId, new Map());
      const byProg = targetByUpt.get(t.uptId);
      if (!byProg.has(t.programId)) byProg.set(t.programId, new Map());
      byProg.get(t.programId).set(mNum, { tp: Number(t.targetPeserta) || 0, tl: Number(t.targetLulusan) || 0 });
    }

    // Real per bulan per program
    const realByUpt = new Map();
    for (const r of realDocs) {
      if (!r.programId) continue;
      const p = (Number(r.pesertaL) || 0) + (Number(r.pesertaP) || 0);
      const l = (Number(r.lulusanL) || 0) + (Number(r.lulusanP) || 0);
      if (!realByUpt.has(r.uptId)) realByUpt.set(r.uptId, new Map());
      const byProg = realByUpt.get(r.uptId);
      if (!byProg.has(r.programId)) byProg.set(r.programId, new Map());
      const byMonth = byProg.get(r.programId);
      const m = Number(r.month);
      const prev = byMonth.get(m) || { p: 0, l: 0 };
      byMonth.set(m, { p: prev.p + p, l: prev.l + l });
    }

    const upTo = month || upToMonth(year);
    const statusOf = (realTotal, targetTotal) => {
      if (!(targetTotal > 0)) return "TARGET_BELUM_DIATUR";
      return realTotal >= targetTotal ? "TERCAPAI" : "BELUM_TERCAPAI";
    };

    // Filter by matra for pusbang
    const isPusbangUser = isPusbang(req.user);
    const pusbangMatra = isPusbangUser ? (req.user.pusbangMatra || "").toLowerCase() : null;
    const uptList = [...uptMap.entries()]
      .filter(([id, upt]) => {
        if (uptIdFilter && id !== uptIdFilter) return false;
        if (isPusbangUser && pusbangMatra && (upt.matra || "").toLowerCase() !== pusbangMatra) return false;
        return true;
      })
      .sort((a, b) => (a[1].code || "").localeCompare(b[1].code || ""));

    const uptMonths = uptList.map(([id, upt]) => {
      const months = [];
      for (let mo = 1; mo <= upTo; mo++) {
        let real = null;
        const reals = realByUpt.get(id);
        if (reals) {
          for (const [, byMonth] of reals) {
            const v = byMonth.get(mo);
            if (v) { if (!real) real = { p: 0, l: 0 }; real.p += v.p; real.l += v.l; }
          }
        }
        let target = null;
        const tgts = targetByUpt.get(id);
        if (tgts) {
          for (const [, byMonth] of tgts) {
            const v = byMonth.get(mo);
            if (v) { if (!target) target = { tp: 0, tl: 0 }; target.tp += v.tp; target.tl += v.tl; }
          }
        }
        const rp = real ? real.p + real.l : 0;
        const tt = target ? target.tp + target.tl : 0;
        months.push({
          month: mo, hasReal: !!real, real: real || { p: 0, l: 0 }, target: target || { tp: 0, tl: 0 },
          hasTarget: tt > 0, realTotal: rp, targetTotal: tt,
          pct: tt > 0 ? Math.round((rp / tt) * 1000) / 10 : null, status: statusOf(rp, tt),
        });
      }
      return { uptId: id, uptCode: upt.code || "-", uptName: upt.name || "-", matra: upt.matra || "", months };
    });

    // Detail per program
    let programs = [];
    if (detail) {
      const selUpts = uptIdFilter ? [uptIdFilter] : uptList.map((u) => u[0]);
      for (const fp of progMaps.flat) {
        const months = [];
        for (let mo = 1; mo <= upTo; mo++) {
          let real = null, target = null;
          for (const uid of selUpts) {
            const rv = realByUpt.get(uid)?.get(fp.id)?.get(mo);
            if (rv) { if (!real) real = { p: 0, l: 0 }; real.p += rv.p; real.l += rv.l; }
            const tv = targetByUpt.get(uid)?.get(fp.id)?.get(mo);
            if (tv) { if (!target) target = { tp: 0, tl: 0 }; target.tp += tv.tp; target.tl += tv.tl; }
          }
          if (!real && !target) continue;
          const rp = real ? real.p + real.l : 0;
          const tt = target ? target.tp + target.tl : 0;
          months.push({
            month: mo, hasReal: !!real, realTotal: rp, targetTotal: tt, hasTarget: tt > 0,
            pct: tt > 0 ? Math.round((rp / tt) * 1000) / 10 : null, status: statusOf(rp, tt),
          });
        }
        if (months.length) {
          programs.push({ programId: fp.id, programName: fp.name, parentName: fp.parentName || "-", isParent: fp.isParent === true, months });
        }
      }
    }

    // Summary
    const active = uptMonths.filter((u) => u.months.some((mm) => mm.hasReal));
    const lastDataStatus = (u) => {
      for (let i = u.months.length - 1; i >= 0; i--) { if (u.months[i].hasReal) return u.months[i].status; }
      return null;
    };
    const totalReal = uptMonths.reduce((s, u) => s + u.months.reduce((x, mm) => x + mm.realTotal, 0), 0);
    let totalTarget = uptMonths.reduce((s, u) => s + u.months.reduce((x, mm) => x + mm.targetTotal, 0), 0);
    if (!uptIdFilter) {
      for (const [, agg] of yearlyByUpt) totalTarget += agg.peserta + agg.lulusan;
    } else if (yearlyByUpt.has(uptIdFilter)) {
      const agg = yearlyByUpt.get(uptIdFilter);
      totalTarget += agg.peserta + agg.lulusan;
    }

    const summary = {
      uptCount: uptList.length, uptWithReal: active.length,
      tercapai: active.filter((u) => lastDataStatus(u) === "TERCAPAI").length,
      belumTercapai: active.filter((u) => lastDataStatus(u) === "BELUM_TERCAPAI").length,
      noTarget: active.filter((u) => lastDataStatus(u) === "TARGET_BELUM_DIATUR").length,
      totalReal, totalTarget,
      pctTotal: totalTarget > 0 ? Math.round((totalReal / totalTarget) * 1000) / 10 : null,
    };

    res.json({ year, month, summary, uptMonths, programs, detail });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil rekap realisasi." });
  }
});

/** GET /api/realizations/achievement/:uptId */
router.get("/achievement/:uptId", requireAdmin, async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  try {
    const uptId = req.params.uptId;
    const uptDoc = await Upt.findByPk(uptId);
    if (!uptDoc) return res.status(404).json({ error: "UPT tidak ditemukan." });

    const [realDocs, targetDocs, progMaps] = await Promise.all([
      Realization.findAll({ where: { uptId, year } }),
      Target.findAll({ where: { uptId, year } }),
      getProgramMaps(),
    ]);

    function upToMonth(yr) {
      const now = new Date();
      return yr === now.getFullYear() ? now.getMonth() + 1 : 12;
    }
    const upTo = upToMonth(year);
    const realizations = realDocs.map((r) => r.toJSON()).filter((r) => r.programId);

    // Build targetsMap
    const targetsMap = new Map();
    for (const tDoc of targetDocs) {
      const t = tDoc.toJSON();
      if (!t.programId || t.month == null) continue;
      if (!targetsMap.has(t.programId)) targetsMap.set(t.programId, { monthly: [], yearly: null });
      const entry = targetsMap.get(t.programId);
      if (Number(t.month) === 0) {
        entry.yearly = { targetPeserta: t.targetPeserta || 0, targetLulusan: t.targetLulusan || 0 };
      } else {
        entry.monthly.push({ month: Number(t.month), targetPeserta: t.targetPeserta || 0, targetLulusan: t.targetLulusan || 0 });
      }
    }
    for (const item of targetsMap.values()) {
      item.targetPeserta = (item.monthly.reduce((s, m) => s + m.targetPeserta, 0)) + (item.yearly ? item.yearly.targetPeserta : 0);
      item.targetLulusan = (item.monthly.reduce((s, m) => s + m.targetLulusan, 0)) + (item.yearly ? item.yearly.targetLulusan : 0);
    }

    const programIds = [...new Set(realizations.map((r) => r.programId))];
    const byProgram = programIds.map((pid) => {
      const reals = realizations.filter((r) => r.programId === pid);
      const prog = progMaps.byId.get(pid);
      const target = targetsMap.get(pid) || null;
      return {
        programId: pid, programName: prog ? prog.name : "Program terhapus",
        parentName: prog ? (prog.parentId ? progMaps.byId.get(prog.parentId)?.name || "-" : prog.name) : "-",
        target: target ? { targetPeserta: target.targetPeserta, targetLulusan: target.targetLulusan } : null,
        achievement: computeAchievement(reals, target, upTo),
      };
    }).sort((a, b) => a.parentName.localeCompare(b.parentName) || a.programName.localeCompare(b.programName));

    const hasAnyTarget = targetsMap.size > 0;
    const achievement = computeAchievement(realizations, { targetPeserta: [...targetsMap.values()].reduce((s, i) => s + i.targetPeserta, 0), targetLulusan: [...targetsMap.values()].reduce((s, i) => s + i.targetLulusan, 0) }, upTo);

    res.json({ year, achievement, byProgram, hasAnyTarget });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menghitung capaian." });
  }
});

module.exports = router;
