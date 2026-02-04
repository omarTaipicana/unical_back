const catchError = require("../utils/catchError");
const sendEmail = require("../utils/sendEmail");
const { Op } = require("sequelize");
const Inscripcion = require("../models/Inscripcion");
const Course = require("../models/Course");
const User = require("../models/User");
const { crearUsuarioMoodle, inscribirUsuarioCurso, registrarUsuarioEnCurso, getMoodleCourseId } = require("../utils/moodle");


const sequelizeM = require("../utils/connectionM");
const sequelize = require("../utils/connection");

const getAll = catchError(async (req, res) => {
  const results = await Inscripcion.findAll({
    include: [
      {
        model: User,
        attributes: ["firstName", "lastName", "cI", "grado", "email"],
      },
    ],
  });

  return res.json(results);
});





const getDashboardInscripciones = catchError(async (req, res) => {
  const { desde, hasta, curso } = req.query;

  // Filtro de fechas en Inscripcion
  const where = {};
  if (desde || hasta) {
    where.createdAt = {};
    if (desde) where.createdAt[Op.gte] = new Date(desde);
    if (hasta) {
      const hastaDate = new Date(hasta);
      hastaDate.setDate(hastaDate.getDate() + 1); // sumamos 1 día
      where.createdAt[Op.lt] = hastaDate; // menor que el siguiente día
    }
  }

  // ✅ Filtro por curso
  if (curso && curso !== "todos") {
    where.curso = curso;
  }

  // Traemos las inscripciones con datos del usuario relacionados
  const inscripciones = await Inscripcion.findAll({
    attributes: ["createdAt", "curso"], // ✅ agrego curso para conteos
    where,
    include: [
      {
        model: User,
        as: "user", // debe coincidir con tu alias
        attributes: ["grado", "subsistema"],
      },
    ],
  });

  const totalInscritos = inscripciones.length;

  // Conteo por grado
  const inscritosPorGrado = {};
  inscripciones.forEach((i) => {
    const grado = i.user?.grado || "Sin grado";
    inscritosPorGrado[grado] = (inscritosPorGrado[grado] || 0) + 1;
  });

  // Conteo por subsistema
  const inscritosPorSubsistema = {};
  inscripciones.forEach((i) => {
    const subsistema = i.user?.subsistema || "Sin subsistema";
    inscritosPorSubsistema[subsistema] =
      (inscritosPorSubsistema[subsistema] || 0) + 1;
  });

  // ✅ Conteo por curso (para gráfico)
  const inscritosPorCursoCount = {};
  inscripciones.forEach((i) => {
    const c = i.curso || "Sin curso";
    inscritosPorCursoCount[c] = (inscritosPorCursoCount[c] || 0) + 1;
  });
  const inscritosPorCurso = Object.entries(inscritosPorCursoCount).map(
    ([curso, cantidad]) => ({ curso, cantidad })
  );

  // Conteo por día
  const inscritosPorDia = {};
  inscripciones.forEach((i) => {
    const fecha = i.createdAt.toISOString().split("T")[0]; // YYYY-MM-DD
    inscritosPorDia[fecha] = (inscritosPorDia[fecha] || 0) + 1;
  });

  // Conteo por franja horaria
  const franjas = [
    { label: "00H-03H", from: 0, to: 3 },
    { label: "04H-07H", from: 4, to: 7 },
    { label: "08H-11H", from: 8, to: 11 },
    { label: "12H-15H", from: 12, to: 15 },
    { label: "16H-19H", from: 16, to: 19 },
    { label: "20H-23H", from: 20, to: 23 },
  ];

  const inscritosPorFranjaHoraria = franjas.map((f) => ({
    label: f.label,
    value: 0,
  }));

  inscripciones.forEach((i) => {
    const hour = i.createdAt.getHours(); // hora local
    const franja = franjas.find((f) => hour >= f.from && hour <= f.to);
    if (franja) {
      const index = inscritosPorFranjaHoraria.findIndex(
        (f) => f.label === franja.label
      );
      if (index !== -1) inscritosPorFranjaHoraria[index].value++;
    }
  });

  return res.json({
    totalInscritos,
    inscritosPorGrado: Object.entries(inscritosPorGrado).map(
      ([grado, cantidad]) => ({ grado, cantidad })
    ),
    inscritosPorSubsistema: Object.entries(inscritosPorSubsistema).map(
      ([subsistema, cantidad]) => ({ subsistema, cantidad })
    ),
    inscritosPorCurso, // ✅ nuevo
    inscritosPorDia: Object.entries(inscritosPorDia).map(([fecha, cantidad]) => ({
      fecha,
      cantidad,
    })),
    inscritosPorFranjaHoraria,
  });
});





const getDashboardObservaciones = catchError(async (req, res) => {
  const { desde, hasta, curso, usuarioEdicion } = req.query;

  // Filtros dinámicos
  const where = {
    [Op.and]: [
      { observacion: { [Op.ne]: null } },
      { observacion: { [Op.ne]: "" } },
    ],
  };

  // filtro de fechas usando updatedAt
  if (desde || hasta) {
    where.updatedAt = {};
    if (desde) where.updatedAt[Op.gte] = new Date(desde);
    if (hasta) {
      const hastaDate = new Date(hasta);
      hastaDate.setDate(hastaDate.getDate() + 1);
      where.updatedAt[Op.lt] = hastaDate;
    }
  }

  // filtro por curso
  if (curso && curso !== "todos") {
    where.curso = curso;
  }

  // filtro por usuarioEdicion
  if (usuarioEdicion && usuarioEdicion !== "todos") {
    where.usuarioEdicion = usuarioEdicion;
  }

  // Obtener las inscripciones filtradas
  const observaciones = await Inscripcion.findAll({
    attributes: ["updatedAt", "usuarioEdicion", "curso", "observacion"],
    where,
    include: [
      {
        model: User,
        as: "user",
        attributes: ["firstName", "lastName"],
      },
    ],
  });

  // ---- Agrupaciones ----

  // Conteo por día
  // Agrupando observaciones por día
  const observacionesPorDia = {};

  // obtenemos las observaciones filtradas desde la DB
  observaciones.forEach((o) => {
    const fecha = o.updatedAt.toISOString().split("T")[0];
    observacionesPorDia[fecha] = (observacionesPorDia[fecha] || 0) + 1;
  });

  // convertimos a array y ordenamos por fecha ascendente
  const observacionesPorDiaOrdenado = Object.entries(observacionesPorDia)
    .map(([fecha, cantidad]) => ({ fecha, cantidad }))
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));


  // Conteo por hora
  const franjas = [
    { label: "00H-03H", from: 0, to: 3 },
    { label: "04H-07H", from: 4, to: 7 },
    { label: "08H-11H", from: 8, to: 11 },
    { label: "12H-15H", from: 12, to: 15 },
    { label: "16H-19H", from: 16, to: 19 },
    { label: "20H-23H", from: 20, to: 23 },
  ];

  const observacionesPorFranjaHoraria = franjas.map((f) => ({
    label: f.label,
    value: 0,
  }));

  observaciones.forEach((o) => {
    const hour = o.updatedAt.getHours();
    const franja = franjas.find((f) => hour >= f.from && hour <= f.to);
    if (franja) {
      const index = observacionesPorFranjaHoraria.findIndex(
        (f) => f.label === franja.label
      );
      if (index !== -1) observacionesPorFranjaHoraria[index].value++;
    }
  });

  // Conteo por usuarioEdicion
  const observacionesPorUsuario = {};
  observaciones.forEach((o) => {
    const userEdit = o.usuarioEdicion || "Desconocido";
    observacionesPorUsuario[userEdit] =
      (observacionesPorUsuario[userEdit] || 0) + 1;
  });

  return res.json({
    totalObservaciones: observaciones.length,
    observacionesPorDiaOrdenado: Object.entries(observacionesPorDiaOrdenado).map(
      ([fecha, cantidad]) => ({ fecha, cantidad })
    ),
    observacionesPorFranjaHoraria,
    observacionesPorUsuario: Object.entries(observacionesPorUsuario).map(
      ([usuario, cantidad]) => ({ usuario, cantidad })
    ),
  });
});



const validateUser = catchError(async (req, res) => {
  const { email, code } = req.body;

  if (!email) {
    return res.status(400).json({ error: "El email es requerido" });
  }

  // Buscar usuario
  const user = await User.findOne({ where: { email } });

  if (!user) {
    return res.status(200).json({
      exists: false,
      enrolled: false,
      user: null,
    });
  }

  // Buscar inscripción del usuario para el curso específico
  const inscripcion = await Inscripcion.findOne({
    where: { userId: user.id, curso: code },
  });

  if (inscripcion) {
    return res.status(200).json({
      exists: true,
      enrolled: true,
      user,
      inscripcion, // solo la inscripción del curso que coincide con code
    });
  }

  return res.status(200).json({
    exists: true,
    enrolled: false,
    user,
  });
});

const create = catchError(async (req, res) => {
  const {
    cedula,
    email,
    nombres,
    apellidos,
    celular,
    grado,
    subsistema,
    curso,
    aceptacion,
    courseId,
  } = req.body;

  if (!email || !courseId) {
    return res.status(400).json({ error: "Email y courseId son requeridos" });
  }

  // Verificar si ya existe un usuario por email
  let user = await User.findOne({ where: { email } });
  let usuarioMoodleNuevo = false;

  if (user) {
    // Actualizar campos si el usuario ya existe
    await user.update({
      cI: cedula,
      cellular: celular,
      grado,
      subsistema,
    });
  } else {
    // Si no existe, lo creo
    user = await User.create({
      cI: cedula,
      email,
      firstName: nombres,
      lastName: apellidos,
      cellular: celular,
      grado,
      subsistema,
    });
    usuarioMoodleNuevo = true;
  }

  // Buscar curso
  const course = await Course.findByPk(courseId);
  if (!course) return res.status(404).json({ error: "Curso no encontrado" });

  let inscripcion = null;

  try {
    // Intentamos crear y matricular usuario en Moodle
    const resultadoMoodle = await registrarUsuarioEnCurso({
      cedula,
      nombres,
      apellidos,
      email,
      courseShortname: course.sigla,
    });

    if (!resultadoMoodle) {
      console.error("❌ No se pudo registrar usuario en Moodle. Inscripción local NO creada.");

      return res.status(502).json({
        message: "No se pudo registrar el usuario en la plataforma académica. Por favor verifica si tu usuario Acadex registra correctamente tu cedula de identidad, contacta a soporte para modificaciones."
      });
    }
    else {
      console.log(`✅ Usuario ${cedula} inscrito en Moodle curso ${course.nombre}`);

      // Guardamos el ID Moodle en nuestra base local si no lo tiene
      if (!user.moodleId) {
        await user.update({ moodleId: resultadoMoodle.usuario.id });
      }

      // Registramos la inscripción solo si Moodle fue exitoso
      inscripcion = await Inscripcion.findOne({
        where: { userId: user.id, courseId },
      });

      if (!inscripcion) {
        inscripcion = await Inscripcion.create({
          aceptacion,
          curso,
          courseId,
          userId: user.id,
        });
      }
    }
  } catch (error) {
    console.error("Error con Moodle:", error.message);
  }

  // URL curso Moodle
  const courseIdMoodle = getMoodleCourseId(course.sigla);
  const cursoUrl = `${process.env.MOODLE_URL}/course/view.php?name=${course.sigla}`;
  // Enviar email
  await sendEmail({
    to: email,
    subject: "Inscripción confirmada - EDUKA",
    html: `
  <div style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 20px; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); overflow: hidden;">
      
      <!-- Header -->
      <div style="text-align: center; background-color: #1B326B; padding: 25px;">
        <img src="https://res.cloudinary.com/desgmhmg4/image/upload/v1765358711/eduka_2026_kh3h9e.png" alt="EDUKA" style="width: 160px;" />
      </div>
      
      <!-- Body -->
      <div style="padding: 35px; text-align: center;">
        <h1 style="color: #1B326B; margin-bottom: 10px;">¡Hola ${nombres} ${apellidos}!</h1>
        <h2 style="font-weight: normal; margin-bottom: 15px;">¡Felicitaciones por tu inscripción!</h2>
        <h2 style="color: #1B326B; margin-bottom: 25px;">"${course.nombre}"</h2>
        
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 25px;">
          Nos alegra que hayas elegido este curso para ampliar tus conocimientos. A continuación encontrarás tus credenciales de acceso a la plataforma:
        </p>

        <p style="font-size: 16px; line-height: 1.7; margin-bottom: 30px;">
          ${usuarioMoodleNuevo
        ? `🔑 <strong>Usuario:</strong> ${cedula} <br>
               🔒 <strong>Contraseña:</strong> Eduka.${cedula}*`
        : `Ya tienes un usuario registrado en nuestra plataforma. Usa tus credenciales habituales para ingresar.`}
        </p>

        <p style="text-align: center; margin-bottom: 35px;">
          <a href="${cursoUrl}" target="_blank"
            style="
              background-color: #1B326B;
              color: #ffffff;
              padding: 14px 30px;
              text-decoration: none;
              border-radius: 6px;
              font-size: 16px;
              font-weight: 600;
              display: inline-block;
              box-shadow: 0 4px 8px rgba(0,0,0,0.15);
              transition: background-color 0.3s ease;
            ">
            🎓 Ir al curso
          </a>
        </p>

        <!-- Atención personalizada WhatsApp -->
        <div style="margin-top: 40px; text-align: center;">
          <p style="font-size: 20px; font-weight: 700; color: #2c3e50; margin-bottom: 10px;">
            📞 Atención Personalizada
          </p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            Si tienes preguntas o necesitas ayuda, estamos disponibles para brindarte soporte inmediato.
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
      <div style="background-color: #f0f0f0; padding: 25px; text-align: center; font-size: 13px; color: #666;">
        <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
        <p>Si necesitas soporte adicional, visita nuestra sección de contacto:</p>
        <p style="margin-top: 10px;">
          <a href="https://eduka-educ.com" target="_blank"
            style="
              background-color: #1B326B;
              color: #ffffff;
              padding: 10px 24px;
              text-decoration: none;
              border-radius: 5px;
              font-weight: 600;
              display: inline-block;
            ">
            Contactar soporte
          </a>
        </p>
        <p style="margin-top: 20px;">© ${new Date().getFullYear()} EDUKA. Todos los derechos reservados.</p>
      </div>
      
    </div>
  </div>
  `,
  });



  const io = req.app.get("io");
  if (io) io.emit("inscripcionCreada", { inscripcion, user, course });

  return res.status(201).json({ inscripcion, user, course });
});




const getOne = catchError(async (req, res) => {
  const { id } = req.params;
  const result = await Inscripcion.findByPk(id);
  if (!result) return res.sendStatus(404);
  return res.json(result);
});

const remove = catchError(async (req, res) => {
  const { id } = req.params;
  await Inscripcion.destroy({ where: { id } });
  return res.sendStatus(204);
});

const update = catchError(async (req, res) => {
  const { id } = req.params;

  const result = await Inscripcion.update(req.body, {
    where: { id },
    returning: true,
  });

  if (result[0] === 0)
    return res.status(404).json({ message: "Inscripción no encontrada" });

  const inscripcionActualizada = result[1][0];

  // Emitir evento a todos los clientes conectados
  const io = req.app.get("io");
  if (io) io.emit("inscripcionActualizada", inscripcionActualizada);

  return res.json(inscripcionActualizada);
});

module.exports = {
  getAll,
  getDashboardInscripciones,
  getDashboardObservaciones,
  validateUser,
  create,
  getOne,
  remove,
  update,
};
