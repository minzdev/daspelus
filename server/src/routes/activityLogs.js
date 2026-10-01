const express = require("express");
const { authenticate, requireSuperAdmin } = require("../middleware/auth");
const { ActivityLog } = require("../models");
const { Op } = require("sequelize");

const router = express.Router();
router.use(authenticate, requireSuperAdmin);

/** GET /api/activity-logs - daftar jejak audit (Super Admin saja) */
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    const where = {};
    if (req.query.role) where.actorRole = req.query.role;
    if (req.query.action) where.action = req.query.action;
    if (req.query.entity) where.entity = req.query.entity;
    if (req.query.uptId) where.uptId = req.query.uptId;
    if (req.query.search && String(req.query.search).trim()) {
      const q = `%${String(req.query.search).trim()}%`;
      where[Op.or] = [
        { actorName: { [Op.like]: q } },
        { uptCode: { [Op.like]: q } },
        { entityId: { [Op.like]: q } },
        { detail: { [Op.like]: q } },
      ];
    }
    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) where.createdAt[Op.gte] = new Date(`${req.query.from}T00:00:00`);
      if (req.query.to) where.createdAt[Op.lte] = new Date(`${req.query.to}T23:59:59`);
    }

    const { count, rows } = await ActivityLog.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    res.json({
      logs: rows,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil log aktivitas." });
  }
});

/** GET /api/activity-logs/actions - daftar aksi untuk filter */
router.get("/actions", async (req, res) => {
  try {
    const rows = await ActivityLog.findAll({
      attributes: ["action", "entity"],
      group: ["action", "entity"],
      order: [["action", "ASC"]],
      limit: 200,
    });
    res.json({ actions: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil daftar aksi." });
  }
});

module.exports = router;
