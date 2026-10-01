const express = require('express');
const { Op } = require('sequelize');
const { authenticate, requireUpt, requireUptAdmin, requirePimpinan, isSuperAdmin, isPusbang, isPimpinan, isUptAdmin } = require('../middleware/auth');
const { Prodi, AbsorptionSubmission, GradAbsorption, Upt, User, Taruna, TarunaSubmission, UnlockRequest } = require('../models');
const notifier = require('../lib/notifier');
const { audit } = require('../lib/audit');

const router = express.Router();
router.use(authenticate);

// Default prodi seed template by matra
const DEFAULT_PRODIS = {
  laut: [
    { namaProdi: 'D-IV Nautika', jenjang: 'D4' },
    { namaProdi: 'D-IV Teknika', jenjang: 'D4' },
    { namaProdi: 'D-IV Ketatalaksanaan Angkutan Laut & Kepelabuhanan (KALK)', jenjang: 'D4' },
    { namaProdi: 'D-III Nautika', jenjang: 'D3' },
    { namaProdi: 'D-III Teknika', jenjang: 'D3' },
    { namaProdi: 'D-III Manajemen Pelabuhan', jenjang: 'D3' },
  ],
  darat: [
    { namaProdi: 'D-IV Transportasi Darat', jenjang: 'D4' },
    { namaProdi: 'D-IV Manajemen Keselamatan Transportasi Jalan (MKTJ)', jenjang: 'D4' },
    { namaProdi: 'D-III Manajemen Transportasi Jalan (MTJ)', jenjang: 'D3' },
    { namaProdi: 'D-III Teknologi Otomotif', jenjang: 'D3' },
    { namaProdi: 'D-III Perkeretaapian', jenjang: 'D3' },
  ],
  udara: [
    { namaProdi: 'D-IV Teknik Pesawat Udara', jenjang: 'D4' },
    { namaProdi: 'D-IV Lalu Lintas Udara (Air Traffic Control)', jenjang: 'D4' },
    { namaProdi: 'D-III Manajemen Bandar Udara', jenjang: 'D3' },
    { namaProdi: 'D-III Operasi Navigasi Udara', jenjang: 'D3' },
    { namaProdi: 'D-III Teknik Bangunan & Landasan', jenjang: 'D3' },
  ],
  aparatur: [
    { namaProdi: 'Diklat Kepemimpinan Aparatur', jenjang: 'Diklat' },
    { namaProdi: 'Diklat Teknis Transportasi', jenjang: 'Diklat' },
  ],
};

const QUARTER_NAMES = {
  1: 'Triwulan I (Jan - Mar)',
  2: 'Triwulan II (Apr - Jun)',
  3: 'Triwulan III (Jul - Sep)',
  4: 'Triwulan IV (Okt - Des)',
};

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function isValidMonth(m) {
  const n = Number(m);
  return Number.isInteger(n) && n >= 1 && n <= 12;
}

/** Triwulan turunan dari bulan (untuk kompatibilitas kolom quarter). */
function quarterOfMonth(m) {
  return Math.ceil(Number(m) / 3);
}

/** Nama periode: "Bulan Januari" untuk data bulanan, "Triwulan I..." untuk data era triwulan. */
function periodNameOf(sub) {
  if (!sub) return '-';
  if (sub.month) return `Bulan ${MONTH_NAMES[Number(sub.month) - 1]}`;
  if (sub.quarter) return QUARTER_NAMES[sub.quarter] || `Triwulan ${sub.quarter}`;
  return '-';
}

/** Lengkapi JSON submission/record dengan label periode bulanan (fallback triwulan untuk data lama). */
function withPeriodInfo(obj) {
  const month = obj.month ? Number(obj.month) : null;
  const quarter = obj.quarter ? Number(obj.quarter) : (month ? quarterOfMonth(month) : null);
  return {
    ...obj,
    month,
    quarter,
    monthName: month ? MONTH_NAMES[month - 1] : null,
    monthShort: month ? MONTH_SHORT[month - 1] : null,
    quarterName: quarter ? QUARTER_NAMES[quarter] || `Triwulan ${quarter}` : null,
    periodName: month ? `Bulan ${MONTH_NAMES[month - 1]}` : (quarter ? QUARTER_NAMES[quarter] || `Triwulan ${quarter}` : '-'),
    periodKind: month ? 'bulanan' : 'triwulan',
  };
}

/** Ensure default prodis exist for an UPT */
async function ensureProdis(upt) {
  if (!upt) return [];
  let list = await Prodi.findAll({ where: { uptId: upt.id, isActive: true }, order: [['namaProdi', 'ASC']] });
  if (list.length === 0) {
    const matraKey = (upt.matra || '').toLowerCase();
    const seeds = DEFAULT_PRODIS[matraKey] || DEFAULT_PRODIS.laut;
    for (const s of seeds) {
      await Prodi.create({
        uptId: upt.id,
        namaProdi: s.namaProdi,
        jenjang: s.jenjang,
        matra: upt.matra || 'laut',
        isActive: true,
      });
    }
    list = await Prodi.findAll({ where: { uptId: upt.id, isActive: true }, order: [['namaProdi', 'ASC']] });
  }
  return list;
}

/** Format matrix data matching the official Kemenhub spreadsheet layout */
function formatAbsorptionMatrix(prodis, records) {
  // Group records by prodiId
  const byProdi = new Map();
  for (const p of prodis) {
    byProdi.set(p.id, {
      prodiId: p.id,
      namaProdi: p.namaProdi,
      jenjang: p.jenjang || 'D4',
      pns: [],
      ppnpn: [],
      bumn: [],
      swasta: [],
      belumBekerja: [],
    });
  }

  for (const r of records) {
    const entry = byProdi.get(r.prodiId);
    if (!entry) continue;
    const item = {
      id: r.id,
      namaTaruna: r.namaTaruna,
      nimTaruna: r.nimTaruna || '-',
      instansiBekerja: r.instansiBekerja || '-',
      kategoriSerap: r.kategoriSerap,
      keterangan: r.keterangan || '',
    };
    if (r.kategoriSerap === 'pns') entry.pns.push(item);
    else if (r.kategoriSerap === 'ppnpn') entry.ppnpn.push(item);
    else if (r.kategoriSerap === 'bumn_bumd') entry.bumn.push(item);
    else if (r.kategoriSerap === 'swasta') entry.swasta.push(item);
    else entry.belumBekerja.push(item);
  }

  // Build matrix rows
  const rows = [];
  let grandPns = 0;
  let grandPpnpn = 0;
  let grandBumn = 0;
  let grandSwasta = 0;
  let grandBelumBekerja = 0;

  for (const [prodiId, data] of byProdi.entries()) {
    const totalPemerintah = data.pns.length + data.ppnpn.length;
    const totalNonPemerintah = data.bumn.length + data.swasta.length;
    const totalBekerja = totalPemerintah + totalNonPemerintah;
    const totalLulusan = totalBekerja + data.belumBekerja.length;
    const pct = totalLulusan > 0 ? Math.round((totalBekerja / totalLulusan) * 100) : 0;

    grandPns += data.pns.length;
    grandPpnpn += data.ppnpn.length;
    grandBumn += data.bumn.length;
    grandSwasta += data.swasta.length;
    grandBelumBekerja += data.belumBekerja.length;

    rows.push({
      prodiId,
      namaProdi: data.namaProdi,
      jenjang: data.jenjang,
      pns: data.pns,
      ppnpn: data.ppnpn,
      bumn: data.bumn,
      swasta: data.swasta,
      belumBekerja: data.belumBekerja,
      countPns: data.pns.length,
      countPpnpn: data.ppnpn.length,
      countBumn: data.bumn.length,
      countSwasta: data.swasta.length,
      countBelumBekerja: data.belumBekerja.length,
      totalPemerintah,
      totalNonPemerintah,
      totalBekerja,
      totalLulusan,
      pct,
    });
  }

  const grandBekerja = grandPns + grandPpnpn + grandBumn + grandSwasta;
  const grandLulusan = grandBekerja + grandBelumBekerja;
  const grandPct = grandLulusan > 0 ? Math.round((grandBekerja / grandLulusan) * 100) : 0;

  return {
    rows,
    summary: {
      totalPns: grandPns,
      totalPpnpn: grandPpnpn,
      totalBumn: grandBumn,
      totalSwasta: grandSwasta,
      totalPemerintah: grandPns + grandPpnpn,
      totalNonPemerintah: grandBumn + grandSwasta,
      totalBelumBekerja: grandBelumBekerja,
      totalBekerja: grandBekerja,
      totalLulusan: grandLulusan,
      pctAbsorption: grandPct,
    },
  };
}

// -------------------------------------------------------------
// 1. Program Studi (Prodi) Management
// -------------------------------------------------------------
router.get('/prodis', async (req, res) => {
  try {
    let uptId = req.user.uptId;
    if ((isSuperAdmin(req.user) || isPusbang(req.user)) && req.query.uptId) {
      uptId = req.query.uptId;
    }
    if (!uptId) return res.status(400).json({ error: 'UPT belum dipilih atau Anda belum tertaut ke UPT.' });
    if (isPusbang(req.user) && req.query.uptId) {
      const matraErr = await assertPusbangUptMatra(req.user, uptId);
      if (matraErr) return res.status(403).json({ error: matraErr });
    }

    const upt = await Upt.findByPk(uptId);
    if (!upt) return res.status(404).json({ error: 'UPT tidak ditemukan.' });

    const prodis = await ensureProdis(upt);
    res.json({ upt: { id: upt.id, name: upt.name, code: upt.code, matra: upt.matra }, prodis });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat data program studi.' });
  }
});

router.post('/prodis', async (req, res) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'Hanya Admin BPSDMP yang berwenang menambah Program Studi.' });
  }
  try {
    const targetUptId = req.body.uptId;
    if (!targetUptId) return res.status(400).json({ error: 'UPT wajib ditentukan.' });

    const targetUpt = await Upt.findByPk(targetUptId);
    if (!targetUpt) return res.status(404).json({ error: 'UPT tidak ditemukan.' });

    const { namaProdi, jenjang } = req.body;
    if (!namaProdi || !namaProdi.trim()) return res.status(400).json({ error: 'Nama Program Studi wajib diisi.' });

    const prodi = await Prodi.create({
      uptId: targetUptId,
      namaProdi: namaProdi.trim(),
      jenjang: jenjang || 'D4',
      matra: targetUpt.matra || 'laut',
      isActive: true,
    });
    audit(req, 'CREATE_PRODI', 'prodi', prodi.id, { nama: prodi.namaProdi });
    res.json({ message: 'Program Studi berhasil ditambahkan.', prodi });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menambahkan program studi.' });
  }
});

router.put('/prodis/:id', async (req, res) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'Hanya Admin BPSDMP yang berwenang mengubah Program Studi.' });
  }
  try {
    const prodi = await Prodi.findByPk(req.params.id);
    if (!prodi) return res.status(404).json({ error: 'Program Studi tidak ditemukan.' });

    const { namaProdi, jenjang, isActive } = req.body;
    if (namaProdi !== undefined && namaProdi.trim()) prodi.namaProdi = namaProdi.trim();
    if (jenjang !== undefined) prodi.jenjang = jenjang;
    if (isActive !== undefined) prodi.isActive = Boolean(isActive);

    await prodi.save();
    audit(req, 'UPDATE_PRODI', 'prodi', prodi.id, { nama: prodi.namaProdi });
    res.json({ message: 'Program Studi berhasil diperbarui.', prodi });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memperbarui program studi.' });
  }
});

router.delete('/prodis/:id', async (req, res) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'Hanya Admin BPSDMP yang berwenang menghapus Program Studi.' });
  }
  try {
    const prodi = await Prodi.findByPk(req.params.id);
    if (!prodi) return res.status(404).json({ error: 'Program Studi tidak ditemukan.' });

    // Cek apakah prodi sudah memiliki data serap
    const count = await GradAbsorption.count({ where: { prodiId: prodi.id } });
    const prodiName = prodi.namaProdi;
    if (count > 0) {
      // Soft-delete (non-aktifkan)
      prodi.isActive = false;
      await prodi.save();
      audit(req, 'DEACTIVATE_PRODI', 'prodi', prodi.id, { nama: prodiName });
      return res.json({ message: 'Program Studi dinonaktifkan karena sudah memiliki data riwayat penyerapan.' });
    }
    await prodi.destroy();
    audit(req, 'DELETE_PRODI', 'prodi', req.params.id, { nama: prodiName });
    res.json({ message: 'Program Studi berhasil dihapus.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus program studi.' });
  }
});

// -------------------------------------------------------------
// 1b. Master Data Taruna (Nama & Nomor Taruna per UPT)
// -------------------------------------------------------------
/** Resolve target UPT id for taruna operations (supports admin override) */
function resolveTarunaUptId(req) {
  if ((isSuperAdmin(req.user) || isPusbang(req.user)) && req.query.uptId) {
    return req.query.uptId;
  }
  if ((isSuperAdmin(req.user) || isPusbang(req.user)) && req.body && req.body.uptId) {
    return req.body.uptId;
  }
  return req.user.uptId;
}

/** Tolak override UPT lintas matra untuk Pusbang (read-only sekalipun). */
async function assertTarunaUptOverride(req, uptId) {
  const overrideId = (isSuperAdmin(req.user) || isPusbang(req.user))
    ? (req.query.uptId || (req.body && req.body.uptId) || null)
    : null;
  if (overrideId && isPusbang(req.user)) {
    const matraErr = await assertPusbangUptMatra(req.user, uptId);
    if (matraErr) return matraErr;
  }
  return null;
}

router.get('/tarunas', async (req, res) => {
  try {
    const uptId = resolveTarunaUptId(req);
    if (!uptId) return res.status(400).json({ error: 'UPT belum ditentukan.' });
    const overrideErr = await assertTarunaUptOverride(req, uptId);
    if (overrideErr) return res.status(403).json({ error: overrideErr });

    const { prodiId, search, year, quarter } = req.query;
    const numYear = Number(year) || new Date().getFullYear();
    const isAllQuarters = quarter === 'all' || !quarter || Number(quarter) === 0;
    const numQuarter = isAllQuarters ? 'all' : Number(quarter);

    const where = { uptId, isActive: true };
    if (prodiId) where.prodiId = prodiId;
    if (search && search.trim()) {
      where[Op.or] = [
        { nama: { [Op.like]: `%${search.trim()}%` } },
        { nomorTaruna: { [Op.like]: `%${search.trim()}%` } },
      ];
    }

    const tarunas = await Taruna.findAll({
      where,
      include: [{ model: Prodi, as: 'prodi', attributes: ['id', 'namaProdi', 'jenjang'] }],
      order: [['nama', 'ASC']],
    });

    // Cari riwayat penyerapan untuk seluruh taruna UPT ini pada tahun berjalan
    // (taruna yang sudah tercatat bekerja di TW 1, TW 2, TW 3, TW 4)
    const absorptionRecords = await GradAbsorption.findAll({
      where: {
        uptId,
        year: numYear,
        kategoriSerap: { [Op.ne]: 'belum_bekerja' },
      },
      attributes: ['id', 'tarunaId', 'nimTaruna', 'namaTaruna', 'quarter', 'month', 'kategoriSerap', 'instansiBekerja'],
      order: [['quarter', 'ASC']],
    });

    const employedMap = new Map();
    for (const rec of absorptionRecords) {
      if (rec.tarunaId && !employedMap.has(rec.tarunaId)) {
        employedMap.set(rec.tarunaId, rec);
      }
      if (rec.nimTaruna && !employedMap.has(`nim:${rec.nimTaruna.trim()}`)) {
        employedMap.set(`nim:${rec.nimTaruna.trim()}`, rec);
      }
    }

    // Pasangkan employmentStatus pada setiap taruna
    const tarunasWithStatus = tarunas.map((t) => {
      const json = t.toJSON();
      const empRec = employedMap.get(t.id) || (t.nomorTaruna ? employedMap.get(`nim:${t.nomorTaruna.trim()}`) : null);
      if (empRec) {
        json.employmentStatus = {
          isEmployed: true,
          quarter: empRec.quarter,
          month: empRec.month || null,
          quarterName: QUARTER_NAMES[empRec.quarter] || `Triwulan ${empRec.quarter}`,
          periodName: empRec.month ? `Bulan ${MONTH_NAMES[Number(empRec.month) - 1]}` : (QUARTER_NAMES[empRec.quarter] || `Triwulan ${empRec.quarter}`),
          kategoriSerap: empRec.kategoriSerap,
          instansiBekerja: empRec.instansiBekerja,
        };
      } else {
        json.employmentStatus = {
          isEmployed: false,
        };
      }
      return json;
    });

    // Master Data Taruna berlaku untuk SATU TAHUN (tahunan).
    // Status submission tahunan ini berlaku sama di semua triwulan (TW 1 - TW 4) maupun Semua Triwulan.
    const submission = await TarunaSubmission.findOne({
      where: { uptId, year: numYear },
      order: [['updatedAt', 'DESC']],
    });

    // Cek apakah ada permohonan unlock data taruna yang sedang aktif diproses
    const activeUnlock = await UnlockRequest.findOne({
      where: {
        uptId,
        year: numYear,
        type: 'taruna',
        status: { [Op.in]: ['pending_pimpinan', 'pending_pusbang', 'pending_bpsdmp'] },
      },
      order: [['createdAt', 'DESC']],
    });

    const totalEmployed = tarunasWithStatus.filter((t) => t.employmentStatus?.isEmployed).length;
    const totalUnemployed = tarunasWithStatus.length - totalEmployed;

    res.json({
      tarunas: tarunasWithStatus,
      submission: submission ? submission.toJSON() : null,
      activeUnlockRequest: activeUnlock ? activeUnlock.toJSON() : null,
      summary: {
        total: tarunasWithStatus.length,
        employed: totalEmployed,
        unemployed: totalUnemployed,
      },
      quarter: numQuarter,
      isAllQuarters,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data taruna.' });
  }
});

/** Daftar taruna yang tersedia untuk dipilih di laporan penyerapan TW berjalan.
 *  Taruna yang SUDAH bekerja di TW sebelumnya ditandai isAlreadyEmployed = true */
router.get('/tarunas/available', requireUptAdmin, async (req, res) => {
  try {
    const uptId = req.user.uptId;
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = isValidMonth(req.query.month) ? Number(req.query.month) : null;
    const quarter = month ? quarterOfMonth(month) : (Number(req.query.quarter) || 1);
    const periodLabel = month ? `Bulan ${MONTH_NAMES[month - 1]}` : `Triwulan ${quarter}`;
    const { prodiId, search } = req.query;

    // 1. Status approval Master Data Taruna tahunan (berlaku untuk semua TW di tahun ini)
    const submission = await TarunaSubmission.findOne({
      where: { uptId, year },
      order: [['updatedAt', 'DESC']],
    });
    const isApproved = Boolean(submission && submission.status === 'approved_admin');

    // 2. Ambil semua taruna aktif UPT
    const where = { uptId, isActive: true };
    if (prodiId) where.prodiId = prodiId;
    if (search && search.trim()) {
      where[Op.or] = [
        { nama: { [Op.like]: `%${search.trim()}%` } },
        { nomorTaruna: { [Op.like]: `%${search.trim()}%` } },
      ];
    }
    const tarunas = await Taruna.findAll({
      where,
      include: [{ model: Prodi, as: 'prodi', attributes: ['id', 'namaProdi', 'jenjang'] }],
      order: [['nama', 'ASC']],
    });

    // 3. Ambil seluruh record penyerapan tahun berjalan UPT ini
    const yearRecords = await GradAbsorption.findAll({
      where: { uptId, year },
      attributes: ['id', 'tarunaId', 'nimTaruna', 'namaTaruna', 'quarter', 'month', 'kategoriSerap', 'instansiBekerja'],
    });

    const inCurrentQuarterMap = new Map();
    const previouslyEmployedMap = new Map();

    const samePeriod = (r) => month
      ? (Number(r.month) === month || (r.month == null && Number(r.quarter) === quarter))
      : (Number(r.quarter) === quarter);
    const isPrevPeriodEmployed = (r) => {
      if (r.kategoriSerap === 'belum_bekerja') return false;
      if (month) {
        return r.month != null ? Number(r.month) < month : Number(r.quarter) < quarter;
      }
      return Number(r.quarter) < quarter;
    };
    const recordPeriodName = (r) => (r.month ? `Bulan ${MONTH_NAMES[Number(r.month) - 1]}` : (QUARTER_NAMES[r.quarter] || `Triwulan ${r.quarter}`));

    for (const r of yearRecords) {
      if (samePeriod(r)) {
        // Sudah tercatat pada periode berjalan ini
        if (r.tarunaId) inCurrentQuarterMap.set(r.tarunaId, r);
        if (r.nimTaruna) inCurrentQuarterMap.set(`nim:${r.nimTaruna.trim()}`, r);
        if (r.namaTaruna) inCurrentQuarterMap.set(`nama:${r.namaTaruna.trim().toLowerCase()}`, r);
      } else if (isPrevPeriodEmployed(r)) {
        // Sudah bekerja pada periode sebelumnya
        if (r.tarunaId && !previouslyEmployedMap.has(r.tarunaId)) previouslyEmployedMap.set(r.tarunaId, r);
        if (r.nimTaruna && !previouslyEmployedMap.has(`nim:${r.nimTaruna.trim()}`)) previouslyEmployedMap.set(`nim:${r.nimTaruna.trim()}`, r);
        if (r.namaTaruna && !previouslyEmployedMap.has(`nama:${r.namaTaruna.trim().toLowerCase()}`)) previouslyEmployedMap.set(`nama:${r.namaTaruna.trim().toLowerCase()}`, r);
      }
    }

    // 4. Tandai status ketersediaan taruna untuk dipilih
    const listWithEmployment = tarunas.map((t) => {
      const json = t.toJSON();
      const inCurrent = inCurrentQuarterMap.get(t.id) || (t.nomorTaruna ? inCurrentQuarterMap.get(`nim:${t.nomorTaruna.trim()}`) : null) || (t.nama ? inCurrentQuarterMap.get(`nama:${t.nama.trim().toLowerCase()}`) : null);
      const prevEmp = previouslyEmployedMap.get(t.id) || (t.nomorTaruna ? previouslyEmployedMap.get(`nim:${t.nomorTaruna.trim()}`) : null) || (t.nama ? previouslyEmployedMap.get(`nama:${t.nama.trim().toLowerCase()}`) : null);

      if (inCurrent) {
        json.cannotSelect = true;
        json.isAlreadyInQuarter = true;
        json.isAlreadyEmployed = true;
        json.employedQuarter = inCurrent.quarter;
        json.employedMonth = inCurrent.month || null;
        json.employedInstansi = inCurrent.instansiBekerja;
        json.disableReason = `Sudah diinput pada laporan ${periodLabel} ini`;
      } else if (prevEmp) {
        json.cannotSelect = true;
        json.isAlreadyInQuarter = false;
        json.isAlreadyEmployed = true;
        json.employedQuarter = prevEmp.quarter;
        json.employedMonth = prevEmp.month || null;
        json.employedQuarterName = recordPeriodName(prevEmp);
        json.employedKategori = prevEmp.kategoriSerap;
        json.employedInstansi = prevEmp.instansiBekerja;
        json.disableReason = `Sudah Bekerja di ${recordPeriodName(prevEmp)} (${prevEmp.instansiBekerja || 'Terserap'})`;
      } else {
        json.cannotSelect = false;
        json.isAlreadyInQuarter = false;
        json.isAlreadyEmployed = false;
        json.disableReason = null;
      }
      return json;
    });

    const available = listWithEmployment.filter((t) => !t.cannotSelect);

    res.json({
      tarunas: listWithEmployment,
      availableTarunas: available,
      excludedCount: listWithEmployment.length - available.length,
      isApproved,
      submissionStatus: submission ? submission.status : 'draft',
      month,
      quarter,
      periodLabel,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil daftar taruna tersedia.' });
  }
});

router.post('/tarunas', requireUptAdmin, async (req, res) => {
  try {
    const uptId = req.user.uptId;
    if (!uptId) return res.status(400).json({ error: 'Akun belum tertaut ke UPT.' });

    const { nama, nomorTaruna, prodiId, tahunLulus } = req.body;
    if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama taruna wajib diisi.' });
    if (!nomorTaruna || !nomorTaruna.trim()) return res.status(400).json({ error: 'Nomor taruna wajib diisi.' });

    // Cek submission status: jika sudah approved_admin / submitted, tolak penambahan
    const year = Number(req.body.year) || new Date().getFullYear();
    const submission = await TarunaSubmission.findOne({
      where: { uptId, year },
      order: [['updatedAt', 'DESC']],
    });
    if (submission && ['submitted_pimpinan', 'submitted_admin', 'approved_admin'].includes(submission.status)) {
      return res.status(400).json({
        error: 'Master Data Taruna tahun ini sudah dikirim/disetujui (Terkunci). Ajukan Unlock terlebih dahulu untuk melakukan penambahan data.',
        code: 'TARUNA_LOCKED',
      });
    }

    // Validasi nomor taruna unik per UPT
    const existing = await Taruna.findOne({ where: { uptId, nomorTaruna: nomorTaruna.trim() } });
    if (existing) {
      return res.status(400).json({ error: `Nomor Taruna "${nomorTaruna.trim()}" sudah terdaftar di UPT Anda.` });
    }

    const taruna = await Taruna.create({
      uptId,
      prodiId: prodiId || null,
      nama: nama.trim(),
      nomorTaruna: nomorTaruna.trim(),
      tahunLulus: tahunLulus ? Number(tahunLulus) : null,
      isActive: true,
    });

    audit(req, 'CREATE_TARUNA', 'taruna', taruna.id, { nama: taruna.nama });
    res.json({ message: 'Data taruna berhasil ditambahkan.', taruna });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menambahkan data taruna.' });
  }
});

router.post('/tarunas/bulk', requireUptAdmin, async (req, res) => {
  try {
    const uptId = req.user.uptId;
    const { items, year, quarter } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Daftar taruna tidak boleh kosong.' });
    }

    const numYear = Number(year) || new Date().getFullYear();
    const submission = await TarunaSubmission.findOne({
      where: { uptId, year: numYear },
      order: [['updatedAt', 'DESC']],
    });
    if (submission && ['submitted_pimpinan', 'submitted_admin', 'approved_admin'].includes(submission.status)) {
      return res.status(400).json({ error: 'Master Data Taruna tahun ini sudah dikirim/disetujui (Terkunci). Ajukan Unlock terlebih dahulu.', code: 'TARUNA_LOCKED' });
    }

    const created = [];
    const errors = [];
    for (const item of items) {
      if (!item.nama || !item.nomorTaruna) {
        errors.push({ item, reason: 'Nama & Nomor Taruna wajib diisi.' });
        continue;
      }
      const existing = await Taruna.findOne({ where: { uptId, nomorTaruna: String(item.nomorTaruna).trim() } });
      if (existing) {
        errors.push({ item, reason: `Nomor ${item.nomorTaruna} sudah terdaftar.` });
        continue;
      }
      const t = await Taruna.create({
        uptId,
        prodiId: item.prodiId || null,
        nama: String(item.nama).trim(),
        nomorTaruna: String(item.nomorTaruna).trim(),
        tahunLulus: item.tahunLulus ? Number(item.tahunLulus) : null,
        isActive: true,
      });
      created.push(t);
    }

    audit(req, 'BULK_TARUNA', 'taruna', null, { year: numYear, created: created.length, skipped: errors.length });
    res.json({
      message: `${created.length} taruna berhasil ditambahkan.`,
      createdCount: created.length,
      skipped: errors.length,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menambahkan data taruna massal.' });
  }
});

router.put('/tarunas/:id', requireUptAdmin, async (req, res) => {
  try {
    const uptId = req.user.uptId;
    const taruna = await Taruna.findOne({ where: { id: req.params.id, uptId } });
    if (!taruna) return res.status(404).json({ error: 'Data taruna tidak ditemukan.' });

    const year = Number(req.body.year) || new Date().getFullYear();
    const submission = await TarunaSubmission.findOne({
      where: { uptId, year },
      order: [['updatedAt', 'DESC']],
    });
    if (submission && ['submitted_pimpinan', 'submitted_admin', 'approved_admin'].includes(submission.status)) {
      return res.status(400).json({ error: 'Master Data Taruna tahun ini terkunci. Ajukan Unlock terlebih dahulu untuk mengubah data.', code: 'TARUNA_LOCKED' });
    }

    const { nama, nomorTaruna, prodiId, tahunLulus, isActive } = req.body;
    if (nama && nama.trim()) taruna.nama = nama.trim();
    if (nomorTaruna !== undefined && nomorTaruna.trim()) {
      // cek unik
      const duplicate = await Taruna.findOne({
        where: { uptId, nomorTaruna: nomorTaruna.trim(), id: { [Op.ne]: taruna.id } },
      });
      if (duplicate) return res.status(400).json({ error: `Nomor Taruna "${nomorTaruna.trim()}" sudah dipakai taruna lain.` });
      taruna.nomorTaruna = nomorTaruna.trim();
    }
    if (prodiId !== undefined) taruna.prodiId = prodiId || null;
    if (tahunLulus !== undefined) taruna.tahunLulus = tahunLulus ? Number(tahunLulus) : null;
    if (isActive !== undefined) taruna.isActive = Boolean(isActive);

    await taruna.save();
    audit(req, 'UPDATE_TARUNA', 'taruna', taruna.id, { nama: taruna.nama });
    res.json({ message: 'Data taruna berhasil diperbarui.', taruna });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memperbarui data taruna.' });
  }
});

router.delete('/tarunas/:id', requireUptAdmin, async (req, res) => {
  try {
    const uptId = req.user.uptId;
    const taruna = await Taruna.findOne({ where: { id: req.params.id, uptId } });
    if (!taruna) return res.status(404).json({ error: 'Data taruna tidak ditemukan.' });

    const usedCount = await GradAbsorption.count({ where: { tarunaId: taruna.id } });
    const delName = taruna.nama;
    if (usedCount > 0) {
      taruna.isActive = false;
      await taruna.save();
      audit(req, 'DEACTIVATE_TARUNA', 'taruna', taruna.id, { nama: delName });
      return res.json({ message: 'Taruna dinonaktifkan karena sudah memiliki riwayat data penyerapan.' });
    }
    await taruna.destroy();
    audit(req, 'DELETE_TARUNA', 'taruna', req.params.id, { nama: delName });
    res.json({ message: 'Data taruna berhasil dihapus.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus data taruna.' });
  }
});

// -------------------------------------------------------------
// 1c. Workflow Approval Data Taruna (UPT → Pimpinan → Admin BPSDM)
// -------------------------------------------------------------
/** Status submission data taruna per TW */
router.get('/taruna-submissions/status', requireUptAdmin, async (req, res) => {
  try {
    const uptId = req.user.uptId;
    const year = Number(req.query.year) || new Date().getFullYear();

    // Master Data Taruna berlaku tahunan: status berlaku sama di semua triwulan
    const submission = await TarunaSubmission.findOne({
      where: { uptId, year },
      order: [['updatedAt', 'DESC']],
    });

    const tarunaCount = await Taruna.count({ where: { uptId, isActive: true } });
    const isApproved = submission?.status === 'approved_admin';

    res.json({
      submission: submission ? submission.toJSON() : null,
      tarunaCount,
      canInputAbsorption: isApproved,
      isApproved,
      year,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil status data taruna.' });
  }
});

/** Kirim data taruna ke Pimpinan UPT */
router.post('/taruna-submissions/submit', requireUptAdmin, async (req, res) => {
  try {
    const uptId = req.user.uptId;
    const year = Number(req.body.year) || new Date().getFullYear();

    const tarunaCount = await Taruna.count({ where: { uptId, isActive: true } });
    if (tarunaCount === 0) {
      return res.status(400).json({ error: 'Belum ada data taruna yang diinput. Tambahkan minimal 1 taruna.' });
    }

    let submission = await TarunaSubmission.findOne({
      where: { uptId, year },
      order: [['updatedAt', 'DESC']],
    });

    if (!submission) {
      submission = await TarunaSubmission.create({
        uptId,
        year,
        quarter: 1, // pengajuan master awal tahun
        status: 'draft',
      });
    }

    if (['submitted_pimpinan', 'submitted_admin', 'approved_admin'].includes(submission.status)) {
      return res.status(400).json({ error: 'Master Data Taruna tahun ini sudah dikirim atau telah disetujui.' });
    }

    submission.status = 'submitted_pimpinan';
    submission.submittedAt = new Date();
    submission.notes = null;
    await submission.save();

    const uptDoc = await Upt.findByPk(uptId);
    notifier.notifyTarunaSubmit({ upt: uptDoc || { id: uptId }, year, user: req.user });

    audit(req, 'SUBMIT_TARUNA', 'taruna', submission.id, { year });
    res.json({ message: 'Master Data Taruna tahun ini berhasil dikirim ke Pimpinan UPT untuk diverifikasi.', submission });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengirim data taruna ke Pimpinan.' });
  }
});

/** Inbox Pimpinan: pengajuan data taruna menunggu verifikasi */
router.get('/taruna-submissions/pimpinan/inbox', requirePimpinan, async (req, res) => {
  try {
    const uptId = req.user.uptId;
    if (!uptId) return res.status(400).json({ error: 'Akun Pimpinan belum ditautkan ke UPT.' });
    const year = Number(req.query.year) || new Date().getFullYear();

    const submissions = await TarunaSubmission.findAll({
      where: { uptId, year },
      order: [['quarter', 'ASC']],
    });

    const results = [];
    for (const sub of submissions) {
      const tarunas = await Taruna.findAll({
        where: { uptId, isActive: true },
        include: [{ model: Prodi, as: 'prodi', attributes: ['id', 'namaProdi', 'jenjang'] }],
        order: [['nama', 'ASC']],
      });
      results.push({
        ...sub.toJSON(),
        quarterName: QUARTER_NAMES[sub.quarter] || `Triwulan ${sub.quarter}`,
        tarunaCount: tarunas.length,
        tarunas,
      });
    }

    // Cek apakah ada permohonan unlock data taruna yang menunggu review pimpinan
    const pendingUnlock = await UnlockRequest.findOne({
      where: {
        uptId,
        year,
        type: 'taruna',
        status: 'pending_pimpinan',
      },
      order: [['createdAt', 'DESC']],
    });

    res.json({
      year,
      submissions: results,
      pendingUnlockRequest: pendingUnlock ? pendingUnlock.toJSON() : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil inbox data taruna Pimpinan.' });
  }
});

/** Review Pimpinan: approve → teruskan ke Admin BPSDM; reject → kembali ke UPT */
router.post('/taruna-submissions/pimpinan/review', requirePimpinan, async (req, res) => {
  try {
    const { submissionId, action, notes } = req.body;
    if (!submissionId || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Parameter aksi review tidak valid.' });
    }

    const uptId = req.user.uptId;
    const sub = await TarunaSubmission.findOne({ where: { id: submissionId, uptId } });
    if (!sub) return res.status(404).json({ error: 'Pengajuan data taruna tidak ditemukan.' });
    if (sub.status !== 'submitted_pimpinan') {
      return res.status(400).json({ error: 'Pengajuan tidak dalam status menunggu verifikasi Pimpinan.' });
    }

    if (action === 'approve') {
      sub.status = 'submitted_admin';
      sub.approvedPimpinanAt = new Date();
      sub.notes = notes || null;
    } else {
      sub.status = 'rejected_pimpinan';
      sub.rejectedAt = new Date();
      sub.notes = notes || 'Ditolak oleh Pimpinan UPT untuk diperbaiki.';
    }
    await sub.save();

    const uptDoc = await Upt.findByPk(sub.uptId);
    notifier.notifyTarunaPimpinanReview({ upt: uptDoc || { id: sub.uptId }, year: sub.year, action, notes, user: req.user });

    audit(req, action === 'approve' ? 'APPROVE_TARUNA_PIMPINAN' : 'REJECT_TARUNA', 'taruna', sub.id, { year: sub.year });
    res.json({
      message: action === 'approve'
        ? 'Data Taruna disetujui Pimpinan dan diteruskan ke Admin BPSDM.'
        : 'Data Taruna dikembalikan ke Admin UPT untuk revisi.',
      submission: sub,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memproses review data taruna.' });
  }
});

/** Inbox Admin BPSDM: data taruna yang sudah disetujui Pimpinan */
router.get('/taruna-submissions/admin/inbox', async (req, res) => {
  if (!isSuperAdmin(req.user) && !isPusbang(req.user)) {
    return res.status(403).json({ error: 'Akses khusus Admin BPSDM / Pusbang.' });
  }
  try {
    const year = Number(req.query.year) || new Date().getFullYear();

    let whereUpt = { isActive: true };
    if (isPusbang(req.user)) {
      whereUpt.matra = (req.user.pusbangMatra || '').toLowerCase();
    }
    const upts = await Upt.findAll({ where: whereUpt });
    const uptIds = upts.map((u) => u.id);

    const whereSub = { uptId: { [Op.in]: uptIds }, year };
    if (req.query.all !== 'true') {
      whereSub.status = 'submitted_admin';
    }
    const submissions = await TarunaSubmission.findAll({
      where: whereSub,
      order: [['updatedAt', 'DESC']],
    });

    const results = [];
    for (const sub of submissions) {
      const upt = upts.find((u) => u.id === sub.uptId);
      const tarunaCount = await Taruna.count({ where: { uptId: sub.uptId, isActive: true } });
      results.push({
        ...sub.toJSON(),
        quarterName: QUARTER_NAMES[sub.quarter] || `Triwulan ${sub.quarter}`,
        uptName: upt?.name || '-',
        uptCode: upt?.code || '-',
        matra: upt?.matra || '-',
        tarunaCount,
      });
    }

    res.json({ year, submissions: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil inbox data taruna Admin.' });
  }
});

/** Detail taruna untuk review Admin BPSDM */
router.get(['/taruna-submissions/admin/detail/:submissionId', '/taruna-submissions/admin/:submissionId/detail'], async (req, res) => {
  if (!isSuperAdmin(req.user) && !isPusbang(req.user)) {
    return res.status(403).json({ error: 'Akses khusus Admin BPSDM / Pusbang.' });
  }
  try {
    const sub = await TarunaSubmission.findByPk(req.params.submissionId);
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });

    const upt = await Upt.findByPk(sub.uptId);
    const tarunas = await Taruna.findAll({
      where: { uptId: sub.uptId, isActive: true },
      include: [{ model: Prodi, as: 'prodi', attributes: ['id', 'namaProdi', 'jenjang'] }],
      order: [['nama', 'ASC']],
    });

    res.json({
      submission: sub.toJSON(),
      upt: upt ? { id: upt.id, name: upt.name, code: upt.code, matra: upt.matra } : null,
      tarunas,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil detail data taruna.' });
  }
});

/** Pusbang hanya boleh memproses UPT matra-nya sendiri (baca/tulis). */
async function assertPusbangUptMatra(user, uptId) {
  if (!isPusbang(user)) return null;
  const matra = (user.pusbangMatra || '').toLowerCase();
  const upt = await Upt.findByPk(uptId);
  if (!upt || (upt.matra || '').toLowerCase() !== matra) {
    return 'Anda hanya dapat memproses UPT matra Anda sendiri.';
  }
  return null;
}

/** Review Admin BPSDM: approve final (locked) / reject */
router.post('/taruna-submissions/admin/review', async (req, res) => {
  if (!isSuperAdmin(req.user) && !isPusbang(req.user)) {
    return res.status(403).json({ error: 'Akses khusus Admin BPSDM / Pusbang.' });
  }
  try {
    const { submissionId, action, notes } = req.body;
    if (!submissionId || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Parameter aksi review tidak valid.' });
    }

    const sub = await TarunaSubmission.findByPk(submissionId);
    if (!sub) return res.status(404).json({ error: 'Pengajuan data taruna tidak ditemukan.' });
    const matraErr = await assertPusbangUptMatra(req.user, sub.uptId);
    if (matraErr) return res.status(403).json({ error: matraErr });
    if (sub.status !== 'submitted_admin') {
      return res.status(400).json({ error: 'Pengajuan tidak dalam status menunggu persetujuan Admin.' });
    }

    if (action === 'approve') {
      sub.status = 'approved_admin';
      sub.approvedAdminAt = new Date();
      sub.lockedAt = new Date();
      sub.notes = notes || null;
    } else {
      sub.status = 'rejected_admin';
      sub.rejectedAt = new Date();
      sub.notes = notes || 'Ditolak oleh Admin BPSDM untuk diperbaiki.';
    }
    await sub.save();

    const uptDoc = await Upt.findByPk(sub.uptId);
    notifier.notifyTarunaAdminReview({ upt: uptDoc || { id: sub.uptId }, year: sub.year, action, notes, user: req.user });

    audit(req, action === 'approve' ? 'APPROVE_TARUNA_BPSDMP' : 'REJECT_TARUNA', 'taruna', sub.id, { year: sub.year });
    res.json({
      message: action === 'approve'
        ? 'Data Taruna telah disetujui & dikunci. Admin UPT kini dapat mengisi laporan penyerapan.'
        : 'Data Taruna dikembalikan ke Admin UPT untuk revisi.',
      submission: sub,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memproses persetujuan data taruna.' });
  }
});

/** Ajukan unlock data taruna (jika sudah approved & perlu perubahan) */
router.post('/taruna-submissions/unlock-request', requireUptAdmin, async (req, res) => {
  try {
    const uptId = req.user.uptId;
    const year = Number(req.body.year) || new Date().getFullYear();
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Alasan pengajuan unlock wajib diisi.' });
    }

    const submission = await TarunaSubmission.findOne({
      where: { uptId, year },
      order: [['updatedAt', 'DESC']],
    });
    if (!submission || submission.status !== 'approved_admin') {
      return res.status(400).json({ error: 'Unlock hanya untuk Master Data Taruna yang sudah disetujui Admin BPSDM.' });
    }

    const existing = await UnlockRequest.findOne({
      where: {
        uptId,
        year,
        type: 'taruna',
        status: { [Op.in]: ['pending_pimpinan', 'pending_pusbang', 'pending_bpsdmp'] },
      },
    });
    if (existing) {
      return res.status(400).json({ error: 'Sudah ada permohonan unlock Master Data Taruna yang sedang diproses.' });
    }

    const uptDoc = await Upt.findByPk(uptId);
    if (!uptDoc) return res.status(404).json({ error: 'UPT tidak ditemukan.' });

    const request = await UnlockRequest.create({
      uptId,
      uptCode: uptDoc.code || '-',
      uptName: uptDoc.name || '-',
      matra: uptDoc.matra || '',
      uptType: uptDoc.uptType || 'taruna',
      type: 'taruna',
      year,
      month: 1, // mewakili tahunan
      reason: reason.trim(),
      status: 'pending_pimpinan',
      requestedBy: req.user.id,
      requestedByName: req.user.name || req.user.email,
      requestedAt: new Date(),
      trail: [{
        role: req.user.role,
        uid: req.user.id,
        name: req.user.name || req.user.email,
        decision: 'submitted',
        note: reason.trim(),
        at: new Date().toISOString(),
      }],
    });

    await notifier.notifyUnlockRequestSubmit({
      doc: request,
      upt: uptDoc,
      year,
      month: 1,
      type: 'taruna',
      reason: reason.trim(),
      user: req.user,
    });

    audit(req, 'REQUEST_UNLOCK', 'taruna', request.id, { year });
    res.json({ message: 'Pengajuan unlock Data Taruna berhasil dikirim ke Pimpinan UPT.', request });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengajukan unlock data taruna.' });
  }
});

// -------------------------------------------------------------
// 2. Data Penyerapan UPT (My Data / Kelola Penyerapan)
// -------------------------------------------------------------
router.get('/my', async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  // Mode bulanan (baru): ?month=1..12. Mode triwulan (legacy) & semua dipertahankan untuk kompatibilitas.
  const rawM = req.query.month;
  const month = isValidMonth(rawM) ? Number(rawM) : null;
  const rawQ = req.query.quarter;
  const isAllQuarters = !month && (rawQ === 'all' || !rawQ || Number(rawQ) === 0);
  const quarter = month ? quarterOfMonth(month) : (isAllQuarters ? 'all' : Number(rawQ));

  try {
    let uptId = req.user.uptId;
    if ((isSuperAdmin(req.user) || isPusbang(req.user)) && req.query.uptId) {
      uptId = req.query.uptId;
    }
    if (!uptId) return res.status(400).json({ error: 'Akun Anda belum ditautkan ke UPT atau UPT belum dipilih.' });
    if (isPusbang(req.user) && req.query.uptId) {
      const matraErr = await assertPusbangUptMatra(req.user, uptId);
      if (matraErr) return res.status(403).json({ error: matraErr });
    }

    const upt = await Upt.findByPk(uptId);
    if (!upt) return res.status(404).json({ error: 'UPT tidak ditemukan.' });

    const prodis = await ensureProdis(upt);
    const prodisJson = prodis.map((p) => p.toJSON());

    if (isAllQuarters) {
      // Ambil seluruh entri lulusan untuk tahun ini
      const allRecords = await GradAbsorption.findAll({
        where: { uptId, year },
        include: [{ model: Prodi, as: 'prodi', attributes: ['id', 'namaProdi', 'jenjang'] }],
        order: [['createdAt', 'ASC']],
      });
      const allRecordsJson = allRecords.map((r) => r.toJSON());

      // Matrix per Triwulan (1 s/d 4, kompatibilitas data lama)
      const quartersData = {};
      for (let q = 1; q <= 4; q++) {
        const qRecs = allRecordsJson.filter((r) => Number(r.quarter) === q);
        quartersData[q] = formatAbsorptionMatrix(prodisJson, qRecs);
      }

      // Matrix per Bulan (1 s/d 12, mode bulanan).
      // Data era triwulan (month NULL) dipetakan ke bulan AKHIR triwulannya (TW q -> bulan q*3)
      // agar tetap tampil di matriks; tiap record tepat di satu ember bulan (tidak ganda).
      const monthsData = {};
      for (let m = 1; m <= 12; m++) {
        const mRecs = allRecordsJson.filter(
          (r) => Number(r.month) === m || (r.month == null && Number(r.quarter) * 3 === m)
        );
        monthsData[m] = formatAbsorptionMatrix(prodisJson, mRecs);
      }

      // Matrix Kumulatif Tahunan
      const cumulative = formatAbsorptionMatrix(prodisJson, allRecordsJson);

      // Ambil submissions status untuk semua periode
      const submissions = await AbsorptionSubmission.findAll({ where: { uptId, year } });

      return res.json({
        isAllQuarters: true,
        year,
        quarter: 'all',
        quarterName: 'Semua Triwulan (TW I - TW IV)',
        upt: { id: upt.id, name: upt.name, code: upt.code, matra: upt.matra },
        submissions: submissions.map((s) => withPeriodInfo(s.toJSON())),
        prodis,
        records: allRecords,
        quarters: quartersData,
        months: monthsData,
        matrix: cumulative.rows,
        summary: cumulative.summary,
      });
    }

    if (month) {
      // Single Month Mode (bulanan). Data era triwulan tampil pada bulan akhir triwulannya.
      let submission = await AbsorptionSubmission.findOne({
        where: { uptId, year, month },
      });
      if (!submission && month % 3 === 0) {
        // Fallback status pengajuan era triwulan untuk bulan akhir triwulan
        submission = await AbsorptionSubmission.findOne({
          where: { uptId, year, quarter: month / 3, month: null },
        });
      }

      const recordWhere = { uptId, year };
      if (month % 3 === 0) {
        recordWhere[Op.or] = [{ month }, { month: null, quarter: month / 3 }];
      } else {
        recordWhere.month = month;
      }
      const records = await GradAbsorption.findAll({
        where: recordWhere,
        include: [{ model: Prodi, as: 'prodi', attributes: ['id', 'namaProdi', 'jenjang'] }],
        order: [['createdAt', 'ASC']],
      });

      const matrix = formatAbsorptionMatrix(prodisJson, records.map((r) => r.toJSON()));

      return res.json({
        isAllQuarters: false,
        isMonthly: true,
        year,
        month,
        monthName: MONTH_NAMES[month - 1],
        monthShort: MONTH_SHORT[month - 1],
        quarter: quarterOfMonth(month),
        quarterName: QUARTER_NAMES[quarterOfMonth(month)],
        upt: { id: upt.id, name: upt.name, code: upt.code, matra: upt.matra },
        submission: submission
          ? withPeriodInfo(submission.toJSON())
          : { status: 'draft', submittedAt: null, approvedAt: null, notes: null, month, monthName: MONTH_NAMES[month - 1] },
        prodis,
        records,
        matrix: matrix.rows,
        summary: matrix.summary,
      });
    }

    // Single Quarter Mode (legacy triwulan)
    const submission = await AbsorptionSubmission.findOne({
      where: { uptId, year, quarter },
    });

    const records = await GradAbsorption.findAll({
      where: { uptId, year, quarter },
      include: [{ model: Prodi, as: 'prodi', attributes: ['id', 'namaProdi', 'jenjang'] }],
      order: [['createdAt', 'ASC']],
    });

    const matrix = formatAbsorptionMatrix(prodisJson, records.map((r) => r.toJSON()));

    res.json({
      isAllQuarters: false,
      year,
      quarter,
      quarterName: QUARTER_NAMES[quarter] || `Triwulan ${quarter}`,
      upt: { id: upt.id, name: upt.name, code: upt.code, matra: upt.matra },
      submission: submission ? withPeriodInfo(submission.toJSON()) : { status: 'draft', submittedAt: null, approvedAt: null, notes: null },
      prodis,
      records,
      matrix: matrix.rows,
      summary: matrix.summary,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data penyerapan lulusan.' });
  }
});

/** Riwayat input UPT: pengajuan Data Taruna + Laporan Penyerapan per tahun (untuk menu Riwayat Input). */
router.get('/upt-history', requireUpt, async (req, res) => {
  try {
    const uptId = req.user.uptId;
    if (!uptId) return res.status(400).json({ error: 'Akun belum tertaut ke UPT.' });
    const year = Number(req.query.year) || new Date().getFullYear();

    const tarunaSubs = await TarunaSubmission.findAll({
      where: { uptId, year },
      order: [['updatedAt', 'DESC']],
    });
    const activeTaruna = await Taruna.count({ where: { uptId, isActive: true } });

    const absSubs = await AbsorptionSubmission.findAll({
      where: { uptId, year },
      order: [['updatedAt', 'DESC']],
    });
    const penyerapan = [];
    for (const s of absSubs) {
      const sj = s.toJSON();
      const recWhere = sj.month
        ? { uptId, year, month: sj.month }
        : { uptId, year, quarter: sj.quarter };
      const recordsCount = await GradAbsorption.count({ where: recWhere });
      penyerapan.push({ ...withPeriodInfo(sj), recordsCount });
    }

    res.json({
      year,
      taruna: {
        submissions: tarunaSubs.map((s) => s.toJSON()),
        activeCount: activeTaruna,
      },
      penyerapan,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil riwayat penyerapan UPT.' });
  }
});

// Tambah / Bulk Upload Taruna Penyerapan (mendukung periode BULANAN; quarter = legacy)
router.post('/records', requireUptAdmin, async (req, res) => {
  const { year, quarter, month, records } = req.body;
  const numYear = Number(year) || new Date().getFullYear();
  const numMonth = isValidMonth(month) ? Number(month) : null;
  const numQuarter = numMonth ? quarterOfMonth(numMonth) : (Number(quarter) || 1);

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'Data taruna tidak boleh kosong.' });
  }

  try {
    const uptId = req.user.uptId;

    // GATE CHECK: Master Data Taruna tahun berjalan harus sudah approved_admin oleh Admin BPSDM.
    // (TarunaSubmission bersifat tahunan; gate berlaku sama untuk periode bulanan maupun triwulan.)
    const tarunaSubYear = await TarunaSubmission.findOne({
      where: { uptId, year: numYear },
      order: [['updatedAt', 'DESC']],
    });
    const isTarunaApproved = tarunaSubYear && tarunaSubYear.status === 'approved_admin';

    if (!isTarunaApproved) {
      return res.status(403).json({
        error: numMonth
          ? 'Anda belum dapat mengisi laporan penyerapan bulan ini. Silakan lengkapi & ajukan persetujuan Master Data Taruna terlebih dahulu.'
          : 'Anda belum dapat mengisi laporan penyerapan triwulan ini. Silakan lengkapi & ajukan persetujuan Master Data Taruna di awal tahun terlebih dahulu.',
        code: 'TARUNA_NOT_APPROVED',
      });
    }

    // Pastikan atau buat submission draf (per bulan bila mode bulanan)
    const subWhere = numMonth
      ? { uptId, year: numYear, month: numMonth }
      : { uptId, year: numYear, quarter: numQuarter };
    let [submission] = await AbsorptionSubmission.findOrCreate({
      where: subWhere,
      defaults: numMonth ? { status: 'draft', quarter: numQuarter } : { status: 'draft' },
    });

    if (submission.status === 'submitted_pimpinan') {
      return res.status(400).json({ error: 'Data penyerapan sedang dalam proses review Pimpinan UPT dan terkunci.' });
    }
    if (submission.status === 'approved_pimpinan') {
      return res.status(400).json({ error: 'Data penyerapan sudah disetujui Pimpinan UPT. Hubungi pimpinan jika perlu perbaikan.' });
    }

    // Ambil nomor taruna yang SUDAH diinput di periode berjalan dan yang SUDAH bekerja di periode sebelumnya.
    // Mode bulanan: periode berjalan = bulan tsb; data era triwulan (month NULL) pada triwulan yang sama
    // dianggap sudah tercatat di periode ini, dan yang triwulannya lebih awal dianggap periode sebelumnya.
    const periodWhere = numMonth ? { uptId, year: numYear, month: numMonth } : { uptId, year: numYear, quarter: numQuarter };
    const existingInQuarter = await GradAbsorption.findAll({
      where: periodWhere,
      attributes: ['id', 'tarunaId', 'nimTaruna', 'namaTaruna'],
    });
    const currentQuarterTarunaIds = new Set(existingInQuarter.map(r => r.tarunaId).filter(Boolean));
    const currentQuarterNims = new Set(existingInQuarter.map(r => (r.nimTaruna || '').trim()).filter(Boolean));
    const currentQuarterNames = new Set(existingInQuarter.map(r => (r.namaTaruna || '').trim().toLowerCase()).filter(Boolean));

    const prevEmployedIds = new Set();
    const prevEmployedNims = new Set();
    const prevEmployedNames = new Set();
    const prevEmployedLabels = new Map(); // kunci -> label periode ("Bulan X" / "Triwulan Y")
    const rememberPrev = (r, label) => {
      const idKey = r.tarunaId ? `id:${r.tarunaId}` : null;
      const nimKey = r.nimTaruna ? `nim:${r.nimTaruna.trim()}` : null;
      const nameKey = r.namaTaruna ? `nama:${r.namaTaruna.trim().toLowerCase()}` : null;
      if (idKey && !prevEmployedLabels.has(idKey)) prevEmployedLabels.set(idKey, label);
      if (nimKey && !prevEmployedLabels.has(nimKey)) prevEmployedLabels.set(nimKey, label);
      if (nameKey && !prevEmployedLabels.has(nameKey)) prevEmployedLabels.set(nameKey, label);
      if (r.tarunaId) prevEmployedIds.add(r.tarunaId);
      if (r.nimTaruna) prevEmployedNims.add(r.nimTaruna.trim());
      if (r.namaTaruna) prevEmployedNames.add(r.namaTaruna.trim().toLowerCase());
    };
    if (numMonth) {
      // Bulan-bulan sebelumnya tahun ini (data bulanan)
      const prevMonthRecords = await GradAbsorption.findAll({
        where: { uptId, year: numYear, month: { [Op.lt]: numMonth }, kategoriSerap: { [Op.ne]: 'belum_bekerja' } },
        attributes: ['tarunaId', 'nimTaruna', 'namaTaruna', 'month'],
      });
      for (const r of prevMonthRecords) rememberPrev(r, `Bulan ${MONTH_NAMES[Number(r.month) - 1]}`);
      // Data era triwulan: triwulan lampau (< TW berjalan) = periode sebelumnya;
      // triwulan yang sama berjalan = sudah tercatat di periode ini
      const legacyRows = await GradAbsorption.findAll({
        where: { uptId, year: numYear, month: null, quarter: { [Op.lte]: numQuarter } },
        attributes: ['tarunaId', 'nimTaruna', 'namaTaruna', 'quarter', 'kategoriSerap'],
      });
      for (const r of legacyRows) {
        if (r.kategoriSerap === 'belum_bekerja') continue;
        if (Number(r.quarter) < numQuarter) {
          rememberPrev(r, QUARTER_NAMES[r.quarter] || `Triwulan ${r.quarter}`);
        } else {
          // TW sama: anggap sudah tercatat di periode berjalan
          if (r.tarunaId) currentQuarterTarunaIds.add(r.tarunaId);
          if (r.nimTaruna) currentQuarterNims.add(r.nimTaruna.trim());
          if (r.namaTaruna) currentQuarterNames.add(r.namaTaruna.trim().toLowerCase());
        }
      }
    } else {
      const prevQuarters = [];
      for (let q = 1; q < numQuarter; q++) prevQuarters.push(q);
      if (prevQuarters.length > 0) {
        const prevRecords = await GradAbsorption.findAll({
          where: {
            uptId,
            year: numYear,
            quarter: { [Op.in]: prevQuarters },
            kategoriSerap: { [Op.ne]: 'belum_bekerja' },
          },
          attributes: ['tarunaId', 'nimTaruna', 'namaTaruna', 'quarter'],
        });
        for (const r of prevRecords) {
          rememberPrev(r, QUARTER_NAMES[r.quarter] || `Triwulan ${r.quarter}`);
        }
      }
    }
    const prevLabelOf = ({ tarunaId, nim, namaLower }) =>
      prevEmployedLabels.get(tarunaId ? `id:${tarunaId}` : '') ||
      prevEmployedLabels.get(nim ? `nim:${nim}` : '') ||
      prevEmployedLabels.get(namaLower ? `nama:${namaLower}` : '') || '';

    const createdList = [];
    for (const r of records) {
      if (!r.prodiId || !r.namaTaruna) continue;
      const nama = r.namaTaruna.trim();
      const namaLower = nama.toLowerCase();
      const nim = r.nimTaruna ? r.nimTaruna.trim() : null;
      const tarunaId = r.tarunaId || null;

      const periodLabel = numMonth ? `Bulan ${MONTH_NAMES[numMonth - 1]}` : `Triwulan ${numQuarter}`;
      // 1. Validasi duplikasi di periode ini
      if ((tarunaId && currentQuarterTarunaIds.has(tarunaId)) ||
          (nim && currentQuarterNims.has(nim)) ||
          currentQuarterNames.has(namaLower)) {
        return res.status(400).json({
          error: `Taruna "${nama}" sudah ada dalam laporan ${periodLabel} ini. Tidak dapat diinput ganda.`,
        });
      }

      // 2. Validasi sudah bekerja di periode sebelumnya
      if ((tarunaId && prevEmployedIds.has(tarunaId)) ||
          (nim && prevEmployedNims.has(nim)) ||
          prevEmployedNames.has(namaLower)) {
        const prevLabel = prevLabelOf({ tarunaId, nim, namaLower });
        return res.status(400).json({
          error: `Taruna "${nama}" sudah tercatat bekerja${prevLabel ? ` pada ${prevLabel}` : ' pada periode sebelumnya'} dan tidak dapat dipilih lagi.`,
        });
      }

      const created = await GradAbsorption.create({
        submissionId: submission.id,
        uptId,
        prodiId: r.prodiId,
        year: numYear,
        quarter: numQuarter,
        month: numMonth,
        tarunaId,
        namaTaruna: nama,
        nimTaruna: nim,
        tahunLulus: r.tahunLulus ? Number(r.tahunLulus) : numYear,
        kategoriSerap: r.kategoriSerap || 'belum_bekerja',
        instansiBekerja: r.kategoriSerap !== 'belum_bekerja' && r.instansiBekerja ? r.instansiBekerja.trim() : null,
        keterangan: r.keterangan ? r.keterangan.trim() : null,
      });

      if (tarunaId) currentQuarterTarunaIds.add(tarunaId);
      if (nim) currentQuarterNims.add(nim);
      currentQuarterNames.add(namaLower);

      createdList.push(created);
    }

    audit(req, 'SAVE_PENYERAPAN', 'penyerapan', submission.id, { year: numYear, month: numMonth, quarter: numQuarter, count: createdList.length });
    res.json({
      message: `Berhasil menambahkan ${createdList.length} data taruna.`,
      recordsCount: createdList.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menyimpan data penyerapan lulusan.' });
  }
});

// Update single record
router.put('/records/:id', requireUptAdmin, async (req, res) => {
  try {
    const uptId = req.user.uptId;
    const record = await GradAbsorption.findOne({ where: { id: req.params.id, uptId } });
    if (!record) return res.status(404).json({ error: 'Data taruna tidak ditemukan.' });

    // Check submission status (via submissionId bila ada, fallback periode)
    let submission = null;
    if (record.submissionId) {
      submission = await AbsorptionSubmission.findOne({ where: { id: record.submissionId, uptId } });
    }
    if (!submission) {
      const subWhere = record.month
        ? { uptId, year: record.year, month: record.month }
        : { uptId, year: record.year, quarter: record.quarter };
      submission = await AbsorptionSubmission.findOne({ where: subWhere });
    }
    if (submission && ['submitted_pimpinan', 'approved_pimpinan'].includes(submission.status)) {
      return res.status(400).json({ error: 'Data tidak dapat diubah karena sedang direview atau telah disetujui.' });
    }

    const { namaTaruna, nimTaruna, prodiId, kategoriSerap, instansiBekerja, keterangan } = req.body;
    if (namaTaruna) record.namaTaruna = namaTaruna.trim();
    if (nimTaruna !== undefined) record.nimTaruna = nimTaruna ? nimTaruna.trim() : null;
    if (prodiId) record.prodiId = prodiId;
    if (kategoriSerap) {
      record.kategoriSerap = kategoriSerap;
      record.instansiBekerja = kategoriSerap !== 'belum_bekerja' && instansiBekerja ? instansiBekerja.trim() : null;
    }
    if (keterangan !== undefined) record.keterangan = keterangan ? keterangan.trim() : null;

    await record.save();
    audit(req, 'UPDATE_PENYERAPAN', 'penyerapan', record.id, { nama: record.namaTaruna });
    res.json({ message: 'Data taruna berhasil diperbarui.', record });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memperbarui data taruna.' });
  }
});

// Delete single record
router.delete('/records/:id', requireUptAdmin, async (req, res) => {
  try {
    const uptId = req.user.uptId;
    const record = await GradAbsorption.findOne({ where: { id: req.params.id, uptId } });
    if (!record) return res.status(404).json({ error: 'Data taruna tidak ditemukan.' });

    let submission = null;
    if (record.submissionId) {
      submission = await AbsorptionSubmission.findOne({ where: { id: record.submissionId, uptId } });
    }
    if (!submission) {
      const subWhere = record.month
        ? { uptId, year: record.year, month: record.month }
        : { uptId, year: record.year, quarter: record.quarter };
      submission = await AbsorptionSubmission.findOne({ where: subWhere });
    }
    if (submission && ['submitted_pimpinan', 'approved_pimpinan'].includes(submission.status)) {
      return res.status(400).json({ error: 'Data tidak dapat dihapus karena sedang direview atau telah disetujui.' });
    }

    const delName = record.namaTaruna;
    await record.destroy();
    audit(req, 'DELETE_PENYERAPAN', 'penyerapan', req.params.id, { nama: delName });
    res.json({ message: 'Data taruna berhasil dihapus.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus data taruna.' });
  }
});

// Kirim data ke Pimpinan UPT (mendukung periode bulanan)
router.post('/submit', requireUptAdmin, async (req, res) => {
  const { year, quarter, month } = req.body;
  const numYear = Number(year) || new Date().getFullYear();
  const numMonth = isValidMonth(month) ? Number(month) : null;
  const numQuarter = numMonth ? quarterOfMonth(numMonth) : (Number(quarter) || 1);
  const periodLabel = numMonth ? `Bulan ${MONTH_NAMES[numMonth - 1]}` : `Triwulan ${numQuarter}`;

  try {
    const uptId = req.user.uptId;
    const countWhere = numMonth
      ? { uptId, year: numYear, month: numMonth }
      : { uptId, year: numYear, quarter: numQuarter };
    const count = await GradAbsorption.count({ where: countWhere });
    if (count === 0) {
      return res.status(400).json({ error: `Belum ada data penyerapan taruna yang diinput untuk ${periodLabel} ini.` });
    }

    const subWhere = numMonth
      ? { uptId, year: numYear, month: numMonth }
      : { uptId, year: numYear, quarter: numQuarter };
    let [submission] = await AbsorptionSubmission.findOrCreate({
      where: subWhere,
      defaults: numMonth ? { status: 'draft', quarter: numQuarter } : { status: 'draft' },
    });

    submission.status = 'submitted_pimpinan';
    submission.submittedAt = new Date();
    await submission.save();

    const uptDoc = await Upt.findByPk(uptId);
    notifier.notifyAbsorptionReportSubmit({ upt: uptDoc || { id: uptId }, year: numYear, quarter: numQuarter, month: numMonth, user: req.user });

    audit(req, 'SUBMIT_PENYERAPAN', 'penyerapan', submission.id, { year: numYear, month: numMonth, quarter: numQuarter });
    res.json({ message: `Laporan Penyerapan Lulusan ${periodLabel} berhasil dikirim ke Pimpinan UPT untuk disetujui.`, submission: withPeriodInfo(submission.toJSON()) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengirim laporan ke Pimpinan.' });
  }
});

// -------------------------------------------------------------
// 3. Approval Workflow Pimpinan UPT
// -------------------------------------------------------------
router.get('/pimpinan/inbox', requirePimpinan, async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  try {
    const uptId = req.user.uptId;
    if (!uptId) return res.status(400).json({ error: 'Akun Pimpinan belum ditautkan ke UPT.' });

    const submissions = await AbsorptionSubmission.findAll({
      where: { uptId, year },
      order: [['quarter', 'ASC']],
    });

    const results = [];
    for (const sub of submissions) {
      const sj = sub.toJSON();
      const recWhere = sj.month
        ? { uptId, year: sj.year, month: sj.month }
        : { uptId, year: sj.year, quarter: sj.quarter };
      const recordsCount = await GradAbsorption.count({ where: recWhere });
      results.push({
        ...withPeriodInfo(sj),
        recordsCount,
      });
    }

    res.json({ year, submissions: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil daftar pengajuan penyerapan.' });
  }
});

router.post('/pimpinan/review', requirePimpinan, async (req, res) => {
  const { submissionId, action, notes } = req.body;
  if (!submissionId || !['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Parameter aksi review tidak valid.' });
  }

  try {
    const uptId = req.user.uptId;
    const sub = await AbsorptionSubmission.findOne({ where: { id: submissionId, uptId } });
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });

    if (action === 'approve') {
      sub.status = 'approved_pimpinan';
      sub.approvedAt = new Date();
      sub.notes = notes || null;
    } else {
      sub.status = 'rejected_pimpinan';
      sub.rejectedAt = new Date();
      sub.notes = notes || 'Ditolak oleh Pimpinan UPT untuk diperbaiki.';
    }

    await sub.save();

    const uptDoc = await Upt.findByPk(uptId);
    notifier.notifyAbsorptionReportReview({ upt: uptDoc || { id: uptId }, year: sub.year, quarter: sub.quarter, month: sub.month || null, action, notes, user: req.user });

    audit(req, action === 'approve' ? 'APPROVE_PENYERAPAN_PIMPINAN' : 'REJECT_PENYERAPAN', 'penyerapan', sub.id, { year: sub.year, month: sub.month || null });
    res.json({
      message: action === 'approve' ? 'Laporan Penyerapan Lulusan berhasil disetujui.' : 'Laporan Penyerapan Lulusan dikembalikan untuk revisi.',
      submission: withPeriodInfo(sub.toJSON()),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memproses persetujuan penyerapan.' });
  }
});

// -------------------------------------------------------------
// 4. Monitoring & Laporan Nasional (Admin BPSDMP & Pusbang)
// -------------------------------------------------------------
router.get('/all', async (req, res) => {
  if (!isSuperAdmin(req.user) && !isPusbang(req.user)) {
    return res.status(403).json({ error: 'Akses khusus Super Admin BPSDMP atau Pusbang.' });
  }

  const year = Number(req.query.year) || new Date().getFullYear();
  const month = isValidMonth(req.query.month) ? Number(req.query.month) : null;
  const quarter = !month && req.query.quarter ? Number(req.query.quarter) : null;
  const uptId = req.query.uptId || null;

  try {
    let whereUpt = { isActive: true };
    if (isPusbang(req.user)) {
      const matra = (req.user.pusbangMatra || '').toLowerCase();
      whereUpt.matra = matra;
    }
    if (uptId) whereUpt.id = uptId;

    const upts = await Upt.findAll({ where: whereUpt, order: [['name', 'ASC']] });
    const uptIds = upts.map((u) => u.id);

    const whereRecord = { uptId: { [Op.in]: uptIds }, year };
    if (month) whereRecord.month = month;
    else if (quarter) whereRecord.quarter = quarter;

    const allRecords = await GradAbsorption.findAll({
      where: whereRecord,
      include: [{ model: Prodi, as: 'prodi', attributes: ['id', 'namaProdi', 'jenjang'] }],
    });

    const whereSub = { uptId: { [Op.in]: uptIds }, year };
    if (month) whereSub.month = month;
    else if (quarter) whereSub.quarter = quarter;
    const allSubs = await AbsorptionSubmission.findAll({ where: whereSub });

    // Grouping by UPT
    const uptMap = new Map();
    for (const u of upts) {
      uptMap.set(u.id, {
        uptId: u.id,
        uptName: u.name,
        uptCode: u.code,
        matra: u.matra,
        records: [],
        pns: 0,
        ppnpn: 0,
        bumn: 0,
        swasta: 0,
        belumBekerja: 0,
      });
    }

    for (const r of allRecords) {
      const entry = uptMap.get(r.uptId);
      if (!entry) continue;
      entry.records.push(r);
      if (r.kategoriSerap === 'pns') entry.pns++;
      else if (r.kategoriSerap === 'ppnpn') entry.ppnpn++;
      else if (r.kategoriSerap === 'bumn_bumd') entry.bumn++;
      else if (r.kategoriSerap === 'swasta') entry.swasta++;
      else entry.belumBekerja++;
    }

    const summariesByUpt = [...uptMap.values()].map((u) => {
      const totalBekerja = u.pns + u.ppnpn + u.bumn + u.swasta;
      const totalLulusan = totalBekerja + u.belumBekerja;
      const pct = totalLulusan > 0 ? Math.round((totalBekerja / totalLulusan) * 100) : 0;
      return {
        ...u,
        totalPemerintah: u.pns + u.ppnpn,
        totalNonPemerintah: u.bumn + u.swasta,
        totalBekerja,
        totalLulusan,
        pct,
      };
    });

    // Total National Summary
    const nationalSummary = {
      totalPns: summariesByUpt.reduce((s, u) => s + u.pns, 0),
      totalPpnpn: summariesByUpt.reduce((s, u) => s + u.ppnpn, 0),
      totalBumn: summariesByUpt.reduce((s, u) => s + u.bumn, 0),
      totalSwasta: summariesByUpt.reduce((s, u) => s + u.swasta, 0),
      totalBelumBekerja: summariesByUpt.reduce((s, u) => s + u.belumBekerja, 0),
      totalBekerja: summariesByUpt.reduce((s, u) => s + u.totalBekerja, 0),
      totalLulusan: summariesByUpt.reduce((s, u) => s + u.totalLulusan, 0),
    };
    nationalSummary.pct = nationalSummary.totalLulusan > 0
      ? Math.round((nationalSummary.totalBekerja / nationalSummary.totalLulusan) * 100)
      : 0;

    res.json({
      year,
      month,
      monthName: month ? MONTH_NAMES[month - 1] : null,
      quarter,
      quarterName: month ? `Bulan ${MONTH_NAMES[month - 1]}` : (quarter ? QUARTER_NAMES[quarter] : 'Seluruh Periode'),
      summary: nationalSummary,
      upts: summariesByUpt,
      submissions: allSubs.map((s) => withPeriodInfo(s.toJSON())),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data penyerapan nasional.' });
  }
});

// -------------------------------------------------------------
// 5. Inbox & Persetujuan Final Laporan Penyerapan BPSDMP
// -------------------------------------------------------------
router.get('/admin/inbox', async (req, res) => {
  if (!isSuperAdmin(req.user) && !isPusbang(req.user)) {
    return res.status(403).json({ error: 'Akses khusus Super Admin BPSDMP atau Pusbang.' });
  }
  const year = Number(req.query.year) || new Date().getFullYear();
  try {
    let whereUpt = { isActive: true };
    if (isPusbang(req.user)) {
      whereUpt.matra = (req.user.pusbangMatra || '').toLowerCase();
    }
    const upts = await Upt.findAll({ where: whereUpt, attributes: ['id', 'name', 'code', 'matra'] });
    const uptIds = upts.map((u) => u.id);
    const uptMap = new Map(upts.map((u) => [u.id, u]));

    const submissions = await AbsorptionSubmission.findAll({
      where: { uptId: { [Op.in]: uptIds }, year },
      order: [['updatedAt', 'DESC']],
    });

    const results = [];
    for (const s of submissions) {
      const u = uptMap.get(s.uptId);
      const sj = s.toJSON();
      const recWhere = sj.month
        ? { uptId: s.uptId, year: s.year, month: sj.month }
        : { uptId: s.uptId, year: s.year, quarter: s.quarter };
      const recordsCount = await GradAbsorption.count({ where: recWhere });
      results.push({
        ...withPeriodInfo(sj),
        uptName: u?.name || 'UPT',
        uptCode: u?.code || '',
        matra: u?.matra || '',
        recordsCount,
      });
    }

    res.json({ year, submissions: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil inbox penyerapan admin.' });
  }
});

router.post('/admin/review', async (req, res) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'Hanya Super Admin BPSDMP yang dapat melakukan pengesahan final penyerapan.' });
  }
  const { submissionId, action, notes } = req.body;
  if (!submissionId || !['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Parameter review tidak valid.' });
  }

  try {
    const sub = await AbsorptionSubmission.findByPk(submissionId);
    if (!sub) return res.status(404).json({ error: 'Pengajuan penyerapan tidak ditemukan.' });
    const matraErr = await assertPusbangUptMatra(req.user, sub.uptId);
    if (matraErr) return res.status(403).json({ error: matraErr });

    if (action === 'approve') {
      sub.status = 'approved_bpsdmp';
      sub.approvedAt = new Date();
      sub.notes = notes || null;
    } else {
      sub.status = 'rejected_bpsdmp';
      sub.rejectedAt = new Date();
      sub.notes = notes || 'Ditolak oleh Admin BPSDMP untuk perbaikan.';
    }
    await sub.save();

    const uptDoc = await Upt.findByPk(sub.uptId);
    if (action === 'approve') {
      await notifier.sendNotification({
        recipientRole: 'UPT_ADMIN',
        recipientUptId: sub.uptId,
        senderId: req.user.id,
        senderName: req.user.name || req.user.email,
        title: `Laporan Penyerapan Disahkan BPSDMP`,
        message: `Laporan Penyerapan Lulusan Triwulan ${sub.quarter} Tahun ${sub.year} telah disahkan dan dikunci secara nasional oleh Admin BPSDMP.`,
        category: 'approval',
        type: 'penyerapan',
        link: '/upt/penyerapan',
        metadata: { uptId: sub.uptId, year: sub.year, quarter: sub.quarter },
      });
      await notifier.sendNotification({
        recipientRole: 'PIMPINAN_UPT',
        recipientUptId: sub.uptId,
        senderId: req.user.id,
        senderName: req.user.name || req.user.email,
        title: `Laporan Penyerapan Disetujui BPSDMP`,
        message: `Laporan Penyerapan Triwulan ${sub.quarter} Tahun ${sub.year} untuk ${uptDoc?.name || 'UPT'} telah disahkan final oleh Admin BPSDMP.`,
        category: 'approval',
        type: 'penyerapan',
        link: '/pimpinan/persetujuan?category=penyerapan',
        metadata: { uptId: sub.uptId, year: sub.year, quarter: sub.quarter },
      });
    } else {
      await notifier.sendNotification({
        recipientRole: 'UPT_ADMIN',
        recipientUptId: sub.uptId,
        senderId: req.user.id,
        senderName: req.user.name || req.user.email,
        title: `Laporan Penyerapan Ditolak BPSDMP`,
        message: `Laporan Penyerapan Triwulan ${sub.quarter} Tahun ${sub.year} dikembalikan oleh Admin BPSDMP. Catatan: ${notes || '-'}`,
        category: 'rejection',
        type: 'penyerapan',
        link: '/upt/penyerapan/input',
        metadata: { uptId: sub.uptId, year: sub.year, quarter: sub.quarter, notes },
      });
    }

    audit(req, action === 'approve' ? 'APPROVE_PENYERAPAN_BPSDMP' : 'REJECT_PENYERAPAN', 'penyerapan', sub.id, { year: sub.year, month: sub.month || null });
    res.json({
      message: action === 'approve' ? 'Laporan Penyerapan berhasil disahkan final oleh BPSDMP.' : 'Laporan Penyerapan dikembalikan untuk revisi.',
      submission: sub,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memproses review penyerapan admin.' });
  }
});

module.exports = router;

