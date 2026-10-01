const { DataTypes } = require('sequelize');
const sequelize = require('../lib/database');

const Prodi = sequelize.define(
  'Prodi',
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
    kodeProdi: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'kode_prodi',
    },
    namaProdi: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'nama_prodi',
    },
    jenjang: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'D4',
    },
    matra: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
    },
  },
  {
    tableName: 'prodis',
  }
);

module.exports = Prodi;
