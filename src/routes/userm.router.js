// routes/usuariosSecundarios.routes.js
const express = require('express');
const router = express.Router();
const { getAllUserM, getUserByUsernameM } = require('../controllers/userm.controllers');

router.get('/usuarios_m', getAllUserM);
router.get("/usuarios_m/:username", getUserByUsernameM);


module.exports = router;
