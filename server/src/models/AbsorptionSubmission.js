const { DataTypes } = require('sequelize');
const sequelize = require('../lib/database');

const AbsorptionSubmission = sequelize.define(
  'AbsorptionSubmission',
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
    quarter: {
      type: DataTypes.INTEGER, // LEGACY triwulan 1-4; untuk data bulanan diisi turunan = ceil(month/3)
      allowNull: false,
    },
    month: {
      type: DataTypes.INTEGER, // 1-12 untuk periode bulanan; NULL = data era triwulan
      allowNull: true,
      defaultValue: null,
    },
    status: {
      type: DataTypes.STRING(50),
      defaultValue: 'draft',
    },
    submittedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'submitted_at',
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approved_at',
    },
    rejectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'rejected_at',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'absorption_submissions',
    indexes: [
      {
        unique: true,
        fields: ['upt_id', 'year', 'quarter'],
      },
    ],
  }
);

module.exports = AbsorptionSubmission;
