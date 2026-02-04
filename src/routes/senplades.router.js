const { getAll, create, getOne, remove, update } = require('../controllers/senplades.controllers');
const express = require('express');
const verifyJWT = require('../utils/verifyJWT');

const senpladesRouter = express.Router();

senpladesRouter.route('/senplades')
    .get(verifyJWT, getAll)
    .post(verifyJWT,create);

senpladesRouter.route('/senplades/:id')
    .get(verifyJWT,getOne)
    .delete(verifyJWT,remove)
    .put(verifyJWT,update);

module.exports = senpladesRouter;