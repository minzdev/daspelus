const { DataTypes } = require('sequelize');
const sequelize = require('../lib/database');

/**
 * TargetRevision — snapshot nilai Target PK (month=0, single-input) setiap kali
 * UPT menyimpan (PUT /targets/my), import Excel, atau menghapus target program.
 * Dipakai admin untuk kolom "Riwayat Perubahan PK": PK Awal (revisi #1) vs
 * PK Revisi (revisi terakhir). Hanya snapshot bila nilai BERUBAH dari revisi
 * terakhir agar riwayat tidak penuh duplikat.
 */
const TargetRevision = sequelize.define(
  'TargetRevision',
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
    revisionNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'revision_no',
    },
    trigger: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'save',
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
    items: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by',
    },
    createdByName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'created_by_name',
    },
  },
  {
    tableName: 'target_revisions',
    indexes: [
      {
        fields: ['upt_id', 'year', 'revision_no'],
        name: 'idx_target_rev_upt_year_no',
      },
    ],
  }
);

module.exports = TargetRevision;
