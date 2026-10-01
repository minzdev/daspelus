const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { authenticate } = require("../middleware/auth");
const { User, Upt } = require("../models");
const { audit } = require("../lib/audit");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "daspeslus_secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

/** POST /api/auth/login - login dengan email + password, return JWT */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email dan password wajib diisi." });
  }

  try {
    const user = await User.scope('withPassword').findOne({ where: { email: email.trim().toLowerCase() } });
    if (!user) {
      audit(req, "LOGIN_FAILED", "auth", null, { email: email.trim().toLowerCase() });
      return res.status(401).json({ error: "Email atau password salah." });
    }
    if (user.isActive === false) {
      return res.status(403).json({ error: "Akun dinonaktifkan. Hubungi admin BPSDMP." });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      audit({ user: { id: user.id, name: user.name, email: user.email, role: user.role, uptId: user.uptId }, ip: req.ip }, "LOGIN_FAILED", "auth", user.id, null);
      return res.status(401).json({ error: "Email atau password salah." });
    }

    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    const profile = user.toJSON();
    // Load UPT info
    if (profile.uptId) {
      const upt = await Upt.findByPk(profile.uptId);
      if (upt) profile.upt = upt.toJSON();
    }

    // Route login tanpa middleware auth -> kirim identitas aktor secara eksplisit
    audit(
      { user: { id: user.id, name: user.name, email: user.email, role: user.role, uptId: user.uptId }, ip: req.ip },
      "LOGIN", "auth", user.id, { email: user.email, role: user.role }
    );
    res.json({ token, user: profile });
  } catch (err) {
    console.error("[login]", err);
    res.status(500).json({ error: "Gagal melakukan login." });
  }
});

/** GET /api/auth/me - profil user yang sedang login */
router.get("/me", authenticate, async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil profil." });
  }
});

/** Normalisasi nomor HP Indonesia (duplikat ringan dari users.js agar mandiri). */
function normalizePhoneAuth(raw) {
  let d = String(raw || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d;
}

/** PATCH /api/auth/profile - user login ubah data profilnya sendiri (nama/email/no HP). Terekam di log. */
router.patch("/profile", authenticate, async (req, res) => {
  const { name, email, phone } = req.body;
  try {
    const user = await User.findByPk(req.uid);
    if (!user) return res.status(404).json({ error: "User tidak ditemukan." });

    const patch = {};
    const changed = [];
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: "Nama tidak boleh kosong." });
      if (name.trim() !== user.name) { patch.name = name.trim(); changed.push("nama"); }
    }
    if (email !== undefined) {
      const emailNorm = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
        return res.status(400).json({ error: "Format email tidak valid." });
      }
      if (emailNorm !== user.email) {
        const taken = await User.findOne({ where: { email: emailNorm } });
        if (taken && taken.id !== user.id) return res.status(409).json({ error: "Email sudah dipakai akun lain." });
        patch.email = emailNorm; changed.push("email");
      }
    }
    if (phone !== undefined) {
      const phoneNorm = normalizePhoneAuth(phone);
      if (phone && !/^628\d{8,12}$/.test(phoneNorm)) {
        return res.status(400).json({ error: "Nomor HP/WA tidak valid. Gunakan format 08xxxxxxxxxx." });
      }
      if (phoneNorm !== (user.phone || "")) { patch.phone = phoneNorm; changed.push("no_hp"); }
    }
    if (changed.length === 0) return res.status(400).json({ error: "Tidak ada perubahan data." });

    await user.update(patch);
    audit(req, "UPDATE_PROFILE", "user", user.id, { berubah: changed.join(", ") });
    const fresh = await User.findByPk(user.id);
    const profile = fresh.toJSON();
    if (profile.uptId) {
      const upt = await Upt.findByPk(profile.uptId);
      if (upt) profile.upt = upt.toJSON();
    }
    res.json({ message: "Profil berhasil diperbarui.", user: profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memperbarui profil." });
  }
});

/** POST /api/auth/change-password - ubah password user login (wajib password lama) */
router.post("/change-password", authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !String(currentPassword).trim()) {
    return res.status(400).json({ error: "Password lama wajib diisi untuk keamanan." });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "Password baru minimal 6 karakter." });
  }

  try {
    const user = await User.scope('withPassword').findByPk(req.uid);
    if (!user) return res.status(404).json({ error: "User tidak ditemukan." });

    // Verify current password (wajib — mencegah pengambilalihan via token curian)
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Password lama salah." });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);
    await user.update({ password: hash });

    audit(req, "CHANGE_PASSWORD", "auth", user.id, null);
    res.json({ message: "Password berhasil diubah." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengubah password." });
  }
});

module.exports = router;
