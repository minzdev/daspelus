const express = require("express");
const { authenticate, requireAdmin, requirePimpinan, requirePusbang, isSuperAdmin, isPusbang } = require("../middleware/auth");
const { Realization, Target, Upt, User, Submission, TargetSubmission, Program, TarunaSubmission, AbsorptionSubmission, UnlockRequest, Taruna, GradAbsorption } = require("../models");
const { Op } = require("sequelize");
const { computeAchievement } = require("../lib/capaian");

const router = express.Router();

router.use(authenticate);

/**
 * Gabungkan target semua program menjadi target per UPT.
 * SINGLE-INPUT: dokumen month=0 adalah target tahunan kanonis (bukan bulan ke-0).
 * monthly hanya berisi bulan 1-12; total tahunan = monthly + single.
 * computeAchievement memakai mode tahunan (proporsional) bila monthly kosong.
 */
function buildUptTargets(targetDocs) {
  const byUpt = new Map();
  for (const t of targetDocs) {
    if (!t.programId || t.month == null) continue;
    const mNum = Number(t.month);
    if (!byUpt.has(t.uptId)) byUpt.set(t.uptId, { monthMap: new Map(), singleTp: 0, singleTl: 0 });
    const entry = byUpt.get(t.uptId);
    if (mNum === 0) {
      entry.singleTp += Number(t.targetPeserta) || 0;
      entry.singleTl += Number(t.targetLulusan) || 0;
    } else {
      const prev = entry.monthMap.get(mNum) || { tp: 0, tl: 0 };
      entry.monthMap.set(mNum, {
        tp: prev.tp + (Number(t.targetPeserta) || 0),
        tl: prev.tl + (Number(t.targetLulusan) || 0),
      });
    }
  }
  const out = new Map();
  for (const [uptId, entry] of byUpt.entries()) {
    const monthly = [...entry.monthMap.entries()]
      .map(([month, v]) => ({ month, targetPeserta: v.tp, targetLulusan: v.tl }))
      .sort((a, b) => a.month - b.month);
    out.set(uptId, {
      monthly,
      targetPeserta: monthly.reduce((s, m) => s + m.targetPeserta, 0) + entry.singleTp,
      targetLulusan: monthly.reduce((s, m) => s + m.targetLulusan, 0) + entry.singleTl,
      singlePeserta: entry.singleTp,
      singleLulusan: entry.singleTl,
    });
  }
  return out;
}

/** GET /api/dashboard/admin?year=2026 */
router.get("/admin", requireAdmin, async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  try {
    const [targetDocs, realDocs, upts, users, subDocs] = await Promise.all([
      Target.findAll({ where: { year } }),
      Realization.findAll({ where: { year } }),
      Upt.findAll(),
      User.findAll({ where: { role: { [Op.in]: ["UPT_ADMIN", "PIMPINAN_UPT"] } } }),
      Submission.findAll({ where: { year } }),
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

    const targetByUpt = buildUptTargets(targetDocs.map((t) => t.toJSON()));

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
          monthlySeries[idx].peserta += Number(r.totalPeserta || r.pesertaL || 0) + Number(r.pesertaP || 0);
          monthlySeries[idx].lulusan += Number(r.totalLulusan || r.lulusanL || 0) + Number(r.lulusanP || 0);
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

    const [targetDocs, realDocs, uptDoc, subDocs, tarunaSubDocs, absorptionSubDocs] = await Promise.all([
      Target.findAll({ where: { uptId, year } }),
      Realization.findAll({ where: { uptId, year } }),
      Upt.findByPk(uptId),
      Submission.findAll({ where: { uptId, year } }),
      TarunaSubmission.findAll({ where: { uptId, year } }),
      AbsorptionSubmission.findAll({ where: { uptId, year } }),
    ]);
    if (!uptDoc) return res.status(404).json({ error: "UPT tidak ditemukan." });

    const approvedSet = new Set(subDocs.filter((s) => s.status === "approved").map((s) => Number(s.month)));
    const targetByUpt = buildUptTargets(targetDocs.map((t) => t.toJSON()));
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

    const [targetDocs, realDocs, uptDocs, subDocs, pendingUnlockCount, gradRecords] = await Promise.all([
      Target.findAll({ where: { year } }),
      Realization.findAll({ where: { year } }),
      Upt.findAll({ where: { matra } }),
      Submission.findAll({ where: { matra, year } }),
      UnlockRequest.count({ where: { matra, status: "pending_pusbang" } }),
      GradAbsorption.findAll({ where: { year } }),
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
    const targetByUpt = buildUptTargets(targetDocs.map((t) => t.toJSON()));

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
