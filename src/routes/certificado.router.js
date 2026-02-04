const { getAll, create, getOne, remove, update } = require('../controllers/certificado.controllers');
const express = require('express');
const verifyJWT = require("../utils/verifyJWT")


const certificadoRouter = express.Router();

certificadoRouter.route('/certificados')
    .get(getAll)
    .post(create);

certificadoRouter.route('/certificados/:id')
    .get(getOne)
    .delete(remove)
    .put(verifyJWT, update);

module.exports = certificadoRouter;