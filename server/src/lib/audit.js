const { ActivityLog } = require('../models');

/**
 * Catat jejak audit. Fail-safe: tidak pernah menggagalkan request utama.
 * @param {object} req - request Express (diambil user, ip, user-agent)
 * @param {string} action - kode aksi (mis. LOGIN, SUBMIT_TARGET)
 * @param {string} entity - kelompok objek (auth/user/target/realisasi/diklat/penyerapan/taruna/unlock/prodi)
 * @param {string} entityId - id objek terkait (opsional)
 * @param {object|string} detail - ringkasan tambahan (opsional)
 */
/** Normalisasi IP (hilangkan prefix IPv6-mapped IPv4 seperti ::ffff:127.0.0.1). */
function cleanIp(raw) {
  return String(raw || '').replace(/^::ffff:/, '') || null;
}

async function audit(req, action, entity, entityId, detail) {
  try {
    const user = req?.user || {};
    let detailStr = null;
    if (detail !== undefined && detail !== null) {
      detailStr = typeof detail === 'string' ? detail.slice(0, 2000) : JSON.stringify(detail).slice(0, 2000);
    }
    await ActivityLog.create({
      actorId: req?.uid || user.id || null,
      actorName: user.name || user.email || null,
      actorRole: user.role || null,
      uptId: user.uptId || null,
      uptCode: (user.upt && user.upt.code) || user.uptCode || null,
      action,
      entity: entity || null,
      entityId: entityId ? String(entityId) : null,
      detail: detailStr,
      ip: cleanIp(req?.ip),
    });
  } catch (err) {
    console.error('[audit]', err.message);
  }
}

module.exports = { audit };
