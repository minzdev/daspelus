const { DataTypes } = require('sequelize');
const sequelize = require('../lib/database');

const GradAbsorption = sequelize.define(
  'GradAbsorption',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    submissionId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'submission_id',
    },
    uptId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'upt_id',
    },
    prodiId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'prodi_id',
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    quarter: {
      type: DataTypes.INTEGER, // LEGACY triwulan 1-4; untuk data bulanan diisi turunan = ceil(month/3)
      allowNull: false,
    },
    month: {
      type: DataTypes.INTEGER, // 1-12 untuk periode bulanan; NULL = data era triwulan
      allowNull: true,
      defaultValue: null,
    },
    namaTaruna: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'nama_taruna',
    },
    nimTaruna: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'nim_taruna',
    },
    tarunaId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'taruna_id',
    },
    tahunLulus: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'tahun_lulus',
    },
    kategoriSerap: {
      type: DataTypes.ENUM('pns', 'ppnpn', 'bumn_bumd', 'swasta', 'belum_bekerja'),
      allowNull: false,
      field: 'kategori_serap',
    },
    instansiBekerja: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'instansi_bekerja',
    },
    keterangan: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'grad_absorptions',
  }
);

module.exports = GradAbsorption;
