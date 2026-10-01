const { DataTypes } = require('sequelize');
const sequelize = require('../lib/database');

const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM('SUPER_ADMIN', 'PUSBANG', 'PIMPINAN_UPT', 'UPT_ADMIN'),
      allowNull: false,
    },
    uptId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'upt_id',
    },
    pusbangMatra: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'pusbang_matra',
    },
    phone: {
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
    tableName: 'users',
    defaultScope: {
      attributes: { exclude: ['password'] },
    },
    scopes: {
      withPassword: {
        attributes: {},
      },
    },
  }
);

module.exports = User;
