const { DataTypes } = require('sequelize');
const sequelize = require('../lib/database');

const Taruna = sequelize.define(
  'Taruna',
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
    prodiId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'prodi_id',
    },
    nama: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    nomorTaruna: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'nomor_taruna',
    },
    tahunLulus: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'tahun_lulus',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
    },
  },
  {
    tableName: 'tarunas',
    indexes: [
      {
        unique: true,
        fields: ['upt_id', 'nomor_taruna'],
        name: 'uq_upt_nomor_taruna',
      },
    ],
  }
);

module.exports = Taruna;
