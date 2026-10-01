const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { Sequelize } = require('sequelize');

const password = process.env.DB_PASS?.trim() !== '' ? process.env.DB_PASS : null;

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  password,
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    dialect: 'mysql',
    logging: false,
    define: {
      timestamps: true,
      underscored: true,
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

/** Test koneksi ke MySQL */
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('[db] Koneksi MySQL berhasil.');
    return true;
  } catch (err) {
    console.error('[db] Gagal koneksi MySQL:', err.message);
    return false;
  }
}

module.exports = sequelize;
module.exports.testConnection = testConnection;
