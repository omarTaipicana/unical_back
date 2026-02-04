const { getAll, create, getOne, remove, update } = require('../controllers/contactanos.controllers');
const express = require('express');

const contactanosRouter = express.Router();

contactanosRouter.route('/contactanos')
    .get(getAll)
    .post(create);

contactanosRouter.route('/contactanos/:id')
    .get(getOne)
    .delete(remove)
    .put(update);

module.exports = contactanosRouter;