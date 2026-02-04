const catchError = require("../utils/catchError");
const sendEmail = require("../utils/sendEmail");

const path = require("path");
const fs = require("fs");
const Pagos = require("../models/Pagos");
const Inscripcion = require("../models/Inscripcion");
const Course = require("../models/Course");
const User = require("../models/User");
const Certificado = require("../models/Certificado");
const generarCertificado = require("../utils/generarCertificado");


const { Op, Sequelize } = require("sequelize");






const getAll = catchError(async (req, res) => {
  const {
    curso,
    verificado,
    moneda,
    distintivo,
    entregado,
    busqueda,
    fechaInicio,
    fechaFin,
    certificado, // nuevo query
  } = req.query;

  // filtros de Pagos
  const pagosWhere = {};
  if (curso) pagosWhere.curso = curso;
  if (verificado) pagosWhere.verificado = verificado === "true";
  if (moneda) pagosWhere.moneda = moneda === "true";
  if (distintivo) pagosWhere.distintivo = distintivo === "true";
  if (entregado) pagosWhere.entregado = entregado === "true";

  if (fechaInicio || fechaFin) {
    pagosWhere.createdAt = {};
    if (fechaInicio) {
      pagosWhere.createdAt[Op.gte] = new Date(fechaInicio);
    }
    if (fechaFin) {
      const fin = new Date(fechaFin);
      fin.setDate(fin.getDate() + 2); // sumamos 1 día
      pagosWhere.createdAt[Op.lt] = fin; // usamos menor estricto
    }
  }

  // filtros de User
  const userWhere = busqueda
    ? {
        [Op.or]: [
          { grado: { [Op.iLike]: `%${busqueda}%` } },
          { firstName: { [Op.iLike]: `%${busqueda}%` } },
          { lastName: { [Op.iLike]: `%${busqueda}%` } },
          { cI: { [Op.iLike]: `%${busqueda}%` } },
        ],
      }
    : undefined;

  // traer pagos con inscripción y usuario
  let results = await Pagos.findAll({
    where: pagosWhere,
    attributes: [
      "id",
      "curso",
      "distintivo",
      "moneda",
      "valorDepositado",
      "entidad",
      "idDeposito",
      "pagoUrl",
      "verificado",
      "confirmacion",
      "entregado",
      "observacion",
      "createdAt",
      "inscripcionId",
      "usuarioEdicion",
    ],
    include: [
      {
        model: Inscripcion,
        required: true,
        attributes: ["id", "curso", "userId"],
        include: [
          {
            model: User,
            required: true,
            attributes: ["grado", "firstName", "lastName", "cI", "cellular", "email"],
            where: userWhere || undefined,
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  // 🔁 AHORA certificados se relacionan por inscripcionId
  const certificados = await Certificado.findAll({
    attributes: ["id", "inscripcionId", "url"], // ya no usamos cedula/curso
    raw: true,
  });

  // mapear resultados y hacer match por inscripcionId
  results = results.map((pago) => {
    const inscripcion = pago.inscripcion;
    const user = inscripcion.user;

    const cert =
      certificados.find(
        (c) => c.inscripcionId === inscripcion.id // clave: relacionar por inscripcion.id
      ) || null;

    return {
      ...pago.toJSON(),
      certificado: !!cert,
      urlCertificado: cert ? cert.url : null,
    };
  });

  // filtrar por certificado si se pasó query
  if (certificado === "true") results = results.filter((p) => p.certificado);
  if (certificado === "false") results = results.filter((p) => !p.certificado);

  return res.json(results);
});








const getDashboardPagos = catchError(async (req, res) => {
  const { desde, hasta, curso, verificado } = req.query;

  // Filtro de fechas en Pagos
  const where = { confirmacion: true };
  if (desde || hasta) {
    where.createdAt = {};
    if (desde) where.createdAt[Op.gte] = new Date(desde);
    if (hasta) {
      const hastaDate = new Date(hasta);
      hastaDate.setDate(hastaDate.getDate() + 1);
      where.createdAt[Op.lt] = hastaDate;
    }
  }

  // Filtro por verificación
  if (verificado === "verificados") where.verificado = true;
  if (verificado === "no_verificados") where.verificado = false;

  // Filtro por curso
  if (curso && curso !== "todos") where.curso = curso;

  // Traemos los pagos filtrados con relaciones
  const pagos = await Pagos.findAll({
    where,
    order: [["createdAt", "ASC"]],
    include: [
      {
        model: Inscripcion,
        include: [
          {
            model: User,
            attributes: ["grado"], // aquí está el grado
          },
        ],
      },
    ],
  });

  // Conteo monedas y distintivos
  const countMonedas = pagos.filter((p) => p.moneda).length;
  const countDistintivos = pagos.filter((p) => p.distintivo).length;

  const totalMonedas = countMonedas * 15;
  const totalDistintivos = countDistintivos * 10;
  const totalConceptos = totalMonedas + totalDistintivos;

  const totalPagos = pagos.reduce(
    (acc, p) => acc + (p.valorDepositado || 0),
    0
  );
  const totalPagosNum = pagos.length;
  const pagosUnicosPorCurso = new Set(
    pagos.map((p) => `${p.inscripcionId}-${p.curso}`)
  );

  // Conteo de pagos únicos (uno por curso por inscrito)
  const totalPagosDinstint = pagosUnicosPorCurso.size;
  const totalPagosVerificados = pagos.filter((p) => p.verificado).length;

  const conteoDistMoneda = [
    {
      name: "Distintivo",
      value: countDistintivos,
      entregado: pagos.filter((p) => p.distintivo && p.entregado).length,
    },
    {
      name: "Moneda",
      value: countMonedas,
      entregado: pagos.filter((p) => p.moneda && p.entregado).length,
    },
  ];

  // Evolutivo diario
  const pagosPorFechaMap = {};
  pagos.forEach((p) => {
    const fecha = new Date(p.createdAt);
    fecha.setHours(fecha.getHours() - 5); // ajustar a hora local
    const fechaStr = fecha.toISOString().split("T")[0];
    pagosPorFechaMap[fechaStr] =
      (pagosPorFechaMap[fechaStr] || 0) + (p.valorDepositado || 0);
  });
  const pagosPorFecha = Object.entries(pagosPorFechaMap)
    .map(([fecha, total]) => ({ fecha, total }))
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  // Pagos por curso
  const pagosPorCursoCount = {};
  pagos.forEach((p) => {
    const c = p.curso || "Sin curso";
    pagosPorCursoCount[c] = (pagosPorCursoCount[c] || 0) + 1;
  });
  const pagosPorCurso = Object.entries(pagosPorCursoCount).map(
    ([curso, cantidad]) => ({ curso, cantidad })
  );

  // Pagos por grado (desde la relación con inscripcion.user.grado)
  const pagosPorGradoCount = {};
  pagos.forEach((p) => {
    const grado = p.inscripcion?.user?.grado || "Sin grado";
    pagosPorGradoCount[grado] = (pagosPorGradoCount[grado] || 0) + 1;
  });
  const pagosPorGrado = Object.entries(pagosPorGradoCount).map(
    ([grado, cantidad]) => ({ grado, cantidad })
  );

  return res.json({
    totalPagos,
    totalPagosNum,
    totalPagosDinstint,
    totalPagosVerificados,
    totalConceptos,
    totalMonedas,
    totalDistintivos,
    conteoDistMoneda,
    pagosPorFecha,
    pagosPorCurso,
    pagosPorGrado,
  });
});

const validatePago = catchError(async (req, res) => {
  const { cedula, code } = req.body;

  if (!cedula || !code) {
    return res.status(400).json({ error: "Faltan parámetros (cedula y code)" });
  }

  // Buscar usuario por cédula
  const user = await User.findOne({ where: { cI: cedula } });
  if (!user) {
    return res.status(200).json({
      exists: false,
      pagos: [],
      inscripcion: null,
      message: "⚠️ No existe registros con esa cédula",
    });
  }

  // Buscar inscripción del usuario en el curso específico
  const inscripcion = await Inscripcion.findOne({
    where: { userId: user.id, curso: code },
  });

  if (!inscripcion) {
    return res.status(200).json({
      exists: false,
      pagos: [],
      inscripcion: null,
      message: `⚠️ No existe inscripción de la cédula ${cedula} en este curso`,
    });
  }

  // Buscar pagos de esa inscripción
  const pagos = await Pagos.findAll({
    where: { inscripcionId: inscripcion.id },
    order: [["createdAt", "DESC"]],
  });

  if (pagos.length > 0) {
    return res.status(200).json({
      exists: true,
      pagos,
      inscripcion,
      user,
      message: "✅ Inscripción encontrada con pagos registrados",
    });
  }

  return res.status(200).json({
    exists: true,
    pagos: [],
    inscripcion,
    user,
    message: "✅ Inscripción encontrada, aún no tiene pagos",
  });
});

const create = catchError(async (req, res) => {
  if (!req.file)
    return res.status(400).json({ message: "debes subir un archivo" });
  const {
    inscripcionId,
    curso,
    valorDepositado,
    confirmacion,
    verificado,
    distintivo,
    moneda,
    entregado,
    observacion,
    usuarioEdicion,
  } = req.body;
  const url = req.fileUrl;

  const inscrito = await Inscripcion.findByPk(inscripcionId);
  const user = await User.findByPk(inscrito.userId);
  const cursoData = await Course.findByPk(inscrito.courseId);
  const result = await Pagos.create({
    inscripcionId,
    curso,
    valorDepositado,
    confirmacion,
    verificado,
    distintivo,
    moneda,
    entregado,
    observacion,
    usuarioEdicion,
    pagoUrl: url,
  });

  const incluyeMoneda =
    moneda === true || moneda === "true" || moneda === 1 || moneda === "1";
  const incluyeDistintivo =
    distintivo === true ||
    distintivo === "true" ||
    distintivo === 1 ||
    distintivo === "1";

  await sendEmail({
    to: user.email,
    subject: "✅ Pago registrado - EDUKA",
    html: `
  <div style="font-family: Arial, sans-serif; background-color: #f0f8ff; padding: 20px; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1); overflow: hidden;">
      
      <!-- Encabezado con logo -->
      <div style="text-align: center; background-color: #1B326B; padding: 20px;">
        <img src="https://res.cloudinary.com/desgmhmg4/image/upload/v1765358711/eduka_2026_kh3h9e.png" alt="EDUKA" style="width: 150px;" />
      </div>

      <!-- Cuerpo del mensaje -->
      <div style="padding: 30px; text-align: center;">
        <h2 style="color: #1B326B;">¡Hola ${user.firstName} ${user.lastName
      }!</h2>
        <p style="font-size: 16px; line-height: 1.6;">
          Hemos recibido tu comprobante de pago por el curso <strong>"${cursoData.nombre
      }"</strong>.
        </p>
        <p style="font-size: 16px; line-height: 1.6;">
          <strong>Valor depositado:</strong> $${valorDepositado}
        </p>
        ${incluyeMoneda || incluyeDistintivo
        ? `<p style="font-size: 16px; line-height: 1.6;">Incluye: ${[
          incluyeMoneda ? "🪙 Moneda conmemorativa" : "",
          incluyeDistintivo ? "🎖️ Distintivo" : "",
        ]
          .filter(Boolean)
          .join(" y ")}</p>`
        : ""
      }
        <p style="font-size: 16px; line-height: 1.6;">
          Una vez validado el pago, se emitirá tu certificado. En caso de haber solicitado reconocimientos físicos, recibirás otro correo cuando estén disponibles para su retiro.
        </p>

        <!-- Botón para ver comprobante -->
        <div style="margin-top: 30px;">
          <a href="${url}" target="_blank" style="background-color: #1B326B; color: white; padding: 12px 20px; border-radius: 5px; text-decoration: none;">
            Ver comprobante de pago
          </a>
        </div>

        <p style="margin-top: 30px; font-size: 14px; color: #666;">
          Si no realizaste este registro de pago, por favor comunícate con nosotros.
        </p>
      </div>

      <!-- Pie -->
      <div style="background-color: #f0f0f0; text-align: center; padding: 15px; font-size: 12px; color: #999;">
        © ${new Date().getFullYear()} EDUKA. Todos los derechos reservados.
      </div>

    </div>
  </div>
  `,
  });

  const io = req.app.get("io");
  if (io) io.emit("pagoCreado", result);

  return res.status(201).json(result);
});




const getOne = catchError(async (req, res) => {
  const { id } = req.params;
  const result = await Pagos.findByPk(id);
  if (!result) return res.sendStatus(404);
  return res.json(result);
});

const remove = catchError(async (req, res) => {
  const { id } = req.params;
  const Pago = await Pagos.findByPk(id);
  if (!Pago) return res.status(400).json({ message: "No existe el ID" });

  if (Pago.pagoUrl) {
    const imagePath = path.join(
      __dirname,
      "..",
      "..",
      "uploads",
      "pagos",
      path.basename(Pago.pagoUrl)
    );

    fs.unlink(imagePath, (err) => {
      if (err) {
        console.error("Error al eliminar el archivo:", err);
        return res
          .status(500)
          .json({ message: "Error al eliminar el archivo" });
      }
    });
  }
  await Pago.destroy();

  return res.sendStatus(204);
});




const update = catchError(async (req, res) => {
  const { id } = req.params;

  // 1. Traer el pago ANTES de actualizar
  const pagoOriginal = await Pagos.findByPk(id);

  if (!pagoOriginal) {
    return res.status(404).json({ message: "Pago no encontrado" });
  }

  const verificadoAntes = pagoOriginal.verificado; // puede ser true/false/null

  // =========================
  // ✅ VALIDACIÓN NUEVA (entidad + idDeposito únicos)
  // sin romper tu funcionalidad actual
  // =========================

  // Tomamos valores "finales" que quedarían tras el update:
  const entidadFinal =
    req.body.entidad !== undefined ? req.body.entidad : pagoOriginal.entidad;
  const idDepositoFinal =
    req.body.idDeposito !== undefined
      ? req.body.idDeposito
      : pagoOriginal.idDeposito;

  // Solo validamos si ambos existen (no vacíos)
  if (
    entidadFinal !== undefined &&
    entidadFinal !== null &&
    String(entidadFinal).trim() !== "" &&
    idDepositoFinal !== undefined &&
    idDepositoFinal !== null &&
    String(idDepositoFinal).trim() !== ""
  ) {
    const existe = await Pagos.findOne({
      where: {
        entidad: entidadFinal,
        idDeposito: idDepositoFinal,
        id: { [Op.ne]: id }, // 👈 excluye el mismo pago
      },
    });

    if (existe) {
      return res.status(400).json({
        message:
          "Ya existe un pago registrado con ese ID de depósito para la entidad seleccionada.",
      });
    }
  }

  // 2. Actualizar el pago con los datos del body
  let pagosActualizados;
  try {
    const [rowsUpdated, updated] = await Pagos.update(req.body, {
      where: { id },
      returning: true,
    });

    if (rowsUpdated === 0) {
      return res.status(404).json({ message: "Pago no encontrado" });
    }

    pagosActualizados = updated;
  } catch (error) {
    // Si tienes índice único en BD, esto captura el choque también
    if (error?.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({
        message:
          "Ya existe un pago registrado con ese ID de depósito para la entidad seleccionada.",
      });
    }
    throw error;
  }

  const pagoActualizado = pagosActualizados[0];
  const verificadoDespues = pagoActualizado.verificado;

  // 3. Emitir evento de pago actualizado (lo que ya tenías)
  const io = req.app.get("io");
  if (io) io.emit("pagoActualizado", pagoActualizado);

  // 4. Detectar cambio de verificado: false -> true
  if (!verificadoAntes && verificadoDespues) {
    try {
      await generarCertificado(pagoActualizado.id);
    } catch (error) {
      console.error("Error generando certificado:", error);
      // no rompemos la respuesta al cliente
    }
  }

  return res.json(pagoActualizado);
});








module.exports = {
  getAll,
  getDashboardPagos,
  validatePago,
  create,
  getOne,
  remove,
  update,
};
