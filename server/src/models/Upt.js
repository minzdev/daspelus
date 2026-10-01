const { DataTypes } = require('sequelize');
const sequelize = require('../lib/database');

const Upt = sequelize.define(
  'Upt',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    province: {
      type: DataTypes.STRING,
      allowNull: true,
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
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
    },
  },
  {
    tableName: 'upts',
  }
);

module.exports = Upt;
