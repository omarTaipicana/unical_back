const catchError = require('../utils/catchError');
const { col } = require("sequelize");
const Certificado = require("../models/Certificado");
const Inscripcion = require("../models/Inscripcion");
const Pagos = require("../models/Pagos");
const User = require("../models/User");

const getAll = catchError(async (req, res) => {
  const rows = await Certificado.findAll({
    include: [
      {
        model: Inscripcion,
        as: "inscripcion",
        include: [
          {
            model: User,
            as: "user",
            attributes: ["cI", "firstName", "lastName", "grado"],
          },
          {
            model: Pagos,
            as: "pago",
            attributes: ["pagoUrl", "valorDepositado"],
            where: { verificado: true },
            required: false,
          },
        ],
      },
    ],
  });

  const results = rows.map((r) => {
    const obj = r.get({ plain: true });

    const u = obj.inscripcion?.user;

    // ✅ leer el alias correcto: "pago" (no "pagos")
    const pagoRaw = obj.inscripcion?.pago;
    const pagosArr = Array.isArray(pagoRaw) ? pagoRaw : pagoRaw ? [pagoRaw] : [];

    // si quieres una sola URL, toma la última
    const pagoUrl = pagosArr.length ? pagosArr[pagosArr.length - 1].pagoUrl : null;
    const deposito = pagosArr.length ? pagosArr[pagosArr.length - 1].valorDepositado : null;

    return {
      id: obj.id,
      curso: obj.curso,
      grupo: obj.grupo,
      certificadoCreatedAt: obj.createdAt,
      url: obj.url,
      entregado: obj.entregado,

      cedula: u?.cI ?? null,
      nombres: u?.firstName ?? null,
      apellidos: u?.lastName ?? null,
      grado: u?.grado ?? null,

      urlDeposito: pagoUrl,
      deposito: deposito,
    };
  });

  return res.json(results);
});






const create = catchError(async(req, res) => {
    const result = await Certificado.create(req.body);
    return res.status(201).json(result);
});

const getOne = catchError(async(req, res) => {
    const { id } = req.params;
    const result = await Certificado.findByPk(id);
    if(!result) return res.sendStatus(404);
    return res.json(result);
});

const remove = catchError(async(req, res) => {
    const { id } = req.params;
    await Certificado.destroy({ where: {id} });
    return res.sendStatus(204);
});

const update = catchError(async(req, res) => {
    const { id } = req.params;
    const result = await Certificado.update(
        req.body,
        { where: {id}, returning: true }
    );
    if(result[0] === 0) return res.sendStatus(404);
    return res.json(result[1][0]);
});

module.exports = {
    getAll,
    create,
    getOne,
    remove,
    update
}