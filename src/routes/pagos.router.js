const { getAll, getDashboardPagos, validatePago, create, getOne, remove, update } = require('../controllers/pagos.controllers');
const express = require('express');
const upload = require("../utils/multer")
const verifyJWT = require("../utils/verifyJWT")



const pagosRouter = express.Router();

pagosRouter.route('/pagos')
    .get(getAll)
    .post(upload.upload.single("imagePago"), upload.generateFileUrl, create);

pagosRouter.route('/pagos_dashboard')
    .get(getDashboardPagos)

pagosRouter.route('/pagovalidate')
    .post(validatePago);

pagosRouter.route('/pagos/:id')
    .get(getOne)
    .delete(remove)
    .put(verifyJWT, update);

module.exports = pagosRouter;