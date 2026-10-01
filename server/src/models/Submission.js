const { DataTypes } = require('sequelize');
const sequelize = require('../lib/database');

const Submission = sequelize.define(
  'Submission',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    submissionId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      field: 'submission_id',
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
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'draft',
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
    rejectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'rejected_at',
    },
    rejectNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'reject_note',
    },
    locked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    realSnapshot: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'real_snapshot',
    },
    targetSnapshot: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'target_snapshot',
    },
  },
  {
    tableName: 'submissions',
  }
);

module.exports = Submission;
