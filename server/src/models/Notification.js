const { DataTypes } = require('sequelize');
const sequelize = require('../lib/database');

const Notification = sequelize.define(
  'Notification',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    // Jika notifikasi ditujukan ke pengguna spesifik
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
    },
    // Target Role: 'SUPER_ADMIN', 'PUSBANG', 'PIMPINAN_UPT', 'UPT_ADMIN', 'ALL'
    recipientRole: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'recipient_role',
    },
    // Jika Pusbang (misal 'laut', 'darat', 'udara')
    recipientMatra: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'recipient_matra',
    },
    // Jika UPT (Pimpinan UPT / Admin UPT)
    recipientUptId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'recipient_upt_id',
    },
    // Data Pengirim
    senderId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'sender_id',
    },
    senderName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'sender_name',
    },
    // Konten
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    // Kategori: 'request', 'approval', 'rejection', 'info', 'forward'
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'info',
    },
    // Tipe Modul: 'target_pk', 'realisasi', 'unlock_request', 'taruna', 'penyerapan'
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'general',
    },
    // Link rute navigasi di frontend
    link: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // Metadata fleksibel (JSON)
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    // Daftar user ID yang telah membaca notifikasi ini
    readBy: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      field: 'read_by',
    },
  },
  {
    tableName: 'notifications',
    timestamps: true,
    underscored: true,
  }
);

module.exports = Notification;
