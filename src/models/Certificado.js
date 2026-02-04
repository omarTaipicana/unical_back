const { DataTypes } = require("sequelize");
const sequelize = require("../utils/connection");

const Certificado = sequelize.define("certificado", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
  },
  curso: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  grupo: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  entregado: {
    type: DataTypes.STRING,
    allowNull: false,
  },
});

module.exports = Certificado;
