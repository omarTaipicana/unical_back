const express = require("express");

const {
  listarCertificadosPorCurso,
  descargarCertificadosSeleccionados,
} = require("../controllers/instituto.controllers");

const {
  subirCertificadosFirmados,
} = require("../controllers/instituto.subida.controllers");

const uploadCertificados = require("../utils/multerCertificados");

const institutoRouter = express.Router();

// GET → lista todos los certificados de un curso
institutoRouter.get(
  "/instituto/certificados/:sigla",
  listarCertificadosPorCurso
);

// POST → descargar ZIP con certificados seleccionados
institutoRouter.post(
  "/instituto/certificados/:sigla/descargar",
  descargarCertificadosSeleccionados
);

// POST → subir ZIP con certificados firmados final del instituto
institutoRouter.post(
  "/instituto/certificados/:sigla/subir",
  uploadCertificados.single("zip"),
  subirCertificadosFirmados
);

module.exports = institutoRouter;
