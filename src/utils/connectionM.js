const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelizeM = new Sequelize(process.env.DATABASEM_URL)

module.exports = sequelizeM;