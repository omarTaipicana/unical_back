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
  subject: "✅ Pago registrado - UNICAL",
  html: `
  <div style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 20px; color: #333;">
    
     <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 18px rgba(0,0,0,0.08); overflow: hidden;">
      
      <!-- Header -->
      <div style="
        text-align: center;
        background: radial-gradient(circle at center, #ffffff 0%, #e8ecff 30%, #2f3f8f 70%, #1B2A5B 100%);
        padding: 50px 20px;
      ">
        
        <img src="https://res.cloudinary.com/desgmhmg4/image/upload/v1775011838/unical-sf_ngqle3.png"
             alt="UNICAL"
             style="
               width: 240px;
               max-width: 100%;
               display: block;
               margin: 0 auto;
               filter: drop-shadow(0px 6px 12px rgba(0,0,0,0.25));
             " />

      </div>

      <!-- Body -->
      <div style="padding: 35px; text-align: center;">
        
        <h1 style="color: #1B2A5B; margin-bottom: 10px;">
          ¡Hola ${user.firstName} ${user.lastName}!
        </h1>

        <h2 style="font-weight: normal; margin-bottom: 15px; color:#444;">
          ✅ Hemos recibido tu registro de pago
        </h2>

        <div style="
          width: 60px;
          height: 4px;
          background: #A4C639;
          margin: 15px auto 25px;
          border-radius: 2px;
        "></div>

        <h2 style="color: #A4C639; margin-bottom: 25px;">
          "${cursoData.nombre}"
        </h2>

        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 18px;">
          Hemos recibido correctamente tu comprobante de pago correspondiente al curso 
          <strong>"${cursoData.nombre}"</strong>.
        </p>

        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 18px;">
          <strong>Valor depositado:</strong> $${valorDepositado}
        </p>

        ${incluyeMoneda || incluyeDistintivo
          ? `<p style="font-size: 16px; line-height: 1.6; margin-bottom: 18px;">
              <strong>Incluye:</strong> ${[
                incluyeMoneda ? "🪙 Moneda conmemorativa" : "",
                incluyeDistintivo ? "🎖️ Distintivo" : "",
              ]
                .filter(Boolean)
                .join(" y ")}
            </p>`
          : ""
        }

        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 25px;">
          Nuestro equipo realizará la validación de tu pago en el menor tiempo posible. 
          Una vez confirmado, continuaremos con el proceso correspondiente de tu inscripción y certificación académica.
        </p>

        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
          En caso de haber solicitado reconocimientos físicos, recibirás una notificación adicional cuando estén disponibles para su entrega o retiro.
        </p>

        <!-- Botón -->
        <p style="text-align: center; margin-bottom: 35px;">
          <a href="${url}" target="_blank"
            style="
              background: linear-gradient(135deg, #A4C639, #8fb82f);
              color: #1B2A5B;
              padding: 14px 32px;
              text-decoration: none;
              border-radius: 8px;
              font-size: 16px;
              font-weight: 700;
              display: inline-block;
              box-shadow: 0 6px 14px rgba(0,0,0,0.15);
            ">
            📄 Ver comprobante de pago
          </a>
        </p>

        <!-- Atención -->
        <div style="margin-top: 40px; text-align: center;">
          <p style="font-size: 20px; font-weight: 700; color: #1B2A5B; margin-bottom: 10px;">
            📞 Atención Personalizada
          </p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            Si no realizaste este registro o necesitas asistencia, nuestro equipo está disponible para ayudarte.
          </p>
          <a href="https://wa.me/593980773229" target="_blank"
            style="
              background-color: #25D366;
              color: #ffffff;
              padding: 12px 28px;
              text-decoration: none;
              border-radius: 6px;
              font-size: 16px;
              font-weight: 600;
              display: inline-block;
            ">
            Escribir por WhatsApp
          </a>
        </div>

      </div>

      <!-- Footer -->
      <div style="background-color: #f0f0f0; text-align: center; padding: 20px; font-size: 13px; color: #666;">
        <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
        <p style="margin-top: 15px;">
          © ${new Date().getFullYear()} UNICAL - Universidad Integral del Caribe y América Latina
        </p>
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
