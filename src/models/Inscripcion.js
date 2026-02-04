const { DataTypes } = require("sequelize");
const sequelize = require("../utils/connection");

const Inscripcion = sequelize.define("inscripcion", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
  },
  aceptacion: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  curso: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  observacion: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  usuarioEdicion: {
    type: DataTypes.STRING,
    allowNull: true,
  },
});

module.exports = Inscripcion;
