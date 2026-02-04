const { getAll, getDashboardInscripciones, getDashboardObservaciones, validateUser, create, getOne, remove, update } = require('../controllers/inscripcion.controllers');
const express = require('express');
const verifyJWT = require("../utils/verifyJWT")


const inscripcionRouter = express.Router();

inscripcionRouter.route('/inscripcion')
    .get(getAll)
    .post(create);

inscripcionRouter.route('/inscripcion_dashboard')
    .get(getDashboardInscripciones)

inscripcionRouter.route('/inscripcion_dashboard_observacion')
    .get(getDashboardObservaciones)

inscripcionRouter.route('/validate')
    .post(validateUser);

inscripcionRouter.route('/inscripcion/:id')
    .get(getOne)
    .delete(remove)
    .put(verifyJWT, update);

module.exports = inscripcionRouter;