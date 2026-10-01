const { DataTypes } = require('sequelize');
const sequelize = require('../lib/database');

const Program = sequelize.define(
  'Program',
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
    parentId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'parent_id',
    },
    parentName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'parent_name',
    },
    order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
    },
    isParent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_parent',
    },
    category: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'taruna',
    },
    targetGroup: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'semua',
      field: 'target_group',
    },
  },
  {
    tableName: 'programs',
  }
);

module.exports = Program;
