const { DataTypes } = require('sequelize');
const sequelize = require('../lib/database');

/**
 * Diklat — rincian nama diklat per UPT per tahun.
 * Diinput Admin UPT sebelum input angka target.
 * Satu diklat dapat dipetakan ke lebih dari satu program (programIds = array UUID).
 * Target angka per diklat disimpan di sini, lalu diagregasi ke Target per program (month=0, single input).
 */
const Diklat = sequelize.define(
  'Diklat',
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    programIds: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      field: 'program_ids',
      comment: 'Array UUID program yang dipetakan ke diklat ini (bisa lebih dari satu)',
    },
    targetPeserta: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'target_peserta',
    },
    targetLulusan: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'target_lulusan',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by',
    },
  },
  {
    tableName: 'diklats',
    indexes: [
      {
        fields: ['upt_id', 'year'],
        name: 'idx_diklat_upt_year',
      },
    ],
  }
);

module.exports = Diklat;
