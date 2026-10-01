/**
 * Logika bisnis capaian Perjanjian Kinerja (PK).
 *
 * Definisi:
 * - totalPeserta   = pesertaL + pesertaP  (per bulan)
 * - totalLulusan   = lulusanL + lulusanP  (per bulan)
 * - realisasi kumulatif(bulan m) = jumlah bulan 1..m
 *
 * Target PK mendukung DUA mode:
 * 1. Bulanan: target per bulan, tiap bulan bisa berbeda.
 *    target = { monthly: [{month, targetPeserta, targetLulusan}] }
 *    -> target kumulatif(bulan m) = jumlah target bulan 1..m
 * 2. Tahunan (legacy): target = { targetPeserta, targetLulusan }
 *    -> target proporsional(bulan m) = target_tahunan * m / 12
 *
 * Status bulan m: TERCAPAI bila kumulatif >= target kumulatif/proporsional sampai bulan m.
 * Bila total target tahunan = 0, status = TARGET_BELUM_DIATUR.
 *
 * Satu bulan dapat memiliki beberapa dokumen realisasi (satu per program),
 * sehingga agregasi bulanan menjumlahkan seluruh dokumen pada bulan tersebut.
 */

const STATUS = {
  TERCAPAI: "TERCAPAI",
  BELUM_TERCAPAI: "BELUM_TERCAPAI",
  TARGET_BELUM_DIATUR: "TARGET_BELUM_DIATUR",
};

/** Jumlahkan total peserta & lulusan dari sebuah dokumen realisasi. */
function sumRealization(r) {
  const pesertaL = Number(r.pesertaL) || 0;
  const pesertaP = Number(r.pesertaP) || 0;
  const lulusanL = Number(r.lulusanL) || 0;
  const lulusanP = Number(r.lulusanP) || 0;
  return {
    pesertaL,
    pesertaP,
    lulusanL,
    lulusanP,
    totalPeserta: pesertaL + pesertaP,
    totalLulusan: lulusanL + lulusanP,
    totalKeseluruhan: pesertaL + pesertaP + lulusanL + lulusanP,
  };
}

/** Gabungkan beberapa ringkasan dokumen ke dalam satu agregat bulanan. */
function addSum(target, src) {
  target.pesertaL += src.pesertaL;
  target.pesertaP += src.pesertaP;
  target.lulusanL += src.lulusanL;
  target.lulusanP += src.lulusanP;
  target.totalPeserta += src.totalPeserta;
  target.totalLulusan += src.totalLulusan;
  target.totalKeseluruhan += src.totalKeseluruhan;
  return target;
}

/**
 * Normalisasi target:
 * - monthMap : Map(month -> {tp, tl}) untuk mode bulanan
 * - annualTp / annualTl : total target setahun (jumlah semua bulan)
 */
function normalizeTarget(target) {
  if (!target) return { hasMonthly: false, monthMap: new Map(), annualTp: 0, annualTl: 0 };
  if (Array.isArray(target.monthly) && target.monthly.length > 0) {
    const monthMap = new Map();
    for (const m of target.monthly) {
      const tp = Number(m.targetPeserta) || 0;
      const tl = Number(m.targetLulusan) || 0;
      if (tp > 0 || tl > 0) monthMap.set(Number(m.month), { tp, tl });
    }
    const annualTp = [...monthMap.values()].reduce((s, v) => s + v.tp, 0);
    const annualTl = [...monthMap.values()].reduce((s, v) => s + v.tl, 0);
    return { hasMonthly: true, monthMap, annualTp, annualTl };
  }
  const annualTp = Number(target.targetPeserta) || 0;
  const annualTl = Number(target.targetLulusan) || 0;
  return { hasMonthly: false, monthMap: new Map(), annualTp, annualTl };
}

/** Target kumulatif (bulanan) / proporsional (tahunan) sampai bulan m. */
function cumulativeTarget(norm, m) {
  if (norm.hasMonthly) {
    let tp = 0;
    let tl = 0;
    for (let k = 1; k <= m; k++) {
      const v = norm.monthMap.get(k);
      if (v) {
        tp += v.tp;
        tl += v.tl;
      }
    }
    return { tp, tl };
  }
  return {
    tp: Math.round((norm.annualTp * m) / 12),
    tl: Math.round((norm.annualTl * m) / 12),
  };
}

/**
 * Hitung capaian untuk satu UPT (+opsional satu program) pada satu tahun.
 * @param {Array} realizations  daftar {month, pesertaL, pesertaP, lulusanL, lulusanP}
 * @param {Object|null} target  {targetPeserta,targetLulusan} atau {monthly:[...]} atau null
 * @param {number} upToMonth   hitung kumulatif sampai bulan ini (1-12).
 */
function computeAchievement(realizations, target, upToMonth = 12) {
  const byMonth = new Map();
  for (const r of realizations) {
    const m = Number(r.month);
    const s = sumRealization(r);
    if (byMonth.has(m)) {
      addSum(byMonth.get(m), s);
    } else {
      byMonth.set(m, s);
    }
  }

  const norm = normalizeTarget(target);
  const hasTarget = norm.annualTp + norm.annualTl > 0;

  const monthly = [];
  let cumPeserta = 0;
  let cumLulusan = 0;

  for (let m = 1; m <= upToMonth; m++) {
    const data = byMonth.get(m);
    cumPeserta += data ? data.totalPeserta : 0;
    cumLulusan += data ? data.totalLulusan : 0;

    const cumTarget = cumulativeTarget(norm, m);

    // persentase terhadap total target tahunan
    const pctPeserta = norm.annualTp > 0 ? Math.round((cumPeserta / norm.annualTp) * 1000) / 10 : null;
    const pctLulusan = norm.annualTl > 0 ? Math.round((cumLulusan / norm.annualTl) * 1000) / 10 : null;

    const statusPeserta = !hasTarget
      ? STATUS.TARGET_BELUM_DIATUR
      : cumPeserta >= cumTarget.tp
        ? STATUS.TERCAPAI
        : STATUS.BELUM_TERCAPAI;

    const statusLulusan = !hasTarget
      ? STATUS.TARGET_BELUM_DIATUR
      : cumLulusan >= cumTarget.tl
        ? STATUS.TERCAPAI
        : STATUS.BELUM_TERCAPAI;

    monthly.push({
      month: m,
      hasData: !!data,
      ...(data || {
        pesertaL: 0,
        pesertaP: 0,
        lulusanL: 0,
        lulusanP: 0,
        totalPeserta: 0,
        totalLulusan: 0,
        totalKeseluruhan: 0,
      }),
      cumPeserta,
      cumLulusan,
      propPeserta: cumTarget.tp,
      propLulusan: cumTarget.tl,
      pctPeserta,
      pctLulusan,
      statusPeserta,
      statusLulusan,
    });
  }

  const totalPeserta = cumPeserta;
  const totalLulusan = cumLulusan;
  const yearTotal = norm.annualTp + norm.annualTl;

  let yearlyStatus = STATUS.TARGET_BELUM_DIATUR;
  let yearlyPct = null;
  if (hasTarget) {
    yearlyPct = Math.round(((totalPeserta + totalLulusan) / yearTotal) * 1000) / 10;
    yearlyStatus = totalPeserta + totalLulusan >= yearTotal ? STATUS.TERCAPAI : STATUS.BELUM_TERCAPAI;
  }

  return {
    totalPeserta,
    totalLulusan,
    totalKeseluruhan: totalPeserta + totalLulusan,
    monthly,
    yearlyStatus,
    yearlyPct,
    targetPeserta: norm.annualTp,
    targetLulusan: norm.annualTl,
    targetTotal: yearTotal,
  };
}

module.exports = { STATUS, sumRealization, computeAchievement };
