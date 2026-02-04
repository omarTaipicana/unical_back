const { getAll, create, getOne, remove, update } = require('../controllers/variables.controllers');
const express = require('express');

const variablesRouter = express.Router();

variablesRouter.route('/variables')
    .get(getAll)
    .post(create);

variablesRouter.route('/variables/:id')
    .get(getOne)
    .delete(remove)
    .put(update);

module.exports = variablesRouter;