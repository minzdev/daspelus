const { DataTypes } = require('sequelize');
const sequelize = require('../lib/database');

/**
 * RealizationDiklat — rincian realisasi bulanan per diklat.
 * Diinput Admin UPT di menu Input Realisasi (di bawah program turunan).
 * Baris program (Realization) tetap menjadi agregat kanonis:
 *   program = jumlah seluruh diklatnya (per bulan) + isian langsung (bila tanpa diklat).
 * Laporan/monitoring membaca tabel Realization sehingga tidak berubah.
 */
const RealizationDiklat = sequelize.define(
  'RealizationDiklat',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    uptId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'upt_id',
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    month: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    programId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'program_id',
    },
    diklatId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'diklat_id',
    },
    pesertaL: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'peserta_l',
    },
    pesertaP: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'peserta_p',
    },
    lulusanL: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'lulusan_l',
    },
    lulusanP: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'lulusan_p',
    },
    totalPeserta: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_peserta',
    },
    totalLulusan: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_lulusan',
    },
    inputBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'input_by',
    },
  },
  {
    tableName: 'realization_diklats',
    indexes: [
      {
        unique: true,
        fields: ['upt_id', 'year', 'month', 'program_id', 'diklat_id'],
        name: 'uniq_realdiklat_upt_year_month_prog_diklat',
      },
      {
        fields: ['upt_id', 'year', 'month'],
        name: 'idx_realdiklat_upt_year_month',
      },
    ],
  }
);

module.exports = RealizationDiklat;
