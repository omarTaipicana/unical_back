// controllers/usuariosSecundarios.controller.js
const sequelizeM = require('../utils/connectionM');

const getAllUserM = async (req, res) => {
  try {
    // 1. Obtener usuarios activos (solo campos necesarios)
    const [users] = await sequelizeM.query(`
      SELECT 
        id, username, firstname, lastname, email, city, country, lang,
        timezone, firstaccess, lastaccess
      FROM mdl_user
      WHERE deleted = 0 AND suspended = 0
    `);

    // 2. Obtener cursos matriculados por usuarios activos
    const userIds = users.map(u => u.id);
    if (userIds.length === 0) {
      return res.json([]);
    }

    const [enrolments] = await sequelizeM.query(`
      SELECT 
        ue.userid,
        c.id AS courseid,
        c.shortname AS course
      FROM mdl_user_enrolments ue
      JOIN mdl_enrol e ON ue.enrolid = e.id
      JOIN mdl_course c ON e.courseid = c.id
      WHERE ue.userid IN (?)
    `, { replacements: [userIds] });

    // 3. Obtener calificaciones por ítem (mod) para esos usuarios
    const [grades] = await sequelizeM.query(`
      SELECT 
        gg.userid,
        gi.courseid,
        gi.itemname,
        gg.finalgrade
      FROM mdl_grade_grades gg
      JOIN mdl_grade_items gi ON gg.itemid = gi.id
      WHERE gi.itemtype = 'mod' AND gi.itemname IS NOT NULL AND gg.userid IN (?)
    `, { replacements: [userIds] });

    // 4. Obtener notas finales (curso) para esos usuarios
    const [finalGrades] = await sequelizeM.query(`
      SELECT 
        gg.userid,
        gi.courseid,
        gg.finalgrade
      FROM mdl_grade_grades gg
      JOIN mdl_grade_items gi ON gg.itemid = gi.id
      WHERE gi.itemtype = 'course' AND gg.userid IN (?)
    `, { replacements: [userIds] });

    // 5. Mapear notas por usuario → curso → ítem
    const userCourseGradesMap = {};
    grades.forEach(({ userid, courseid, itemname, finalgrade }) => {
      if (!userCourseGradesMap[userid]) userCourseGradesMap[userid] = {};
      if (!userCourseGradesMap[userid][courseid]) userCourseGradesMap[userid][courseid] = {};
      userCourseGradesMap[userid][courseid][itemname] = finalgrade;
    });
    finalGrades.forEach(({ userid, courseid, finalgrade }) => {
      if (!userCourseGradesMap[userid]) userCourseGradesMap[userid] = {};
      if (!userCourseGradesMap[userid][courseid]) userCourseGradesMap[userid][courseid] = {};
      userCourseGradesMap[userid][courseid]['Nota Final'] = finalgrade;
    });

    // 6. Armar cursos con notas por usuario
    const userCoursesMap = {};
    enrolments.forEach(({ userid, courseid, course }) => {
      if (!userCoursesMap[userid]) userCoursesMap[userid] = [];
      const grades = userCourseGradesMap[userid]?.[courseid] || {};
      userCoursesMap[userid].push({ fullname: course, grades });
    });

    // 7. Construir resultado final
    const result = users.map(user => ({
      ...user,
      courses: userCoursesMap[user.id] || []
    }));

    res.json(result);
  } catch (error) {
    console.error("Error al obtener usuarios con cursos y notas:", error);
    res.status(500).json({ error: "Error al obtener los datos." });
  }
};

const getUserByUsernameM = async (req, res) => {
  try {
    const { username } = req.params;

    // 1. Obtener usuario activo con campos necesarios
    const [[user]] = await sequelizeM.query(`
      SELECT 
        id, username, firstname, lastname, email, city, country, lang,
        timezone, firstaccess, lastaccess
      FROM mdl_user
      WHERE (username = ? OR email = ?) AND deleted = 0 AND suspended = 0
    `, { replacements: [username, username] });

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // 2. Obtener cursos del usuario
    const [enrolments] = await sequelizeM.query(`
      SELECT 
        c.id AS courseid,
        c.shortname AS course
      FROM mdl_user_enrolments ue
      JOIN mdl_enrol e ON ue.enrolid = e.id
      JOIN mdl_course c ON e.courseid = c.id
      WHERE ue.userid = ?
    `, { replacements: [user.id] });

    // 3. Obtener calificaciones (mod)
    const [grades] = await sequelizeM.query(`
      SELECT 
        gi.courseid,
        gi.itemname,
        gg.finalgrade
      FROM mdl_grade_grades gg
      JOIN mdl_grade_items gi ON gg.itemid = gi.id
      WHERE gg.userid = ? AND gi.itemtype = 'mod' AND gi.itemname IS NOT NULL
    `, { replacements: [user.id] });

    // 4. Nota final del curso
    const [finalGrades] = await sequelizeM.query(`
      SELECT 
        gi.courseid,
        gg.finalgrade
      FROM mdl_grade_grades gg
      JOIN mdl_grade_items gi ON gg.itemid = gi.id
      WHERE gg.userid = ? AND gi.itemtype = 'course'
    `, { replacements: [user.id] });

    // 5. Mapear notas por curso
    const gradesMap = {};
    grades.forEach(({ courseid, itemname, finalgrade }) => {
      if (!gradesMap[courseid]) gradesMap[courseid] = {};
      gradesMap[courseid][itemname] = finalgrade;
    });
    finalGrades.forEach(({ courseid, finalgrade }) => {
      if (!gradesMap[courseid]) gradesMap[courseid] = {};
      gradesMap[courseid]['Nota Final'] = finalgrade;
    });

    // 6. Armar cursos con notas
    const courses = enrolments.map(({ courseid, course }) => ({
      fullname: course,
      grades: gradesMap[courseid] || {}
    }));

    res.json({ ...user, courses });
  } catch (error) {
    console.error("Error al obtener usuario:", error);
    res.status(500).json({ error: "Error al obtener los datos del usuario." });
  }
};


module.exports = { getAllUserM, getUserByUsernameM };
