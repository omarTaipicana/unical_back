const { DataTypes } = require("sequelize");
const sequelize = require("../utils/connection");

const Course = sequelize.define("course", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
  },
  nombre: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  sigla: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  objetivo: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  vigente: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },

});

module.exports = Course;
