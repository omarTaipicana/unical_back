const catchError = require("../utils/catchError");
const User = require("../models/User");
const sequelizeM = require("../utils/connectionM");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendEmail");
const EmailCode = require("../models/EmailCode");
const Course = require("../models/Course");
const Inscripcion = require("../models/Inscripcion");
const Pagos = require("../models/Pagos");
const Certificado = require("../models/Certificado");

// ========================== GET ALL USERS ==========================

const getAll = catchError(async (req, res) => {
  try {
    const {
      search,
      cedula,
      notaFinal,
      matriculado,
      acces,
      pagos,
      certificado,
      curso,
      page = 1,
      limit = 15,
    } = req.query;

    // --- 1. Usuarios locales
    const users = await User.findAll({ raw: true });
    if (!users || users.length === 0) {
      return res.json({
        total: 0,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: 0,
        data: [],
      });
    }

    const emails = users
      .map((u) => (u.email || "").toLowerCase())
      .filter(Boolean);

    // --- 2. Usuarios Moodle
    let moodleUsers = [];
    let moodleUserMap = {};
    let moodleUserIds = [];
    if (emails.length) {
      const [moodleUsersRes] = await sequelizeM.query(
        `
        SELECT id, LOWER(email) as email, lastaccess
        FROM mdl_user
        WHERE deleted = 0 AND suspended = 0
          AND email IN (?)
      `,
        { replacements: [emails] }
      );
      moodleUsers = moodleUsersRes || [];
      moodleUsers.forEach((m) => {
        moodleUserMap[(m.email || "").toLowerCase()] = m;
      });
      moodleUserIds = moodleUsers.map((u) => u.id);
    }

    // --- 3. Cursos matriculados
    let enrolments = [];
    if (moodleUserIds.length) {
      const [enrolRes] = await sequelizeM.query(
        `
        SELECT ue.userid, c.id AS courseid, c.shortname AS curso
        FROM mdl_user_enrolments ue
        JOIN mdl_enrol e ON ue.enrolid = e.id
        JOIN mdl_course c ON e.courseid = c.id
        WHERE ue.userid IN (?)
      `,
        { replacements: [moodleUserIds] }
      );
      enrolments = enrolRes || [];
    }

    const enrolMap = {};
    enrolments.forEach((e) => {
      const uid = String(e.userid);
      if (!enrolMap[uid]) enrolMap[uid] = {};
      enrolMap[uid][String(e.curso)] = { courseid: e.courseid };
    });

    // --- 4. Notas mod y finales
    let grades = [];
    let finalGrades = [];
    if (moodleUserIds.length) {
      const [gradesRes] = await sequelizeM.query(
        `
        SELECT gg.userid, gi.courseid, gi.itemname, gg.finalgrade
        FROM mdl_grade_grades gg
        JOIN mdl_grade_items gi ON gg.itemid = gi.id
        WHERE gg.userid IN (?) AND gi.itemtype='mod'
      `,
        { replacements: [moodleUserIds] }
      );
      grades = gradesRes || [];

      const [finalGradesRes] = await sequelizeM.query(
        `
        SELECT gg.userid, gi.courseid, gg.finalgrade
        FROM mdl_grade_grades gg
        JOIN mdl_grade_items gi ON gg.itemid = gi.id
        WHERE gg.userid IN (?) AND gi.itemtype='course'
      `,
        { replacements: [moodleUserIds] }
      );
      finalGrades = finalGradesRes || [];
    }

    const userCourseGradesMap = {};
    // Mapear notas por usuario → curso → ítem
    grades.forEach(({ userid, courseid, itemname, finalgrade }) => {
      if (
        !itemname ||
        itemname.trim() === "" ||
        itemname.toLowerCase() === "null"
      )
        return; // ignorar keys inválidas
      const uid = String(userid);
      const cid = String(courseid);
      if (!userCourseGradesMap[uid]) userCourseGradesMap[uid] = {};
      if (!userCourseGradesMap[uid][cid]) userCourseGradesMap[uid][cid] = {};
      userCourseGradesMap[uid][cid][itemname.trim()] =
        finalgrade !== null ? String(finalgrade) : null;
    });

    // Nota final
    finalGrades.forEach(({ userid, courseid, finalgrade }) => {
      const uid = String(userid);
      const cid = String(courseid);
      if (!userCourseGradesMap[uid]) userCourseGradesMap[uid] = {};
      if (!userCourseGradesMap[uid][cid]) userCourseGradesMap[uid][cid] = {};
      if (finalgrade !== null) {
        userCourseGradesMap[uid][cid]["Nota Final"] = String(finalgrade);
      }
    });

    // --- 5. Diccionario curso.sigla → nombre
    const allCourses = await Course.findAll({ raw: true });
    const courseMap = {};
    allCourses.forEach((c) => {
      if (c && c.sigla) courseMap[String(c.sigla)] = c.nombre;
    });

    // --- 6. Inscripciones + pagos + certificados
    const [inscripcionesData, pagosData, certificadosData] = await Promise.all([
      Inscripcion.findAll({ raw: true }),
      Pagos.findAll({
        raw: true,
        where: { confirmacion: true }, // 👈 solo pagos confirmados
      }),
      Certificado.findAll({ raw: true }),
    ]);

    const inscMap = {};
    inscripcionesData.forEach((i) => {
      const key = String(i.userId);
      if (!inscMap[key]) inscMap[key] = [];
      inscMap[key].push(i);
    });

    const pagosMap = {};
    pagosData.forEach((p) => {
      const key = String(p.inscripcionId);
      if (!pagosMap[key]) pagosMap[key] = [];
      pagosMap[key].push(p);
    });


    const certMap = {};
    certificadosData.forEach((c) => {
      const inscId = c.inscripcionId != null ? String(c.inscripcionId) : null;
      if (!inscId) return;

      // si llegaran a existir varios certificados por inscripcion, aquí se queda el último
      certMap[inscId] = c;
    });



    // --- 7. Filtros
    const hasCourseFilters = [
      notaFinal,
      matriculado,
      acces,
      pagos,
      certificado,
      curso,
    ].some((v) => v !== undefined && v !== "");

    const result = [];

    for (const user of users) {
      const uidStr = String(user.id);
      const moodleUser = moodleUserMap[(user.email || "").toLowerCase()];
      const userInscripciones = inscMap[uidStr] || [];

      if (search) {
        const fullName = `${user.grado || user.grado || ""} ${user.firstName || user.firstname || ""
          } ${user.lastName || user.lastname || ""}`.trim();
        if (!fullName.toLowerCase().includes(String(search).toLowerCase()))
          continue;
      }
      if (
        cedula &&
        !String(user.cI || user.cedula || "").includes(String(cedula))
      )
        continue;

      const coursesWithData = userInscripciones
        .map((insc) => {
          const enrolData =
            moodleUser && enrolMap[String(moodleUser.id)]?.[String(insc.curso)]
              ? enrolMap[String(moodleUser.id)][String(insc.curso)]
              : null;

          const gradesObj =
            enrolData && userCourseGradesMap[String(moodleUser?.id)]
              ? userCourseGradesMap[String(moodleUser.id)][
              String(enrolData.courseid)
              ] || {}
              : {};

          const pagosList = pagosMap[String(insc.id)] || [];



          const cert = certMap[String(insc.id)];
          const certData = cert
            ? { grupo: cert.grupo, fecha: cert.createdAt, url: cert.url }
            : null;



          return {
            curso: insc.curso,
            fullname: courseMap[insc.curso] || insc.curso,
            matriculado: !!enrolData,
            acces: !!(moodleUser?.lastaccess && moodleUser.lastaccess !== 0),
            grades: gradesObj,
            id: insc.id,
            aceptacion: insc.aceptacion,
            observacion: insc.observacion,
            usuarioEdicion: insc.usuarioEdicion,
            createdAt: insc.createdAt,
            updatedAt: insc.updatedAt,
            courseId: insc.courseId,
            userId: insc.userId,
            pagos: pagosList,
            certificado: certData,
          };
        })
        .filter((courseItem) => {
          // --- filtro Nota Final
          if (notaFinal === "true") {
            const nf = courseItem.grades?.["Nota Final"];
            const nfNum =
              nf !== null && nf !== undefined ? parseFloat(nf) : null;
            if (nfNum === null || isNaN(nfNum) || nfNum < 7) return false;
          }
          if (notaFinal === "false") {
            const nf = courseItem.grades?.["Nota Final"];
            const nfNum =
              nf !== null && nf !== undefined ? parseFloat(nf) : null;
            if (nfNum === null || isNaN(nfNum) || nfNum >= 7) return false;
          }

          // --- otros filtros
          if (matriculado === "true" && !courseItem.matriculado) return false;
          if (matriculado === "false" && courseItem.matriculado) return false;
          if (acces === "true" && !courseItem.acces) return false;
          if (acces === "false" && courseItem.acces) return false;
          if (
            pagos === "true" &&
            !(courseItem.pagos && courseItem.pagos.length)
          )
            return false;
          if (pagos === "false" && courseItem.pagos && courseItem.pagos.length)
            return false;
          if (certificado === "true" && !courseItem.certificado?.url)
            return false;
          if (certificado === "false" && courseItem.certificado?.url)
            return false;
          if (curso && String(courseItem.curso) !== String(curso)) return false;

          return true;
        });

      if (hasCourseFilters) {
        if (coursesWithData.length)
          result.push({ ...user, courses: coursesWithData });
      } else {
        result.push({ ...user, courses: coursesWithData });
      }
    }

    // --- 8. Paginación
    const total = result.length;
    const pageInt = Math.max(1, parseInt(page));
    const limitInt = Math.max(1, parseInt(limit));
    const start = (pageInt - 1) * limitInt;
    const end = start + limitInt;

    res.json({
      total,
      page: pageInt,
      limit: limitInt,
      totalPages: Math.ceil(total / limitInt),
      data: result.slice(start, end),
    });
  } catch (error) {
    console.error("Error en getAll optimizado:", error);
    res.status(500).json({ error: "Error al obtener los datos." });
  }
});




const create = catchError(async (req, res) => {
  const { cI, email, password, firstName, lastName, frontBaseUrl } = req.body;

  // Buscar usuario existente por email
  let user = await User.findOne({ where: { email } });
  const crypto = require("crypto");

  if (user) {
    // Si ya tiene contraseña o está verificado → error
    if (user.password) {
      return res
        .status(400)
        .json({ message: "Ya existe un usuario registrado con este email" });
    }

    // Si existe pero no tiene contraseña → actualizar contraseña y nombres
    const hashedPassword = await bcrypt.hash(password, 10);
    await user.update({ password: hashedPassword, firstName, lastName });

    // Crear código de verificación y enviar correo
    const code = crypto.randomBytes(32).toString("hex");
    const link = `${frontBaseUrl}/${code}`;

    await EmailCode.create({ code, userId: user.id });

    await sendEmail({
      to: email,
      subject: "Verificación de correo electrónico - EDUKA",
      html: `
      <div style="font-family: Arial, sans-serif; background-color: #f0f8ff; padding: 20px; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1); overflow: hidden;">
          
          <!-- Encabezado con logo -->
          <div style="text-align: center; background-color: #007BFF; padding: 20px;">
            <img src="https://res.cloudinary.com/desgmhmg4/image/upload/v1747890355/eduka_sf_gaus5o.png" alt="EDUKA" style="width: 150px;" />
          </div>

          <!-- Cuerpo del mensaje -->
          <div style="padding: 30px; text-align: center;">
            <h1 style="color: #007BFF;">Hola ${firstName} ${lastName},</h1>
          <h2 style="font-weight: normal;">Gracias por registrarte en <strong>EDUKA</strong></h2>
            <p style="font-size: 16px; line-height: 1.6;">
              Para completar la verificación de tu cuenta, por favor haz clic en el siguiente botón:
            </p>

            <!-- Botón de verificación -->
            <a href="${link}" style="display: inline-block; padding: 12px 24px; background-color: #00aaff; color: white; font-size: 16px; font-weight: bold; border-radius: 8px; text-decoration: none; margin-top: 20px;">
              Verificar cuenta
            </a>

            <p style="margin-top: 30px; font-size: 14px; color: #666;">
              Si tú no solicitaste este cambio, puedes ignorar este mensaje.
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

    return res
      .status(200)
      .json({ user, message: "Contraseña actualizada y correo enviado" });
  }

  // Si no existe → crear usuario nuevo
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = await User.create({
    cI,
    email,
    password: hashedPassword,
    firstName,
    lastName,
    isVerified: false,
  });

  const code = crypto.randomBytes(32).toString("hex");
  const link = `${frontBaseUrl}/${code}`;

  await EmailCode.create({ code, userId: newUser.id });

  await sendEmail({
    to: email,
    subject: "Verificación de correo electrónico - EDUKA",
    html: `
    <div style="font-family: Arial, sans-serif; background-color: #f0f8ff; padding: 20px; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1); overflow: hidden;">
        
        <!-- Encabezado con logo -->
        <div style="text-align: center; background-color: #007BFF; padding: 20px;">
          <img src="https://res.cloudinary.com/desgmhmg4/image/upload/v1747890355/eduka_sf_gaus5o.png" alt="EDUKA" style="width: 150px;" />
        </div>

        <!-- Cuerpo del mensaje -->
        <div style="padding: 30px; text-align: center;">
          <h1 style="color: #007BFF;">Hola ${firstName} ${lastName},</h1>
          <h2 style="font-weight: normal;">Gracias por registrarte en <strong>EDUKA</strong></h2>
          <p style="font-size: 16px; line-height: 1.6;">
            Para completar tu registro y activar tu cuenta, por favor haz clic en el siguiente botón para verificar tu correo electrónico:
          </p>

          <!-- Botón de verificación -->
          <a href="${link}" style="display: inline-block; padding: 12px 24px; background-color: #00aaff; color: white; font-size: 16px; font-weight: bold; border-radius: 8px; text-decoration: none; margin-top: 20px;">
            Verificar cuenta
          </a>

          <p style="margin-top: 30px; font-size: 14px; color: #666;">
            Si tú no solicitaste este registro, puedes ignorar este mensaje.
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

  return res
    .status(201)
    .json({ user: newUser, message: "Usuario creado y correo enviado" });
});

// ========================== GET ONE USER (Optimizado) ==========================
const getOne = catchError(async (req, res) => {
  try {
    const { id } = req.params;

    // Usuario en tu BD
    const user = await User.findByPk(id, { raw: true });
    if (!user) return res.sendStatus(404);

    const email = user.email;

    // ========================== MOODLE ==========================
    const [moodleUsers] = await sequelizeM.query(
      `
      SELECT id, email
      FROM mdl_user
      WHERE deleted = 0 AND suspended = 0
        AND email = ?
    `,
      { replacements: [email] }
    );

    let moodleUserId = moodleUsers.length > 0 ? moodleUsers[0].id : null;

    let enrolMap = {};
    if (moodleUserId) {
      // Cursos inscritos
      const [enrolments] = await sequelizeM.query(
        `
        SELECT ue.userid, c.id AS courseid, c.shortname AS course
        FROM mdl_user_enrolments ue
        JOIN mdl_enrol e ON ue.enrolid = e.id
        JOIN mdl_course c ON e.courseid = c.id
        WHERE ue.userid = ?
      `,
        { replacements: [moodleUserId] }
      );

      // Notas de actividades
      const [grades] = await sequelizeM.query(
        `
        SELECT gi.courseid, gi.itemname, gg.finalgrade
        FROM mdl_grade_grades gg
        JOIN mdl_grade_items gi ON gg.itemid = gi.id
        WHERE gi.itemtype = 'mod' AND gi.itemname IS NOT NULL
          AND gg.userid = ?
      `,
        { replacements: [moodleUserId] }
      );

      // Nota final
      const [finalGrades] = await sequelizeM.query(
        `
        SELECT gi.courseid, gg.finalgrade
        FROM mdl_grade_grades gg
        JOIN mdl_grade_items gi ON gg.itemid = gi.id
        WHERE gi.itemtype = 'course' AND gg.userid = ?
      `,
        { replacements: [moodleUserId] }
      );

      const userCourseGradesMap = {};
      grades.forEach(({ userid, courseid, itemname, finalgrade }) => {
        const uid = String(userid);
        const cid = String(courseid);
        if (!userCourseGradesMap[uid]) userCourseGradesMap[uid] = {};
        if (!userCourseGradesMap[uid][cid]) userCourseGradesMap[uid][cid] = {};

        const key = String(itemname).trim();
        if (key && key.toLowerCase() !== "null") {
          // <-- FILTRO: no vacío ni "null"
          if (key === "Nota Final") {
            const val = parseFloat(finalgrade);
            userCourseGradesMap[uid][cid]["Nota Final"] = isNaN(val)
              ? null
              : val;
          } else {
            userCourseGradesMap[uid][cid][key] = finalgrade;
          }
        }
      });

      enrolments.forEach((e) => {
        enrolMap[e.course] = {
          courseid: e.courseid,
          grades: userCourseGradesMap[e.courseid] || {},
        };
      });
    }

    // ========================== INSCRIPCIONES + PAGOS + CERTIFICADOS ==========================
    const inscripciones = await Inscripcion.findAll({
      raw: true,
      where: { userId: id },
    });

    const inscripcionIds = inscripciones.map((i) => i.id);
    const pagos = inscripcionIds.length
      ? await Pagos.findAll({
        raw: true,
        where: {
          inscripcionId: inscripcionIds,
          confirmacion: true, // solo pagos confirmados
        },
      })
      : [];

    const certificados = inscripcionIds.length
      ? await Certificado.findAll({
        raw: true,
        where: { inscripcionId: inscripcionIds },
      })
      : [];


    // Maps
    const pagosMap = {};
    pagos.forEach((p) => {
      if (!pagosMap[p.inscripcionId]) pagosMap[p.inscripcionId] = [];
      pagosMap[p.inscripcionId].push(p);
    });

    const certMap = {};
    certificados.forEach((c) => {
      const inscId = c.inscripcionId != null ? String(c.inscripcionId) : null;
      if (!inscId) return;

      // si hubiera más de uno, se queda el último
      certMap[inscId] = c;
    });


    // ========================== COURSES MERGED ==========================
    const allCourses = await Course.findAll({ raw: true });
    const courseMap = {};
    allCourses.forEach((c) => {
      courseMap[c.sigla] = c.nombre;
    });

    const coursesWithData = inscripciones.map((insc) => {
      const enrolData = enrolMap[insc.curso] || null;
      const pagosList = pagosMap[insc.id] || [];

      let certData = {};
      const cert = certMap[String(insc.id)];
      if (cert) {
        certData = {
          grupo: cert.grupo,
          fecha: cert.createdAt,
          url: cert.url,
        };
      }


      return {
        curso: insc.curso,
        fullname: courseMap[insc.curso] || insc.curso,
        matriculado: !!enrolData,
        grades: enrolData ? enrolData.grades : {},
        // datos de inscripcion
        id: insc.id,
        aceptacion: insc.aceptacion,
        observacion: insc.observacion,
        usuarioEdicion: insc.usuarioEdicion,
        createdAt: insc.createdAt,
        updatedAt: insc.updatedAt,
        courseId: insc.courseId,
        userId: insc.userId,
        pagos: pagosList.map((p) => ({
          pagoUrl: p.pagoUrl,
          valorDepositado: p.valorDepositado,
          verificado: p.verificado,
          distintivo: p.distintivo,
          moneda: p.moneda,
          entregado: p.entregado,
          observacion: p.observacion,
          usuarioEdicion: p.usuarioEdicion,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
        certificado: certData,
      };
    });

    res.json({ ...user, courses: coursesWithData });
  } catch (error) {
    console.error("Error en getOne:", error);
    res.status(500).json({ error: "Error al obtener los datos." });
  }
});

const remove = catchError(async (req, res) => {
  const { id } = req.params;

  const result = await User.findByPk(id);
  if (!result) {
    return res.status(404).json({
      status: "error",
      message: "Usuario no encontrado",
    });
  }

  await User.destroy({ where: { id } });

  return res.status(200).json({
    status: "success",
    message: "Usuario eliminado correctamente",
    result, // 👈 devuelve el registro que eliminaste
  });
});


const update = catchError(async (req, res) => {
  const {
    cI,
    email,
    password,
    firstName,
    lastName,
    cellular,
    dateBirth,
    province,
    city,
    genre,
    role,
    grado,
    subsistema,
    isVerified,
  } = req.body;
  const { id } = req.params;
  const result = await User.update(
    {
      cI,
      email,
      firstName,
      lastName,
      cellular,
      dateBirth,
      province,
      city,
      genre,
      role,
      grado,
      subsistema,
      isVerified,
    },
    { where: { id }, returning: true }
  );
  if (result[0] === 0) return res.sendStatus(404);
  return res.json(result[1][0]);
});

const login = catchError(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ where: { email: email } });
  if (!user) return res.status(401).json({ message: "Usuario Incorrecto" });
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid)
    return res.status(401).json({ message: "Contraseña Incorrecta" });
  if (!user.isVerified)
    return res
      .status(401)
      .json({ message: "El usuario no ha verificado su correo electrónico" });

  const token = jwt.sign({ user }, process.env.TOKEN_SECRET, {
    expiresIn: "2h",
  });

  return res.json({ token });
});

const verifyCode = catchError(async (req, res) => {
  const { code } = req.params;
  const emailCode = await EmailCode.findOne({ where: { code: code } });
  if (!emailCode) return res.status(404).json({ message: "Código Incorrecto" });

  const user = await User.findByPk(emailCode.userId);
  user.isVerified = true;
  await user.save();

  //   const user = await User.update(
  //     { isVerified: true },
  //     { where: emailCode.userId, returning: true }
  //   );

  await emailCode.destroy();

  return res.json({ message: "Usuario verificado correctamente", user });
});

// ========================== GET LOGGED USER (Optimizado) ==========================
const getLoggedUser = catchError(async (req, res) => {
  try {
    const loggedUser = req.user;
    const userId = loggedUser.id;

    // Usuario en tu BD
    const user = await User.findByPk(userId, { raw: true });
    if (!user) return res.sendStatus(404);

    const email = user.email;

    // ========================== MOODLE ==========================
    const [moodleUsers] = await sequelizeM.query(
      `
      SELECT id, email
      FROM mdl_user
      WHERE deleted = 0 AND suspended = 0
        AND email = ?
    `,
      { replacements: [email] }
    );

    let moodleUserId = moodleUsers.length > 0 ? moodleUsers[0].id : null;

    let userCourses = [];
    if (moodleUserId) {
      // Cursos inscritos
      const [enrolments] = await sequelizeM.query(
        `
        SELECT ue.userid, c.id AS courseid, c.shortname AS course
        FROM mdl_user_enrolments ue
        JOIN mdl_enrol e ON ue.enrolid = e.id
        JOIN mdl_course c ON e.courseid = c.id
        WHERE ue.userid = ?
      `,
        { replacements: [moodleUserId] }
      );

      // Notas de actividades
      const [grades] = await sequelizeM.query(
        `
        SELECT gi.courseid, gi.itemname, gg.finalgrade
        FROM mdl_grade_grades gg
        JOIN mdl_grade_items gi ON gg.itemid = gi.id
        WHERE gi.itemtype = 'mod' AND gi.itemname IS NOT NULL
          AND gg.userid = ?
      `,
        { replacements: [moodleUserId] }
      );

      // Nota final
      const [finalGrades] = await sequelizeM.query(
        `
        SELECT gi.courseid, gg.finalgrade
        FROM mdl_grade_grades gg
        JOIN mdl_grade_items gi ON gg.itemid = gi.id
        WHERE gi.itemtype = 'course' AND gg.userid = ?
      `,
        { replacements: [moodleUserId] }
      );

      // Mapear notas
      const userCourseGradesMap = {};
      grades.forEach(({ courseid, itemname, finalgrade }) => {
        if (!userCourseGradesMap[courseid]) userCourseGradesMap[courseid] = {};
        userCourseGradesMap[courseid][itemname] = finalgrade;
      });
      finalGrades.forEach(({ courseid, finalgrade }) => {
        if (!userCourseGradesMap[courseid]) userCourseGradesMap[courseid] = {};
        userCourseGradesMap[courseid]["Nota Final"] = finalgrade;
      });

      const allCourses = await Course.findAll({ raw: true });
      const courseMap = {};
      allCourses.forEach((c) => {
        courseMap[c.sigla] = c.nombre;
      });

      userCourses = enrolments.map(({ courseid, course }) => ({
        curso: course, // 🔥 sigla y curso son lo mismo → dejamos solo curso
        fullname: courseMap[course] || course,
        grades: userCourseGradesMap[courseid] || {},
      }));
    }

    // ========================== INSCRIPCIONES + PAGOS + CERTIFICADOS ==========================
    const inscripciones = await Inscripcion.findAll({
      raw: true,
      where: { userId: user.id },
    });

    const inscripcionIds = inscripciones.map((i) => i.id);

    const pagos = inscripcionIds.length
      ? await Pagos.findAll({
        raw: true,
        where: {
          inscripcionId: inscripcionIds,
          confirmacion: true, // solo pagos confirmados
        },
      })
      : [];

    const certificados = inscripcionIds.length
      ? await Certificado.findAll({
        raw: true,
        where: { inscripcionId: inscripcionIds },
      })
      : [];


    // Map pagos (pueden ser varios por inscripción)
    const pagosMap = {};
    pagos.forEach((p) => {
      if (!pagosMap[p.inscripcionId]) pagosMap[p.inscripcionId] = [];
      pagosMap[p.inscripcionId].push(p);
    });

    // Map certificados
    const certMap = {};
    certificados.forEach((c) => {
      if (!c.inscripcionId) return;
      certMap[String(c.inscripcionId)] = c;
    });


    // Merge final
    const coursesWithData = userCourses.map((course) => {
      const insc = inscripciones.find(
        (i) =>
          String(i.curso).trim().toLowerCase() ===
          String(course.curso).trim().toLowerCase()
      );

      let inscripcionData = null;
      let pagosData = [];
      let certData = {};

      if (insc) {
        inscripcionData = {
          id: insc.id,
          aceptacion: insc.aceptacion,
          curso: insc.curso,
          observacion: insc.observacion,
          usuarioEdicion: insc.usuarioEdicion,
          createdAt: insc.createdAt,
          updatedAt: insc.updatedAt,
          courseId: insc.courseId,
          userId: insc.userId,
        };

        pagosData = pagosMap[insc.id] || [];
      }

      if (insc) {
        const cert = certMap[String(insc.id)];
        if (cert) {
          certData = {
            grupo: cert.grupo,
            fecha: cert.createdAt,
            url: cert.url,
          };
        }
      }


      return {
        ...course,
        matriculado: !!insc,
        inscripcion: inscripcionData,
        pagos: pagosData,
        certificado: Object.keys(certData).length ? certData : null,
      };
    });

    res.json({ ...user, courses: coursesWithData });
  } catch (error) {
    console.error("Error en getLoggedUser:", error);
    res.status(500).json({ error: "Error al obtener los datos." });
  }
});







const sendEmailResetPassword = catchError(async (req, res) => {
  const { email, frontBaseUrl } = req.body;
  const user = await User.findOne({ where: { email: email } });
  if (!user) return res.status(401).json({ message: "Usuario Incorrecto" });
  const code = require("crypto").randomBytes(32).toString("hex");
  const link = `${frontBaseUrl}/${code}`;
  await EmailCode.create({
    code: code,
    userId: user.id,
  });
  await sendEmail({
    to: email,
    subject: "Restablecer tu contraseña - EDUKA",
    html: `
  <div style="font-family: Arial, sans-serif; background-color: #f0f8ff; padding: 20px; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1); overflow: hidden;">

      <!-- Encabezado con logo -->
      <div style="text-align: center; background-color: #007BFF; padding: 20px;">
        <img src="https://res.cloudinary.com/desgmhmg4/image/upload/v1747890355/eduka_sf_gaus5o.png" alt="EDUKA" style="width: 150px;" />
      </div>

      <!-- Cuerpo del mensaje -->
      <div style="padding: 30px; text-align: center;">
        <h1 style="color: #007BFF;">Hola, ${user.firstName} ${user.lastName
      }</h1>
        <h2 style="font-weight: normal;">¿Olvidaste tu contraseña?</h2>
        <p style="font-size: 16px; line-height: 1.6;">
          No te preocupes. Para restablecer tu contraseña, simplemente haz clic en el siguiente botón:
        </p>

        <!-- Botón de restablecimiento -->
        <a href="${link}" style="display: inline-block; padding: 12px 24px; background-color: #00aaff; color: white; font-size: 16px; font-weight: bold; border-radius: 8px; text-decoration: none; margin-top: 20px;">
          Restablecer contraseña
        </a>

        <p style="margin-top: 30px; font-size: 14px; color: #666;">
          Si no solicitaste este cambio, puedes ignorar este mensaje con seguridad.
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

  return res.json(user);
});

const resetPassword = catchError(async (req, res) => {
  const { password } = req.body;
  const { code } = req.params;
  const emailCode = await EmailCode.findOne({ where: { code: code } });
  if (!emailCode) return res.status(401).json({ message: "Codigo Incorrecto" });
  const bcryptPassword = await bcrypt.hash(password, 10);
  const id = emailCode.userId;

  const result = await User.update(
    {
      password: bcryptPassword,
    },
    { where: { id }, returning: true }
  );

  await emailCode.destroy();
  if (result[0] === 0) return res.sendStatus(404);
  return res.json(result[1][0]);
});

module.exports = {
  getAll,
  create,
  getOne,
  remove,
  update,
  login,
  verifyCode,
  getLoggedUser,
  sendEmailResetPassword,
  resetPassword,
};
