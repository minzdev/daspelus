const jwt = require("jsonwebtoken");
const { User, Upt } = require("../models");

const JWT_SECRET = process.env.JWT_SECRET || "daspeslus_secret";

/**
 * Verifikasi JWT token dari header Authorization: Bearer <token>.
 * Load data user dari MySQL ke req.user.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "Token tidak ditemukan. Silakan login ulang." });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Sesi berakhir. Silakan login ulang." });
      }
      return res.status(401).json({ error: "Token tidak valid." });
    }

    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: "User tidak ditemukan." });
    }

    if (user.isActive === false) {
      return res.status(403).json({ error: "Akun Anda telah dinonaktifkan. Hubungi admin BPSDMP." });
    }

    // Load data UPT jika user terkait UPT
    const profile = user.toJSON();
    if (profile.uptId) {
      const upt = await Upt.findByPk(profile.uptId);
      if (upt) {
        profile.upt = upt.toJSON();
      }
    }

    req.user = profile;
    req.uid = user.id;
    next();
  } catch (err) {
    console.error("[authenticate]", err.message);
    return res.status(401).json({ error: "Token tidak valid." });
  }
}

// Helpers role
function isSuperAdmin(u) { return u?.role === 'SUPER_ADMIN' || u?.role === 'ADMIN'; }
function isPusbang(u) { return u?.role === 'PUSBANG'; }
function isPimpinan(u) { return u?.role === 'PIMPINAN_UPT' || u?.role === 'PIMPINAN'; }
function isUptAdmin(u) { return u?.role === 'UPT_ADMIN' || u?.role === 'UPT'; }

/** Hanya super admin BPSDMP. */
function requireSuperAdmin(req, res, next) {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: "Akses khusus Super Admin BPSDMP." });
  }
  next();
}
/** Alias admin (backward compat) */
function requireAdmin(req, res, next) {
  return requireSuperAdmin(req, res, next);
}

/** Hanya PUSBANG (darat/laut/udara). */
function requirePusbang(req, res, next) {
  if (!isPusbang(req.user)) {
    return res.status(403).json({ error: "Akses khusus Admin Pusbang." });
  }
  next();
}

/** Hanya Pimpinan UPT. */
function requirePimpinan(req, res, next) {
  if (!isPimpinan(req.user)) {
    return res.status(403).json({ error: "Akses khusus Pimpinan UPT." });
  }
  next();
}

/** Hanya UPT_ADMIN. */
function requireUptAdmin(req, res, next) {
  if (!isUptAdmin(req.user)) {
    return res.status(403).json({ error: "Akses khusus Admin UPT." });
  }
  next();
}
/** Alias UPT (backward compat) */
function requireUpt(req, res, next) {
  if (isUptAdmin(req.user) || isPimpinan(req.user)) return next();
  return res.status(403).json({ error: "Akses khusus user UPT." });
}

/** Pusbang atau Super Admin */
function requirePusbangOrSuper(req, res, next) {
  if (isSuperAdmin(req.user) || isPusbang(req.user)) return next();
  return res.status(403).json({ error: "Akses khusus Pusbang / Super Admin." });
}

/** Pimpinan atau Super Admin */
function requirePimpinanOrSuper(req, res, next) {
  if (isSuperAdmin(req.user) || isPimpinan(req.user)) return next();
  return res.status(403).json({ error: "Akses khusus Pimpinan UPT / Super Admin." });
}

module.exports = {
  authenticate,
  requireAdmin,
  requireSuperAdmin,
  requirePusbang,
  requirePimpinan,
  requireUpt,
  requireUptAdmin,
  requirePusbangOrSuper,
  requirePimpinanOrSuper,
  isSuperAdmin,
  isPusbang,
  isPimpinan,
  isUptAdmin,
};
