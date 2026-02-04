const { getAll, create, getOne, remove, update } = require('../controllers/reporteCertificados.controllers');
const express = require('express');
const verifyJWT = require("../utils/verifyJWT")


const reporteRouter = express.Router();

reporteRouter.route('/reporte')
    .get(getAll)
    .post(create);

reporteRouter.route('/reporte/:id')
    .get(getOne)
    .delete(remove)
    .put(verifyJWT, update);

module.exports = reporteRouter;