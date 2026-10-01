const { DataTypes } = require('sequelize');
const sequelize = require('../lib/database');

const Target = sequelize.define(
  'Target',
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
      defaultValue: 0,
    },
    programId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'program_id',
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
    isYearly: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_yearly',
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by',
    },
  },
  {
    tableName: 'targets',
    indexes: [
      {
        unique: true,
        fields: ['upt_id', 'year', 'month', 'program_id'],
        name: 'uniq_target_upt_year_month_program',
      },
    ],
  }
);

module.exports = Target;
