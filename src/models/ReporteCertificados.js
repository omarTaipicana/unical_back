const { DataTypes } = require('sequelize');
const sequelize = require('../utils/connection');

const ReporteCertificados = sequelize.define('reporteCertificados', {
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
    procesados: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    duplicados: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    ignorados: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    erroneos: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    detalle: {
        type: DataTypes.JSONB, // si usas Postgres, JSONB; si no, JSON
        allowNull: false,
    },
    pagoAval: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    pagoSoporte: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
});

module.exports = ReporteCertificados;