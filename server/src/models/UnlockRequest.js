const { DataTypes } = require('sequelize');
const sequelize = require('../lib/database');

const UnlockRequest = sequelize.define(
  'UnlockRequest',
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
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'capaian',
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    month: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'pending_pimpinan',
    },
    requestedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'requested_by',
    },
    requestedByName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'requested_by_name',
    },
    approvedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'approved_by',
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approved_at',
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
    trail: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
    },
  },
  {
    tableName: 'unlock_requests',
  }
);

module.exports = UnlockRequest;
