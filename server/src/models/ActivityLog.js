const { DataTypes } = require('sequelize');
const sequelize = require('../lib/database');

/**
 * ActivityLog — jejak audit seluruh aktivitas penting pengguna.
 * Dipantau Super Admin BPSDMP via menu Log Aktivitas.
 */
const ActivityLog = sequelize.define(
  'ActivityLog',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    actorId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'actor_id',
    },
    actorName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'actor_name',
    },
    actorRole: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'actor_role',
    },
    uptId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'upt_id',
    },
    uptCode: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'upt_code',
    },
    action: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Kode aksi, mis. LOGIN, SUBMIT_TARGET, APPROVE_REALISASI',
    },
    entity: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Kelompok objek: auth, user, target, realisasi, diklat, penyerapan, taruna, unlock, prodi',
    },
    entityId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'entity_id',
    },
    detail: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Ringkasan bebas (JSON string)',
    },
    ip: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
  },
  {
    tableName: 'activity_logs',
    updatedAt: false,
    indexes: [
      { fields: ['created_at'], name: 'idx_act_created' },
      { fields: ['actor_role'], name: 'idx_act_role' },
      { fields: ['action'], name: 'idx_act_action' },
      { fields: ['upt_id'], name: 'idx_act_upt' },
    ],
  }
);

module.exports = ActivityLog;
