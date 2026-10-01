const express = require("express");
const bcrypt = require("bcryptjs");
const { authenticate, requireSuperAdmin } = require("../middleware/auth");
const { User, Upt } = require("../models");
const { audit } = require("../lib/audit");
const { Op } = require("sequelize");

const router = express.Router();

router.use(authenticate, requireSuperAdmin);

/** Normalisasi nomor HP Indonesia ke format internasional 628xx. */
function normalizePhone(raw) {
  let d = String(raw || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d;
}

function isValidPhone(raw) {
  return /^628\d{8,12}$/.test(normalizePhone(raw));
}

const VALID_ROLES = ["SUPER_ADMIN", "PUSBANG", "PIMPINAN_UPT", "UPT_ADMIN"];
const VALID_MATRA_PUSBANG = ["darat", "laut", "udara"];

function normalizeRole(raw) {
  const v = String(raw || "").trim().toUpperCase();
  if (v === "ADMIN") return "SUPER_ADMIN";
  if (v === "UPT") return "UPT_ADMIN";
  if (VALID_ROLES.includes(v)) return v;
  return "UPT_ADMIN";
}

/** Sinkronkan status isActive UPT berdasarkan user aktif. */
async function syncUptFromUsers(uptId) {
  if (!uptId) return;
  try {
    const upt = await Upt.findByPk(uptId);
    if (!upt) return;
    const hasActiveUser = await User.findOne({ where: { uptId, isActive: true } });
    await upt.update({ isActive: !!hasActiveUser });
  } catch (err) {
    console.error("syncUptFromUsers:", err);
  }
}

/** GET /api/users - daftar semua pengguna */
router.get("/", async (req, res) => {
  try {
    const users = await User.findAll({
      include: [{ model: Upt, as: "upt" }],
      order: [["role", "ASC"], ["name", "ASC"]],
    });
    const result = users.map((u) => {
      const roleNorm = u.role === "ADMIN" ? "SUPER_ADMIN" : u.role === "UPT" ? "UPT_ADMIN" : u.role;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone || "",
        role: roleNorm,
        uptId: u.uptId || null,
        uptCode: u.upt ? u.upt.code : "-",
        uptName: u.upt ? u.upt.name : "-",
        matra: u.upt ? (u.upt.matra || "") : (u.pusbangMatra || ""),
        pusbangMatra: u.pusbangMatra || null,
        isActive: u.isActive !== false,
        createdAt: u.createdAt || null,
      };
    });
    res.json({ users: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil daftar pengguna." });
  }
});

/** POST /api/users - buat akun */
router.post("/", async (req, res) => {
  const { name, email, password, phone, uptId, role, pusbangMatra } = req.body;
  const normRole = normalizeRole(role);
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Nama, email, dan password wajib diisi." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password minimal 6 karakter." });
  }
  const phoneNorm = normalizePhone(phone);
  if (phone && !isValidPhone(phone)) {
    return res.status(400).json({ error: "Nomor HP/WA tidak valid. Gunakan format 08xxxxxxxxxx atau +628xxxxxxxxxx." });
  }
  if (["UPT_ADMIN", "PIMPINAN_UPT"].includes(normRole) && !uptId) {
    return res.status(400).json({ error: "UPT wajib dipilih untuk role UPT/Pimpinan." });
  }
  if (normRole === "PUSBANG" && !VALID_MATRA_PUSBANG.includes(String(pusbangMatra || "").toLowerCase())) {
    return res.status(400).json({ error: "Matra Pusbang harus darat, laut, atau udara." });
  }

  try {
    // Validate UPT exists
    if (["UPT_ADMIN", "PIMPINAN_UPT"].includes(normRole)) {
      const upt = await Upt.findByPk(uptId);
      if (!upt) return res.status(404).json({ error: "UPT yang dipilih tidak ditemukan." });
    }

    // Check email unique
    const existingUser = await User.findOne({ where: { email: email.trim().toLowerCase() } });
    if (existingUser) return res.status(409).json({ error: "Email sudah terdaftar di sistem." });

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const doc = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hash,
      phone: phoneNorm,
      role: normRole,
      isActive: true,
    };
    if (["UPT_ADMIN", "PIMPINAN_UPT"].includes(normRole)) doc.uptId = uptId;
    if (normRole === "PUSBANG") doc.pusbangMatra = String(pusbangMatra).toLowerCase();

    const user = await User.create(doc);
    if (["UPT_ADMIN", "PIMPINAN_UPT"].includes(normRole)) await syncUptFromUsers(uptId);

    audit(req, "CREATE_USER", "user", user.id, { email: user.email, role: user.role });
    res.status(201).json({ id: user.id, message: `Akun ${email} berhasil dibuat.` });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ error: "Email sudah terdaftar di sistem." });
    }
    console.error(err);
    res.status(500).json({ error: "Gagal membuat akun pengguna." });
  }
});

/** PUT /api/users/:id - edit nama, email, phone */
router.put("/:id", async (req, res) => {
  const { name, email, phone } = req.body;
  if (!name || !name.trim() || !email || !email.trim()) {
    return res.status(400).json({ error: "Nama dan email wajib diisi." });
  }
  const emailNorm = email.trim().toLowerCase();
  const phoneNorm = normalizePhone(phone);
  if (phone && !isValidPhone(phone)) {
    return res.status(400).json({ error: "Nomor HP/WA tidak valid." });
  }
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: "Pengguna tidak ditemukan." });

    // Check email uniqueness
    if (user.email !== emailNorm) {
      const emailTaken = await User.findOne({ where: { email: emailNorm, id: { [Op.ne]: req.params.id } } });
      if (emailTaken) return res.status(409).json({ error: "Email sudah dipakai akun lain." });
    }

    await user.update({ name: name.trim(), email: emailNorm, phone: phoneNorm });
    audit(req, "UPDATE_USER", "user", user.id, { email: emailNorm });
    res.json({ message: "Akun pengguna berhasil diperbarui." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memperbarui akun pengguna." });
  }
});

/** DELETE /api/users/:id - hapus akun NONAKTIF (tidak boleh hapus akun sendiri) */
router.delete("/:id", async (req, res) => {
  try {
    if (req.params.id === req.uid) {
      return res.status(400).json({ error: "Tidak dapat menghapus akun Anda sendiri." });
    }
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: "Pengguna tidak ditemukan." });
    if (user.isActive !== false) {
      return res.status(400).json({ error: "Hanya akun nonaktif yang dapat dihapus. Nonaktifkan terlebih dahulu." });
    }
    const uptId = user.uptId || null;
    const delEmail = user.email;
    await user.destroy();
    if (uptId) await syncUptFromUsers(uptId);
    audit(req, "DELETE_USER", "user", req.params.id, { email: delEmail });
    res.json({ message: "Akun pengguna berhasil dihapus." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menghapus akun pengguna." });
  }
});

/** PATCH /api/users/:id/status - aktif/nonaktifkan (tidak boleh nonaktifkan akun sendiri) */
router.patch("/:id/status", async (req, res) => {
  try {
    if (req.params.id === req.uid) {
      return res.status(400).json({ error: "Tidak dapat menonaktifkan akun Anda sendiri." });
    }
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: "Pengguna tidak ditemukan." });
    const next = !(user.isActive !== false);
    const uptId = user.uptId || null;
    await user.update({ isActive: next });
    if (uptId) await syncUptFromUsers(uptId);
    audit(req, next ? "ACTIVATE_USER" : "DEACTIVATE_USER", "user", user.id, { email: user.email });
    res.json({ message: "Status pengguna diperbarui.", isActive: next });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengubah status pengguna." });
  }
});

/** PATCH /api/users/:id/password - reset password */
router.patch("/:id/password", async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "Password baru minimal 6 karakter." });
  }
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: "Pengguna tidak ditemukan." });
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);
    await user.update({ password: hash });
    audit(req, "RESET_PASSWORD", "user", user.id, { email: user.email });
    res.json({ message: "Password pengguna berhasil direset." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mereset password." });
  }
});

/** PATCH /api/users/:id/phone - ubah nomor HP/WA */
router.patch("/:id/phone", async (req, res) => {
  const { phone } = req.body;
  const phoneNorm = normalizePhone(phone);
  if (phone && !isValidPhone(phone)) {
    return res.status(400).json({ error: "Nomor HP/WA tidak valid." });
  }
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: "Pengguna tidak ditemukan." });
    await user.update({ phone: phoneNorm });
    res.json({ message: "Nomor HP/WA diperbarui.", phone: phoneNorm });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memperbarui nomor HP/WA." });
  }
});

/** PATCH /api/users/:id/upt - pindahkan UPT */
router.patch("/:id/upt", async (req, res) => {
  const { uptId } = req.body;
  if (!uptId) return res.status(400).json({ error: "UPT wajib dipilih." });
  try {
    const upt = await Upt.findByPk(uptId);
    if (!upt) return res.status(404).json({ error: "UPT tidak ditemukan." });
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: "Pengguna tidak ditemukan." });
    const oldUptId = user.uptId || null;
    await user.update({ uptId });
    if (oldUptId) await syncUptFromUsers(oldUptId);
    await syncUptFromUsers(uptId);
    res.json({ message: "UPT pengguna diperbarui." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memperbarui UPT pengguna." });
  }
});

module.exports = router;
