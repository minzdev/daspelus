const { Notification, Upt } = require('../models');

/**
 * Buat notifikasi secara aman (fail-safe) tanpa menghentikan proses utama
 */
async function sendNotification({
  userId = null,
  recipientRole = null,
  recipientMatra = null,
  recipientUptId = null,
  senderId = null,
  senderName = null,
  title,
  message,
  category = 'info', // 'request', 'approval', 'rejection', 'info', 'forward'
  type = 'general',  // 'target_pk', 'realisasi', 'unlock_request', 'taruna', 'penyerapan'
  link = null,
  metadata = null,
}) {
  try {
    if (!title || !message) return null;

    const notif = await Notification.create({
      userId,
      recipientRole,
      recipientMatra: recipientMatra ? recipientMatra.toLowerCase() : null,
      recipientUptId,
      senderId,
      senderName: senderName || 'Sistem',
      title,
      message,
      category,
      type,
      link,
      metadata: metadata || {},
      readBy: [],
    });

    return notif;
  } catch (err) {
    console.error('[notifier] Gagal membuat notifikasi:', err.message);
    return null;
  }
}

// -------------------------------------------------------------
// 1. TARGET PK NOTIFICATIONS
// -------------------------------------------------------------

async function notifyTargetPkSubmit({ upt, year, month, user }) {
  const period = month === 0 ? 'Tahunan' : `Bulan ${month}`;
  // 1. Kirim ke Pimpinan UPT
  await sendNotification({
    recipientRole: 'PIMPINAN_UPT',
    recipientUptId: upt.id,
    senderId: user?.id,
    senderName: user?.name || user?.email,
    title: `Permohonan Persetujuan Target PK`,
    message: `Admin UPT telah mengajukan Target PK (${period}) Tahun ${year} untuk diperiksa dan disetujui.`,
    category: 'request',
    type: 'target_pk',
    link: '/pimpinan/inbox',
    metadata: { uptId: upt.id, uptCode: upt.code, year, month },
  });
}

async function notifyTargetPkPimpinanReview({ doc, upt, year, month, action, note, user }) {
  const period = month === 0 ? 'Tahunan' : `Bulan ${month}`;
  if (action === 'approve') {
    // Ke Admin BPSDMP
    await sendNotification({
      recipientRole: 'SUPER_ADMIN',
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Persetujuan Target PK Masuk`,
      message: `Pimpinan ${upt.name || upt.code} telah menyetujui Target PK (${period}) Tahun ${year}. Menunggu verifikasi & penguncian final BPSDMP.`,
      category: 'request',
      type: 'target_pk',
      link: '/admin/target-inbox',
      metadata: { uptId: upt.id, uptCode: upt.code, year, month },
    });

    // Ke Admin UPT
    await sendNotification({
      recipientRole: 'UPT_ADMIN',
      recipientUptId: upt.id,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Target PK Disetujui Pimpinan`,
      message: `Target PK (${period}) Tahun ${year} telah disetujui oleh Pimpinan UPT dan diteruskan ke Admin BPSDMP.`,
      category: 'forward',
      type: 'target_pk',
      link: '/upt/target-pk',
      metadata: { uptId: upt.id, year, month },
    });
  } else {
    // Ditolak Pimpinan -> Ke Admin UPT
    await sendNotification({
      recipientRole: 'UPT_ADMIN',
      recipientUptId: upt.id,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Target PK Ditolak Pimpinan UPT`,
      message: `Target PK (${period}) Tahun ${year} ditolak oleh Pimpinan UPT. Catatan: ${note || 'Silakan tinjau dan perbaiki isian data target.'}`,
      category: 'rejection',
      type: 'target_pk',
      link: '/upt/target-pk',
      metadata: { uptId: upt.id, year, month, note },
    });
  }
}

async function notifyTargetPkBpsdmpReview({ doc, upt, year, month, action, note, user }) {
  const period = month === 0 ? 'Tahunan' : `Bulan ${month}`;
  if (action === 'approve') {
    // Ke Admin UPT
    await sendNotification({
      recipientRole: 'UPT_ADMIN',
      recipientUptId: upt.id,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Target PK Disetujui BPSDMP (Terkunci)`,
      message: `Target PK (${period}) Tahun ${year} telah disetujui final oleh Admin BPSDMP dan resmi aktif terkunci.`,
      category: 'approval',
      type: 'target_pk',
      link: '/upt/target-pk',
      metadata: { uptId: upt.id, year, month },
    });

    // Ke Pimpinan UPT
    await sendNotification({
      recipientRole: 'PIMPINAN_UPT',
      recipientUptId: upt.id,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Target PK Disetujui BPSDMP`,
      message: `Target PK (${period}) Tahun ${year} untuk ${upt.name || upt.code} telah diverifikasi dan disetujui final oleh Admin BPSDMP.`,
      category: 'approval',
      type: 'target_pk',
      link: '/pimpinan/inbox',
      metadata: { uptId: upt.id, year, month },
    });
  } else {
    // Ditolak BPSDMP -> Ke Admin UPT & Pimpinan UPT
    await sendNotification({
      recipientRole: 'UPT_ADMIN',
      recipientUptId: upt.id,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Target PK Ditolak Admin BPSDMP`,
      message: `Target PK (${period}) Tahun ${year} ditolak oleh Admin BPSDMP. Alasan: ${note || 'Perlu penyesuaian data.'}`,
      category: 'rejection',
      type: 'target_pk',
      link: '/upt/target-pk',
      metadata: { uptId: upt.id, year, month, note },
    });
    await sendNotification({
      recipientRole: 'PIMPINAN_UPT',
      recipientUptId: upt.id,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Target PK Ditolak Admin BPSDMP`,
      message: `Target PK (${period}) Tahun ${year} ditolak oleh Admin BPSDMP. Catatan: ${note || '-'}`,
      category: 'rejection',
      type: 'target_pk',
      link: '/pimpinan/inbox',
      metadata: { uptId: upt.id, year, month, note },
    });
  }
}

// -------------------------------------------------------------
// 2. LAPORAN REALISASI BULANAN NOTIFICATIONS
// -------------------------------------------------------------

async function notifyRealisasiSubmit({ upt, year, month, user }) {
  await sendNotification({
    recipientRole: 'PIMPINAN_UPT',
    recipientUptId: upt.id,
    senderId: user?.id,
    senderName: user?.name || user?.email,
    title: `Laporan Realisasi Baru Masuk`,
    message: `Admin UPT telah mengirim Laporan Realisasi Bulan ${month}/${year} untuk diperiksa dan disetujui.`,
    category: 'request',
    type: 'realisasi',
    link: '/pimpinan/inbox',
    metadata: { uptId: upt.id, uptCode: upt.code, year, month },
  });
}

async function notifyRealisasiPimpinanReview({ doc, upt, year, month, action, note, user }) {
  if (action === 'approve') {
    // Ke Admin BPSDMP
    await sendNotification({
      recipientRole: 'SUPER_ADMIN',
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Laporan Realisasi Menunggu Approval BPSDMP`,
      message: `Pimpinan ${upt.name || upt.code} telah menyetujui Laporan Bulan ${month}/${year}. Menunggu penguncian final BPSDMP.`,
      category: 'request',
      type: 'realisasi',
      link: '/admin/inbox',
      metadata: { uptId: upt.id, uptCode: upt.code, year, month },
    });

    // Ke Admin UPT
    await sendNotification({
      recipientRole: 'UPT_ADMIN',
      recipientUptId: upt.id,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Laporan Realisasi Disetujui Pimpinan`,
      message: `Laporan Bulan ${month}/${year} disetujui Pimpinan dan diteruskan ke Admin BPSDMP.`,
      category: 'forward',
      type: 'realisasi',
      link: '/upt/riwayat',
      metadata: { uptId: upt.id, year, month },
    });
  } else {
    // Ditolak
    await sendNotification({
      recipientRole: 'UPT_ADMIN',
      recipientUptId: upt.id,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Laporan Realisasi Ditolak Pimpinan`,
      message: `Laporan Bulan ${month}/${year} dikembalikan oleh Pimpinan UPT untuk diperbaiki. Catatan: ${note || '-'}`,
      category: 'rejection',
      type: 'realisasi',
      link: '/upt/input',
      metadata: { uptId: upt.id, year, month, note },
    });
  }
}

async function notifyRealisasiBpsdmpReview({ doc, upt, year, month, action, note, user }) {
  if (action === 'approve') {
    // Ke Admin UPT
    await sendNotification({
      recipientRole: 'UPT_ADMIN',
      recipientUptId: upt.id,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Laporan Realisasi Disetujui BPSDMP (Terkunci)`,
      message: `Laporan Realisasi Bulan ${month}/${year} telah disetujui final oleh BPSDMP dan berstatus Terkunci.`,
      category: 'approval',
      type: 'realisasi',
      link: '/upt/riwayat',
      metadata: { uptId: upt.id, year, month },
    });

    // Ke Pimpinan UPT
    await sendNotification({
      recipientRole: 'PIMPINAN_UPT',
      recipientUptId: upt.id,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Laporan Realisasi Selesai Disetujui`,
      message: `Laporan Realisasi Bulan ${month}/${year} untuk ${upt.name || upt.code} telah disetujui final oleh Admin BPSDMP.`,
      category: 'approval',
      type: 'realisasi',
      link: '/pimpinan/inbox',
      metadata: { uptId: upt.id, year, month },
    });
  } else {
    await sendNotification({
      recipientRole: 'UPT_ADMIN',
      recipientUptId: upt.id,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Laporan Realisasi Ditolak BPSDMP`,
      message: `Laporan Realisasi Bulan ${month}/${year} ditolak oleh Admin BPSDMP. Catatan: ${note || '-'}`,
      category: 'rejection',
      type: 'realisasi',
      link: '/upt/input',
      metadata: { uptId: upt.id, year, month, note },
    });
  }
}

// -------------------------------------------------------------
// 3. UNLOCK REQUEST NOTIFICATIONS (4 TAHAP)
// -------------------------------------------------------------

async function notifyUnlockRequestSubmit({ doc, upt, year, month, type, reason, user }) {
  const typeLabel = type === 'target_pk' ? 'Target PK' : type === 'taruna' ? 'Master Data Taruna' : 'Capaian Realisasi';
  const periodLabel = type === 'target_pk'
    ? (month === 0 ? 'Tahunan' : `Bulan ${month}`)
    : (month ? `Bulan ${month}` : `Tahun ${year}`);

  await sendNotification({
    recipientRole: 'PIMPINAN_UPT',
    recipientUptId: upt.id,
    senderId: user?.id,
    senderName: user?.name || user?.email,
    title: `Permohonan Buka Kunci (${typeLabel})`,
    message: `${upt.name || upt.code} mengajukan permohonan buka kunci ${typeLabel} (${periodLabel} ${year}). Alasan: "${reason}"`,
    category: 'request',
    type: 'unlock_request',
    link: type === 'taruna' ? '/pimpinan/penyerapan/taruna-inbox' : '/pimpinan/unlock',
    metadata: { unlockId: doc?.id, uptId: upt.id, year, month, type },
  });
}

async function notifyUnlockRequestDecision({ doc, decision, note, user, nextStatus }) {
  const typeLabel = doc.type === 'target_pk' ? 'Target PK' : doc.type === 'taruna' ? 'Master Data Taruna' : 'Capaian Realisasi';
  const periodLabel = doc.type === 'target_pk'
    ? (doc.month === 0 ? 'Tahunan' : `Bulan ${doc.month}`)
    : (doc.month ? `Bulan ${doc.month}` : `Tahun ${doc.year}`);

  if (decision === 'reject') {
    // Ditolak pada tahap mana pun -> beri tahu Admin UPT
    await sendNotification({
      recipientRole: 'UPT_ADMIN',
      recipientUptId: doc.uptId,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Permohonan Buka Kunci DITOLAK`,
      message: `Permohonan buka kunci ${typeLabel} (${periodLabel} ${doc.year}) telah ditolak. Alasan: "${note || 'Tidak disetujui.'}"`,
      category: 'rejection',
      type: 'unlock_request',
      link: '/upt/riwayat',
      metadata: { unlockId: doc.id, uptId: doc.uptId },
    });
    return;
  }

  // Jika APPROVE:
  if (nextStatus === 'pending_pusbang') {
    // Pimpinan UPT menyetujui -> diteruskan ke Pusbang Matra
    await sendNotification({
      recipientRole: 'PUSBANG',
      recipientMatra: doc.matra,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Permohonan Unlock Menunggu Rekomendasi Pusbang`,
      message: `Pimpinan ${doc.uptName || doc.uptCode} telah menyetujui permohonan buka kunci ${typeLabel} (${periodLabel} ${doc.year}) dan meneruskan ke Pusbang Matra ${doc.matra?.toUpperCase()}.`,
      category: 'request',
      type: 'unlock_request',
      link: '/pusbang/unlock',
      metadata: { unlockId: doc.id, uptId: doc.uptId, matra: doc.matra },
    });

    // Ke Admin UPT
    await sendNotification({
      recipientRole: 'UPT_ADMIN',
      recipientUptId: doc.uptId,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Permohonan Unlock Disetujui Pimpinan`,
      message: `Permohonan buka kunci ${typeLabel} telah disetujui Pimpinan UPT dan diteruskan ke Admin Pusbang Matra.`,
      category: 'forward',
      type: 'unlock_request',
      link: '/upt/riwayat',
      metadata: { unlockId: doc.id },
    });
  } else if (nextStatus === 'pending_bpsdmp') {
    // Pusbang merekomendasikan -> diteruskan ke Admin BPSDMP
    await sendNotification({
      recipientRole: 'SUPER_ADMIN',
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Permohonan Unlock Diteruskan Pusbang`,
      message: `Admin Pusbang Matra ${doc.matra?.toUpperCase()} merekomendasikan permohonan buka kunci ${doc.uptName} (${typeLabel} ${periodLabel} ${doc.year}) untuk disetujui Admin BPSDMP.`,
      category: 'request',
      type: 'unlock_request',
      link: '/admin/unlock-inbox',
      metadata: { unlockId: doc.id, uptId: doc.uptId, matra: doc.matra },
    });

    // Ke Admin UPT & Pimpinan UPT
    await sendNotification({
      recipientRole: 'UPT_ADMIN',
      recipientUptId: doc.uptId,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Permohonan Unlock Direkomendasikan Pusbang`,
      message: `Pusbang Matra telah merekomendasikan permohonan buka kunci Anda ke Admin BPSDMP. Menunggu persetujuan final.`,
      category: 'forward',
      type: 'unlock_request',
      link: '/upt/riwayat',
      metadata: { unlockId: doc.id },
    });
  } else if (nextStatus === 'approved') {
    // BPSDMP menyetujui final -> Data resmi terbuka!
    await sendNotification({
      recipientRole: 'UPT_ADMIN',
      recipientUptId: doc.uptId,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Permohonan Unlock DISETUJUI (Data Terbuka)`,
      message: `Admin BPSDMP telah menyetujui permohonan buka kunci ${typeLabel} (${periodLabel} ${doc.year}). Data kini telah terbuka dan dapat diperbaiki.`,
      category: 'approval',
      type: 'unlock_request',
      link: doc.type === 'target_pk' ? '/upt/target-pk' : doc.type === 'taruna' ? '/upt/taruna' : '/upt/input',
      metadata: { unlockId: doc.id },
    });

    // Ke Pimpinan UPT
    await sendNotification({
      recipientRole: 'PIMPINAN_UPT',
      recipientUptId: doc.uptId,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Data Berhasil Dibuka Kunci`,
      message: `Buka kunci ${typeLabel} (${periodLabel} ${doc.year}) untuk ${doc.uptName} telah disetujui final oleh Admin BPSDMP.`,
      category: 'approval',
      type: 'unlock_request',
      link: '/pimpinan/inbox',
      metadata: { unlockId: doc.id },
    });

    // Ke Pusbang
    if (doc.matra) {
      await sendNotification({
        recipientRole: 'PUSBANG',
        recipientMatra: doc.matra,
        senderId: user?.id,
        senderName: user?.name || user?.email,
        title: `Permohonan Unlock Disetujui BPSDMP`,
        message: `Permohonan buka kunci ${doc.uptName} (${typeLabel} ${doc.year}) telah disetujui final oleh Admin BPSDMP.`,
        category: 'approval',
        type: 'unlock_request',
        link: '/pusbang/unlock',
        metadata: { unlockId: doc.id },
      });
    }
  }
}

// -------------------------------------------------------------
// 4. MASTER TARUNA & PENYERAPAN NOTIFICATIONS
// -------------------------------------------------------------

async function notifyTarunaSubmit({ upt, year, user }) {
  await sendNotification({
    recipientRole: 'PIMPINAN_UPT',
    recipientUptId: upt.id,
    senderId: user?.id,
    senderName: user?.name || user?.email,
    title: `Pengajuan Master Data Taruna`,
    message: `Admin UPT telah mengajukan Master Data Taruna Tahun ${year} untuk diperiksa dan disetujui.`,
    category: 'request',
    type: 'taruna',
    link: '/pimpinan/taruna-inbox',
    metadata: { uptId: upt.id, year },
  });
}

async function notifyTarunaPimpinanReview({ upt, year, action, notes, user }) {
  if (action === 'approve') {
    // Ke Admin BPSDMP
    await sendNotification({
      recipientRole: 'SUPER_ADMIN',
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Master Data Taruna Menunggu Verifikasi Nasional`,
      message: `Pimpinan ${upt.name || upt.code} telah menyetujui Master Data Taruna Tahun ${year}. Menunggu verifikasi & penguncian nasional oleh BPSDMP.`,
      category: 'request',
      type: 'taruna',
      link: '/admin/taruna-inbox',
      metadata: { uptId: upt.id, year },
    });

    // Ke Admin UPT
    await sendNotification({
      recipientRole: 'UPT_ADMIN',
      recipientUptId: upt.id,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Master Data Taruna Disetujui Pimpinan`,
      message: `Master Data Taruna Tahun ${year} telah disetujui Pimpinan UPT dan diteruskan ke Admin BPSDMP.`,
      category: 'forward',
      type: 'taruna',
      link: '/upt/taruna',
      metadata: { uptId: upt.id, year },
    });
  } else {
    await sendNotification({
      recipientRole: 'UPT_ADMIN',
      recipientUptId: upt.id,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Master Data Taruna Ditolak Pimpinan`,
      message: `Master Data Taruna Tahun ${year} dikembalikan oleh Pimpinan UPT. Catatan: ${notes || '-'}`,
      category: 'rejection',
      type: 'taruna',
      link: '/upt/taruna',
      metadata: { uptId: upt.id, year, notes },
    });
  }
}

async function notifyTarunaAdminReview({ upt, year, action, notes, user }) {
  if (action === 'approve') {
    await sendNotification({
      recipientRole: 'UPT_ADMIN',
      recipientUptId: upt.id,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Master Data Taruna Disetujui BPSDMP (Terkunci)`,
      message: `Master Data Taruna Tahun ${year} telah diverifikasi dan disetujui secara nasional oleh Admin BPSDMP. Data resmi aktif dan terkunci.`,
      category: 'approval',
      type: 'taruna',
      link: '/upt/taruna',
      metadata: { uptId: upt.id, year },
    });
    await sendNotification({
      recipientRole: 'PIMPINAN_UPT',
      recipientUptId: upt.id,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Master Data Taruna Disetujui BPSDMP`,
      message: `Master Data Taruna Tahun ${year} untuk ${upt.name || upt.code} telah disetujui final oleh Admin BPSDMP.`,
      category: 'approval',
      type: 'taruna',
      link: '/pimpinan/taruna-inbox',
      metadata: { uptId: upt.id, year },
    });
  } else {
    await sendNotification({
      recipientRole: 'UPT_ADMIN',
      recipientUptId: upt.id,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Master Data Taruna Ditolak BPSDMP`,
      message: `Master Data Taruna Tahun ${year} ditolak oleh Admin BPSDMP. Catatan: ${notes || '-'}`,
      category: 'rejection',
      type: 'taruna',
      link: '/upt/taruna',
      metadata: { uptId: upt.id, year, notes },
    });
  }
}

const ABSORPTION_MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
function absorptionPeriodLabel({ month, quarter } = {}) {
  if (month) return `Bulan ${ABSORPTION_MONTH_NAMES[Number(month) - 1]}`;
  if (quarter) return `Triwulan ${quarter}`;
  return 'Periode berjalan';
}

async function notifyAbsorptionReportSubmit({ upt, year, quarter, month, user }) {
  const period = absorptionPeriodLabel({ month, quarter });
  await sendNotification({
    recipientRole: 'PIMPINAN_UPT',
    recipientUptId: upt.id,
    senderId: user?.id,
    senderName: user?.name || user?.email,
    title: `Laporan Penyerapan Lulusan Masuk`,
    message: `Admin UPT telah mengirim Laporan Penyerapan Lulusan ${period} Tahun ${year} untuk disetujui.`,
    category: 'request',
    type: 'penyerapan',
    link: '/pimpinan/penyerapan',
    metadata: { uptId: upt.id, year, quarter, month: month || null },
  });
}

async function notifyAbsorptionReportReview({ upt, year, quarter, month, action, notes, user }) {
  const period = absorptionPeriodLabel({ month, quarter });
  if (action === 'approve') {
    await sendNotification({
      recipientRole: 'UPT_ADMIN',
      recipientUptId: upt.id,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Laporan Penyerapan Lulusan Disetujui`,
      message: `Laporan Penyerapan Lulusan ${period} Tahun ${year} telah disetujui oleh Pimpinan UPT.`,
      category: 'approval',
      type: 'penyerapan',
      link: '/upt/penyerapan',
      metadata: { uptId: upt.id, year, quarter, month: month || null },
    });
  } else {
    await sendNotification({
      recipientRole: 'UPT_ADMIN',
      recipientUptId: upt.id,
      senderId: user?.id,
      senderName: user?.name || user?.email,
      title: `Laporan Penyerapan Lulusan Ditolak`,
      message: `Laporan Penyerapan Lulusan ${period} Tahun ${year} dikembalikan oleh Pimpinan UPT. Catatan: ${notes || '-'}`,
      category: 'rejection',
      type: 'penyerapan',
      link: '/upt/penyerapan/input',
      metadata: { uptId: upt.id, year, quarter, month: month || null, notes },
    });
  }
}

module.exports = {
  sendNotification,
  notifyTargetPkSubmit,
  notifyTargetPkPimpinanReview,
  notifyTargetPkBpsdmpReview,
  notifyRealisasiSubmit,
  notifyRealisasiPimpinanReview,
  notifyRealisasiBpsdmpReview,
  notifyUnlockRequestSubmit,
  notifyUnlockRequestDecision,
  notifyTarunaSubmit,
  notifyTarunaPimpinanReview,
  notifyTarunaAdminReview,
  notifyAbsorptionReportSubmit,
  notifyAbsorptionReportReview,
};
