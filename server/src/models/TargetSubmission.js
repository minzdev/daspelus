const { DataTypes } = require('sequelize');
const sequelize = require('../lib/database');

const TargetSubmission = sequelize.define(
  'TargetSubmission',
  {
    id: {
      type: DataTypes.STRING(50),
      primaryKey: true,
    },
    uptId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'upt_id',
    },
    uptCode: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'upt_code',
    },
    uptName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'upt_name',
    },
    matra: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    uptType: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'upt_type',
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
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    submittedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'submitted_by',
    },
    submittedByName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'submitted_by_name',
    },
    pimpinanApprovedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'pimpinan_approved_by',
    },
    pimpinanApprovedByName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'pimpinan_approved_by_name',
    },
    approvedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'approved_by',
    },
    approvedByName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'approved_by_name',
    },
    rejectedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'rejected_by',
    },
    rejectNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'reject_note',
    },
    targetSnapshot: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'target_snapshot',
    },
  },
  {
    tableName: 'target_submissions',
  }
);

module.exports = TargetSubmission;
