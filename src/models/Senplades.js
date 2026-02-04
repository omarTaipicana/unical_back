const { DataTypes } = require("sequelize");
const sequelize = require("../utils/connection");

const Senplades = sequelize.define(
  "senplades",
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
    },
    codSubcircuito: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    subcircuito: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    codCircuito: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    circuito: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    codCanton: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    canton: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    codDistrito: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    distrito: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    codSubzona: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    subzona: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    provincia: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    zona: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    región: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    timestamps: false,
    createdAt: false,
    updatedAt: false,
  }
);

module.exports = Senplades;
