const express = require('express');
const { authenticate, isSuperAdmin, isPusbang, isPimpinan, isUptAdmin } = require('../middleware/auth');
const { Notification } = require('../models');
const { Op } = require('sequelize');

const router = express.Router();
router.use(authenticate);

/**
 * Filter notifikasi berdasarkan hak akses role user saat ini
 */
function buildUserNotifCondition(user) {
  const uid = user.id;
  const conditions = [{ userId: uid }];

  if (isSuperAdmin(user)) {
    conditions.push({ recipientRole: { [Op.in]: ['SUPER_ADMIN', 'ADMIN', 'ALL'] } });
  } else if (isPusbang(user)) {
    const matra = (user.pusbangMatra || '').toLowerCase();
    conditions.push({
      recipientRole: 'PUSBANG',
      [Op.or]: [
        { recipientMatra: matra },
        { recipientMatra: null },
        { recipientMatra: '' },
      ],
    });
  } else if (isPimpinan(user)) {
    conditions.push({
      recipientRole: 'PIMPINAN_UPT',
      recipientUptId: user.uptId,
    });
  } else if (isUptAdmin(user)) {
    conditions.push({
      recipientRole: { [Op.in]: ['UPT_ADMIN', 'UPT'] },
      recipientUptId: user.uptId,
    });
  }

  return { [Op.or]: conditions };
}

/**
 * GET /api/notifications - Ambil daftar notifikasi untuk user yang login
 */
router.get('/', async (req, res) => {
  try {
    const user = req.user;
    const uid = req.uid;
    const limit = Math.min(Number(req.query.limit) || 40, 100);

    const where = buildUserNotifCondition(user);

    const list = await Notification.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
    });

    let unreadCount = 0;
    const formatted = list.map((item) => {
      const data = item.toJSON();
      const readArr = Array.isArray(data.readBy) ? data.readBy : [];
      const isRead = readArr.includes(uid);
      if (!isRead) unreadCount++;
      return {
        ...data,
        isRead,
      };
    });

    res.json({
      notifications: formatted,
      unreadCount,
    });
  } catch (err) {
    console.error('[notifications] GET error:', err);
    res.status(500).json({ error: 'Gagal mengambil notifikasi.' });
  }
});

/**
 * PATCH /api/notifications/:id/read - Tandai satu notifikasi sudah dibaca
 */
router.patch('/:id/read', async (req, res) => {
  try {
    const uid = req.uid;
    const notif = await Notification.findByPk(req.params.id);
    if (!notif) return res.status(404).json({ error: 'Notifikasi tidak ditemukan.' });

    const readArr = Array.isArray(notif.readBy) ? [...notif.readBy] : [];
    if (!readArr.includes(uid)) {
      readArr.push(uid);
      notif.readBy = readArr;
      await notif.save();
    }

    res.json({ success: true, isRead: true });
  } catch (err) {
    console.error('[notifications] READ error:', err);
    res.status(500).json({ error: 'Gagal memperbarui status baca.' });
  }
});

/**
 * PATCH /api/notifications/mark-all-read - Tandai semua notifikasi sudah dibaca
 */
router.patch('/mark-all-read', async (req, res) => {
  try {
    const user = req.user;
    const uid = req.uid;

    const where = buildUserNotifCondition(user);
    const list = await Notification.findAll({ where, limit: 100 });

    let updatedCount = 0;
    for (const notif of list) {
      const readArr = Array.isArray(notif.readBy) ? [...notif.readBy] : [];
      if (!readArr.includes(uid)) {
        readArr.push(uid);
        notif.readBy = readArr;
        await notif.save();
        updatedCount++;
      }
    }

    res.json({ success: true, updatedCount });
  } catch (err) {
    console.error('[notifications] MARK-ALL error:', err);
    res.status(500).json({ error: 'Gagal menandai semua notifikasi.' });
  }
});

/**
 * DELETE /api/notifications/:id - Hapus notifikasi
 */
router.delete('/:id', async (req, res) => {
  try {
    const notif = await Notification.findByPk(req.params.id);
    if (!notif) return res.status(404).json({ error: 'Notifikasi tidak ditemukan.' });

    await notif.destroy();
    res.json({ success: true, message: 'Notifikasi berhasil dihapus.' });
  } catch (err) {
    console.error('[notifications] DELETE error:', err);
    res.status(500).json({ error: 'Gagal menghapus notifikasi.' });
  }
});

module.exports = router;
