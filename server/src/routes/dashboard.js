const express = require("express");
const { authenticate, requireAdmin, requirePimpinan, requirePusbang, isSuperAdmin, isPusbang } = require("../middleware/auth");
const { Realization, Target, Upt, User, Submission, TargetSubmission, Program, TarunaSubmission, AbsorptionSubmission, UnlockRequest, Taruna, GradAbsorption } = require("../models");
const { Op } = require("sequelize");
const { computeAchievement } = require("../lib/capaian");

const router = express.Router();

router.use(authenticate);

/**
 * Gabungkan target semua program menjadi target per UPT — KANONIS & SINKRON
 * dengan halaman laporan (reports.js) agar angka di semua dashboard valid:
 * - Dokumen month=0 (single-input, nilai terbaru) adalah acuan per program;
 *   sisa dokumen bulanan lama hanya dipakai bila program tak punya dokumen
 *   tahunan (per field).
 * - Induk yang punya turunan = jumlah turunan; dokumen Target induk yang
 *   tersisa/ganda diabaikan dan TIDAK ikut total (anti 219→429).
 * - `monthly` hanya berisi rincian bulanan program yang murni-bulanan;
 *   total tahunan = jumlah kanonis program non-induk (tiap program 1×).
 * computeAchievement memakai mode tahunan (proporsional) bila monthly kosong.
 */
function buildUptTargets(targetDocs, allPrograms = []) {
  const childrenOf = new Map();
  for (const p of allPrograms) {
    const pid = String(p.id);
    const par = p.parentId ? String(p.parentId) : null;
    if (!par) continue;
    if (!childrenOf.has(par)) childrenOf.set(par, []);
    childrenOf.get(par).push(pid);
  }
  const isParent = (pid) => childrenOf.has(String(pid));

  const annual = new Map(); // `${uptId}|${progId}` -> {tp,tl} (month=0)
  const monthlySum = new Map(); // sisa bulanan lama
  const monthlyDetail = new Map(); // key -> Map(month->{tp,tl})
  const uptIds = new Set();
  for (const t of targetDocs) {
    if (!t.programId || t.month == null) continue;
    const uid = String(t.uptId);
    uptIds.add(uid);
    const key = `${uid}|${t.programId}`;
    const tp = Number(t.targetPeserta) || 0;
    const tl = Number(t.targetLulusan) || 0;
    if (Number(t.month) === 0) {
      const prev = annual.get(key) || { tp: 0, tl: 0 };
      annual.set(key, { tp: prev.tp + tp, tl: prev.tl + tl });
    } else {
      const prev = monthlySum.get(key) || { tp: 0, tl: 0 };
      monthlySum.set(key, { tp: prev.tp + tp, tl: prev.tl + tl });
      if (!monthlyDetail.has(key)) monthlyDetail.set(key, new Map());
      const mm = monthlyDetail.get(key);
      const mNum = Number(t.month);
      const e = mm.get(mNum) || { tp: 0, tl: 0 };
      mm.set(mNum, { tp: e.tp + tp, tl: e.tl + tl });
    }
  }

  // Kanonis per program (per field): tahunan dulu, lalu bulanan lama.
  const canon = new Map();
  for (const key of new Set([...annual.keys(), ...monthlySum.keys()])) {
    const a = annual.get(key) || { tp: 0, tl: 0 };
    const m = monthlySum.get(key) || { tp: 0, tl: 0 };
    canon.set(key, { tp: a.tp > 0 ? a.tp : m.tp, tl: a.tl > 0 ? a.tl : m.tl });
  }
  // Induk berturunan = jumlah turunan — hanya bila turunan bernilai agar
  // input langsung induk (tanpa rincian) tidak hilang.
  for (const uid of uptIds) {
    for (const [parId, kids] of childrenOf.entries()) {
      let tp = 0, tl = 0;
      for (const kid of kids) {
        const c = canon.get(`${uid}|${kid}`);
        if (c) { tp += c.tp; tl += c.tl; }
      }
      if (tp + tl > 0) canon.set(`${uid}|${parId}`, { tp, tl });
    }
  }

  const out = new Map();
  for (const uid of uptIds) {
    const monthMap = new Map();
    let singleTp = 0, singleTl = 0, leafTp = 0, leafTl = 0;
    for (const [key, c] of canon.entries()) {
      const sep = key.indexOf("|");
      if (key.slice(0, sep) !== uid) continue;
      const pid = key.slice(sep + 1);
      if (isParent(pid)) continue; // induk tidak masuk total (anti ganda)
      leafTp += c.tp;
      leafTl += c.tl;
      const a = annual.get(key);
      if (a && a.tp + a.tl > 0) {
        singleTp += a.tp;
        singleTl += a.tl;
      } else {
        const mm = monthlyDetail.get(key);
        if (mm) {
          for (const [mNum, e] of mm.entries()) {
            const prev = monthMap.get(mNum) || { tp: 0, tl: 0 };
            monthMap.set(mNum, { tp: prev.tp + e.tp, tl: prev.tl + e.tl });
          }
        }
      }
    }
    const monthly = [...monthMap.entries()]
      .map(([month, v]) => ({ month, targetPeserta: v.tp, targetLulusan: v.tl }))
      .sort((a, b) => a.month - b.month);
    out.set(uid, {
      monthly,
      targetPeserta: leafTp,
      targetLulusan: leafTl,
      singlePeserta: singleTp,
      singleLulusan: singleTl,
    });
  }
  return out;
}

/** GET /api/dashboard/admin?year=2026 */
router.get("/admin", requireAdmin, async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  try {
    const [targetDocs, realDocs, upts, users, subDocs, progDocs] = await Promise.all([
      Target.findAll({ where: { year } }),
      Realization.findAll({ where: { year } }),
      Upt.findAll(),
      User.findAll({ where: { role: { [Op.in]: ["UPT_ADMIN", "PIMPINAN_UPT"] } } }),
      Submission.findAll({ where: { year } }),
      Program.findAll(),
    ]);

    // Approved months map
    const approvedMap = new Map();
    for (const s of subDocs) {
      if (s.status !== "approved") continue;
      if (!approvedMap.has(s.uptId)) approvedMap.set(s.uptId, new Set());
      approvedMap.get(s.uptId).add(Number(s.month));
    }

    const activeUpts = upts.filter((u) => u.isActive !== false);
    const totalUsers = users.filter((u) => u.isActive !== false).length;

    const realByUpt = new Map();
    for (const rDoc of realDocs) {
      const r = rDoc.toJSON();
      if (!r.programId) continue;
      const appSet = approvedMap.get(r.uptId);
      if (!appSet || !appSet.has(Number(r.month))) continue;
      if (!realByUpt.has(r.uptId)) realByUpt.set(r.uptId, []);
      realByUpt.get(r.uptId).push(r);
    }

    const targetByUpt = buildUptTargets(targetDocs.map((t) => t.toJSON()), progDocs.map((p) => p.toJSON()));

    // Grafik bulanan
    const monthlySeries = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][i],
      peserta: 0, lulusan: 0, targetPeserta: 0, targetLulusan: 0,
    }));

    for (const list of realByUpt.values()) {
      for (const r of list) {
        const idx = Number(r.month) - 1;
        if (idx >= 0 && idx < 12) {
          // totalPeserta/totalLulusan sudah = L+P di DB; jangan tambahkan P lagi (double-count).
          monthlySeries[idx].peserta += Number(r.totalPeserta) || ((Number(r.pesertaL) || 0) + (Number(r.pesertaP) || 0));
          monthlySeries[idx].lulusan += Number(r.totalLulusan) || ((Number(r.lulusanL) || 0) + (Number(r.lulusanP) || 0));
        }
      }
    }
    for (const target of targetByUpt.values()) {
      for (const m of target.monthly) {
        const idx = m.month - 1;
        if (idx >= 0 && idx < 12) {
          monthlySeries[idx].targetPeserta += m.targetPeserta;
          monthlySeries[idx].targetLulusan += m.targetLulusan;
        }
      }
      // SINGLE-INPUT: sebar rata tahunan ke 12 bulan agar grafik monitoring tidak kosong
      if ((target.singlePeserta || target.singleLulusan) && target.monthly.length === 0) {
        const perTp = (target.singlePeserta || 0) / 12;
        const perTl = (target.singleLulusan || 0) / 12;
        for (let i = 0; i < 12; i++) {
          monthlySeries[i].targetPeserta += perTp;
          monthlySeries[i].targetLulusan += perTl;
        }
      }
    }

    const now = new Date();
    const upTo = year === now.getFullYear() ? now.getMonth() + 1 : 12;

    const uptAchievements = activeUpts
      .map((upt) => {
        const reals = (realByUpt.get(upt.id) || []).map((r) => ({
          ...r, totalPeserta: r.totalPeserta || (Number(r.pesertaL) || 0) + (Number(r.pesertaP) || 0),
          totalLulusan: r.totalLulusan || (Number(r.lulusanL) || 0) + (Number(r.lulusanP) || 0),
        }));
        const target = targetByUpt.get(upt.id) || null;
        const ach = computeAchievement(reals, target, upTo);
        const hasReal = reals.length > 0;
        return {
          uptId: upt.id, uptCode: upt.code, uptName: upt.name, matra: upt.matra || "", hasReal,
          targetPeserta: ach.targetTotal > 0 ? ach.targetPeserta : null,
          targetLulusan: ach.targetTotal > 0 ? ach.targetLulusan : null,
          realisasiPeserta: ach.totalPeserta, realisasiLulusan: ach.totalLulusan,
          progress: ach.yearlyPct, yearlyStatus: ach.yearlyStatus, achievement: ach,
        };
      })
      .sort((a, b) => (b.progress ?? -1) - (a.progress ?? -1) || a.uptCode.localeCompare(b.uptCode));

    const totals = {
      peserta: monthlySeries.reduce((s, m) => s + m.peserta, 0),
      lulusan: monthlySeries.reduce((s, m) => s + m.lulusan, 0),
      targetPeserta: monthlySeries.reduce((s, m) => s + m.targetPeserta, 0),
      targetLulusan: monthlySeries.reduce((s, m) => s + m.targetLulusan, 0),
    };

    const targetTotalAll = totals.targetPeserta + totals.targetLulusan;
    const withTarget = uptAchievements.filter((u) => u.achievement.targetTotal > 0);
    const tercapai = uptAchievements.filter((u) => u.yearlyStatus === "TERCAPAI").length;
    const belumTercapai = withTarget.filter((u) => u.yearlyStatus === "BELUM_TERCAPAI").length;
    const tanpaTarget = uptAchievements.length - withTarget.length;
    const uptMelapor = uptAchievements.filter((u) => u.hasReal).length;

    // Matra comparison (3 Matra Taruna + Aparatur)
    const MATRA_LIST = [
      { key: "darat", label: "Darat" },
      { key: "laut", label: "Laut" },
      { key: "udara", label: "Udara" },
      { key: "aparatur", label: "Aparatur" },
    ];
    const matraComparison = MATRA_LIST.map(({ key, label }) => {
      const uptsInMatra = activeUpts.filter((u) => {
        const m = (u.matra || "").toLowerCase();
        const t = (u.uptType || "").toLowerCase();
        if (key === "aparatur") return m === "aparatur" || t === "aparatur";
        return m === key && t !== "aparatur";
      });
      const achList = uptsInMatra.map((u) => {
        const reals = (realByUpt.get(u.id) || []).map((r) => ({
          ...r, totalPeserta: r.totalPeserta || (Number(r.pesertaL) || 0) + (Number(r.pesertaP) || 0),
          totalLulusan: r.totalLulusan || (Number(r.lulusanL) || 0) + (Number(r.lulusanP) || 0),
        }));
        return computeAchievement(reals, targetByUpt.get(u.id) || null, upTo);
      });
      const totalPeserta = achList.reduce((s, a) => s + (a.totalPeserta || 0), 0);
      const totalLulusan = achList.reduce((s, a) => s + (a.totalLulusan || 0), 0);
      const targetTotal = achList.reduce((s, a) => s + (a.targetTotal || 0), 0);
      return {
        matra: key, label, uptCount: uptsInMatra.length,
        totalPeserta, totalLulusan, totalRealisasi: totalPeserta + totalLulusan,
        targetTotal, uptTarget: achList.filter((a) => a.targetTotal > 0).length,
        uptTercapai: achList.filter((a) => a.yearlyStatus === "TERCAPAI").length,
        pct: targetTotal > 0 ? Math.round(((totalPeserta + totalLulusan) / targetTotal) * 100) : null,
      };
    });

    res.json({
      year,
      stats: {
        totalUpt: activeUpts.length, totalUsers, uptMelapor,
        totalPeserta: totals.peserta, totalLulusan: totals.lulusan,
        targetDiisi: withTarget.length, uptTercapai: tercapai, belumTercapai, tanpaTarget,
        targetTotal: targetTotalAll, realisasiTotal: totals.peserta + totals.lulusan,
        pctTotal: targetTotalAll > 0 ? Math.round(((totals.peserta + totals.lulusan) / targetTotalAll) * 1000) / 10 : null,
      },
      monthlySeries, uptAchievements, matraComparison,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil data dashboard." });
  }
});

/** GET /api/dashboard/pimpinan?year=2026 */
router.get("/pimpinan", requirePimpinan, async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  try {
    const uptId = req.user.uptId;
    if (!uptId) return res.status(400).json({ error: "Akun belum tertaut ke UPT." });

    const [targetDocs, realDocs, uptDoc, subDocs, tarunaSubDocs, absorptionSubDocs, progDocs] = await Promise.all([
      Target.findAll({ where: { uptId, year } }),
      Realization.findAll({ where: { uptId, year } }),
      Upt.findByPk(uptId),
      Submission.findAll({ where: { uptId, year } }),
      TarunaSubmission.findAll({ where: { uptId, year } }),
      AbsorptionSubmission.findAll({ where: { uptId, year } }),
      Program.findAll(),
    ]);
    if (!uptDoc) return res.status(404).json({ error: "UPT tidak ditemukan." });

    const approvedSet = new Set(subDocs.filter((s) => s.status === "approved").map((s) => Number(s.month)));
    const targetByUpt = buildUptTargets(targetDocs.map((t) => t.toJSON()), progDocs.map((p) => p.toJSON()));
    const target = targetByUpt.get(uptId) || null;

    const reals = realDocs.map((r) => r.toJSON())
      .map((r) => ({ ...r, totalPeserta: r.totalPeserta || (Number(r.pesertaL) || 0) + (Number(r.pesertaP) || 0), totalLulusan: r.totalLulusan || (Number(r.lulusanL) || 0) + (Number(r.lulusanP) || 0) }))
      .filter((r) => approvedSet.has(Number(r.month)));

    const now = new Date();
    const upTo = year === now.getFullYear() ? now.getMonth() + 1 : 12;
    const ach = computeAchievement(reals, target, upTo);

    const pendingTarunaCount = tarunaSubDocs.filter((s) => s.status === 'submitted_pimpinan').length;
    const pendingAbsorptionCount = absorptionSubDocs.filter((s) => s.status === 'submitted_pimpinan').length;

    res.json({
      year,
      upt: uptDoc.toJSON(),
      achievement: ach,
      target,
      submissions: subDocs,
      tarunaSubmissions: tarunaSubDocs,
      absorptionSubmissions: absorptionSubDocs,
      pendingTarunaCount,
      pendingAbsorptionCount,
      hasReal: reals.length > 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil dashboard pimpinan." });
  }
});

/** GET /api/dashboard/pusbang?year=2026 */
router.get("/pusbang", requirePusbang, async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  try {
    const matra = (req.user.pusbangMatra || "").toLowerCase();
    if (!matra) return res.status(400).json({ error: "Pusbang belum memiliki matra." });

    const [targetDocs, realDocs, uptDocs, subDocs, pendingUnlockCount, gradRecords, progDocs] = await Promise.all([
      Target.findAll({ where: { year } }),
      Realization.findAll({ where: { year } }),
      Upt.findAll({ where: { matra } }),
      Submission.findAll({ where: { matra, year } }),
      UnlockRequest.count({ where: { matra, status: "pending_pusbang" } }),
      GradAbsorption.findAll({ where: { year } }),
      Program.findAll(),
    ]);

    const approvedMap = new Map();
    for (const s of subDocs) {
      if (s.status !== "approved") continue;
      if (!approvedMap.has(s.uptId)) approvedMap.set(s.uptId, new Set());
      approvedMap.get(s.uptId).add(Number(s.month));
    }

    const upts = uptDocs.filter((u) => u.isActive !== false);
    const uptIds = new Set(upts.map((u) => u.id));

    const realByUpt = new Map();
    for (const rDoc of realDocs) {
      const r = rDoc.toJSON();
      if (!uptIds.has(r.uptId)) continue;
      const appSet = approvedMap.get(r.uptId);
      if (!appSet || !appSet.has(Number(r.month))) continue;
      if (!realByUpt.has(r.uptId)) realByUpt.set(r.uptId, []);
      realByUpt.get(r.uptId).push(r);
    }
    const targetByUpt = buildUptTargets(targetDocs.map((t) => t.toJSON()), progDocs.map((p) => p.toJSON()));

    const now = new Date();
    const upTo = year === now.getFullYear() ? now.getMonth() + 1 : 12;

    const uptList = upts.map((upt) => {
      const reals = (realByUpt.get(upt.id) || []).map((r) => ({
        ...r,
        totalPeserta: r.totalPeserta || (Number(r.pesertaL) || 0) + (Number(r.pesertaP) || 0),
        totalLulusan: r.totalLulusan || (Number(r.lulusanL) || 0) + (Number(r.lulusanP) || 0),
      }));
      const target = targetByUpt.get(upt.id) || null;
      const ach = computeAchievement(reals, target, upTo);
      return {
        uptId: upt.id,
        uptCode: upt.code,
        uptName: upt.name,
        matra: upt.matra,
        hasReal: reals.length > 0,
        achievement: ach,
        progress: ach.yearlyPct != null ? ach.yearlyPct : 0,
        yearlyStatus: ach.yearlyStatus || "TARGET_BELUM_DIATUR",
        targetPeserta: ach.targetPeserta || 0,
        targetLulusan: ach.targetLulusan || 0,
        targetTotal: ach.targetTotal || 0,
        realPeserta: ach.totalPeserta || 0,
        realLulusan: ach.totalLulusan || 0,
        totalReal: ach.totalKeseluruhan || 0,
        reportedMonthsCount: reals.length,
      };
    });

    const totalPeserta = uptList.reduce((s, u) => s + (u.realPeserta || 0), 0);
    const totalLulusan = uptList.reduce((s, u) => s + (u.realLulusan || 0), 0);
    const totalTargetPeserta = uptList.reduce((s, u) => s + (u.targetPeserta || 0), 0);
    const totalTargetLulusan = uptList.reduce((s, u) => s + (u.targetLulusan || 0), 0);
    const totalTarget = totalTargetPeserta + totalTargetLulusan;
    const overallPct = totalTarget > 0 ? Math.round(((totalPeserta + totalLulusan) / totalTarget) * 1000) / 10 : 0;
    const reportedUptCount = uptList.filter((u) => u.hasReal).length;

    // Monthly aggregation for this matra
    const monthlySeries = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][i],
      realPeserta: 0,
      realLulusan: 0,
      realTotal: 0,
      targetPeserta: 0,
      targetLulusan: 0,
      targetTotal: 0,
    }));

    for (const list of realByUpt.values()) {
      for (const r of list) {
        const idx = Number(r.month) - 1;
        if (idx >= 0 && idx < 12) {
          const p = Number(r.totalPeserta || (Number(r.pesertaL) || 0) + (Number(r.pesertaP) || 0));
          const l = Number(r.totalLulusan || (Number(r.lulusanL) || 0) + (Number(r.lulusanP) || 0));
          monthlySeries[idx].realPeserta += p;
          monthlySeries[idx].realLulusan += l;
          monthlySeries[idx].realTotal += p + l;
        }
      }
    }

    for (const upt of upts) {
      const target = targetByUpt.get(upt.id);
      if (target && target.monthly) {
        for (const m of target.monthly) {
          const idx = Number(m.month) - 1;
          if (idx >= 0 && idx < 12) {
            const tp = Number(m.targetPeserta || 0);
            const tl = Number(m.targetLulusan || 0);
            monthlySeries[idx].targetPeserta += tp;
            monthlySeries[idx].targetLulusan += tl;
            monthlySeries[idx].targetTotal += tp + tl;
          }
        }
        // SINGLE-INPUT: sebar rata agar grafik matra tidak kosong
        if ((target.singlePeserta || target.singleLulusan) && target.monthly.length === 0) {
          const perTp = (target.singlePeserta || 0) / 12;
          const perTl = (target.singleLulusan || 0) / 12;
          for (let i = 0; i < 12; i++) {
            monthlySeries[i].targetPeserta += perTp;
            monthlySeries[i].targetLulusan += perTl;
            monthlySeries[i].targetTotal += perTp + perTl;
          }
        }
      }
    }

    // Taruna & Graduate absorption summary for this matra
    const matraGrads = gradRecords.filter((g) => uptIds.has(g.uptId));
    const categories = { pns: 0, ppnpn: 0, bumn_bumd: 0, swasta: 0, belum_bekerja: 0 };
    for (const g of matraGrads) {
      const kat = (g.kategoriSerap || "").toLowerCase();
      if (categories[kat] !== undefined) categories[kat]++;
    }
    const totalAbsorbed = categories.pns + categories.ppnpn + categories.bumn_bumd + categories.swasta;
    const totalGradRecords = matraGrads.length;
    const absorptionPct = totalGradRecords > 0 ? Math.round((totalAbsorbed / totalGradRecords) * 1000) / 10 : 0;

    let totalTaruna = 0;
    try {
      totalTaruna = await Taruna.count({ where: { uptId: { [Op.in]: Array.from(uptIds) }, isActive: true } });
    } catch (_) {}

    const tarunaSummary = {
      totalTaruna,
      totalAbsorbed,
      totalGradRecords,
      absorptionPct,
      categories,
    };

    const pendingCount = subDocs.filter((s) => s.status === "pending_pimpinan").length;

    res.json({
      year,
      matra,
      upts: uptList,
      totalPeserta,
      totalLulusan,
      totalTargetPeserta,
      totalTargetLulusan,
      totalTarget,
      overallPct,
      reportedUptCount,
      pendingCount,
      pendingUnlockCount: pendingUnlockCount || 0,
      monthlySeries,
      tarunaSummary,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil dashboard pusbang." });
  }
});

module.exports = router;
