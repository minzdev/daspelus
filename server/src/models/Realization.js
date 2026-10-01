const { DataTypes } = require('sequelize');
const sequelize = require('../lib/database');

const Realization = sequelize.define(
  'Realization',
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
    locked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    inputBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'input_by',
    },
    inputByName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'input_by_name',
    },
  },
  {
    tableName: 'realizations',
    indexes: [
      {
        unique: true,
        fields: ['upt_id', 'year', 'month', 'program_id'],
        name: 'uniq_real_upt_year_month_program',
      },
    ],
  }
);

module.exports = Realization;
