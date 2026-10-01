const { DataTypes } = require('sequelize');
const sequelize = require('../lib/database');

const TarunaSubmission = sequelize.define(
  'TarunaSubmission',
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
      type: DataTypes.INTEGER, // 1..4
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(
        'draft',
        'submitted_pimpinan',
        'approved_pimpinan',
        'rejected_pimpinan',
        'submitted_admin',
        'approved_admin',
        'rejected_admin'
      ),
      defaultValue: 'draft',
    },
    submittedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'submitted_at',
    },
    approvedPimpinanAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approved_pimpinan_at',
    },
    approvedAdminAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approved_admin_at',
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
    lockedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'locked_at',
    },
  },
  {
    tableName: 'taruna_submissions',
    indexes: [
      {
        unique: true,
        fields: ['upt_id', 'year', 'quarter'],
      },
    ],
  }
);

module.exports = TarunaSubmission;
