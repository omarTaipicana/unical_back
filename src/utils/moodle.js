const axios = require("axios");

const MOODLE_URL = process.env.MOODLE_URL;
const MOODLE_TOKEN = process.env.MOODLE_TOKEN;

/**
 * Obtiene usuario por username (cedula)
 */
async function getMoodleUserByUsername(username) {
  try {
    const resp = await axios.get(`${MOODLE_URL}/webservice/rest/server.php`, {
      params: {
        wstoken: MOODLE_TOKEN,
        wsfunction: "core_user_get_users",
        moodlewsrestformat: "json",
        criteria: [{ key: "username", value: username }],
      },
    });
    if (resp.data.users && resp.data.users.length > 0) {
      return resp.data.users[0];
    }
    return null;
  } catch (error) {
    console.error("Error obteniendo usuario Moodle:", error.response?.data || error.message);
    return null;
  }
}

/**
 * Crea un usuario en Moodle
 */
async function crearUsuarioMoodle({ cedula, nombres, apellidos, email }) {
  // Primero revisamos si ya existe
  let usuario = await getMoodleUserByUsername(cedula);
  if (usuario) return usuario;

  try {
    const resp = await axios.post(`${MOODLE_URL}/webservice/rest/server.php`, null, {
      params: {
        wstoken: MOODLE_TOKEN,
        wsfunction: "core_user_create_users",
        moodlewsrestformat: "json",
        "users[0][username]": cedula,
        "users[0][password]": `Eduka.${cedula}*`,
        "users[0][firstname]": nombres,
        "users[0][lastname]": apellidos,
        "users[0][email]": email,
      },

    });

    if (resp.data && resp.data[0] && resp.data[0].id) {
      return resp.data[0];
    }

    console.error("Respuesta Moodle inesperada al crear usuario:", resp.data);
    return null;
  } catch (error) {
    console.error("Error creando usuario Moodle:", error.response?.data || error.message);
    return null;
  }
}

/**
 * Obtiene el ID numérico de un curso por su shortname
 */
async function getMoodleCourseId(shortname) {
  try {
    const resp = await axios.get(`${MOODLE_URL}/webservice/rest/server.php`, {
      params: {
        wstoken: MOODLE_TOKEN,
        wsfunction: "core_course_get_courses_by_field",
        moodlewsrestformat: "json",
        field: "shortname",
        value: shortname,
      },
    });
    if (resp.data.courses && resp.data.courses.length > 0) {
      return resp.data.courses[0].id;
    }
    return null;
  } catch (error) {
    console.error("Error obteniendo ID de curso Moodle:", error.response?.data || error.message);
    return null;
  }
}

/**
 * Inscribe un usuario en un curso
 */
async function inscribirUsuarioCurso({ userId, courseShortname }) {
  const courseId = await getMoodleCourseId(courseShortname);
  if (!courseId) {
    console.error("Curso Moodle no encontrado para shortname:", courseShortname);
    return null;
  }

  try {
    const resp = await axios.post(`${MOODLE_URL}/webservice/rest/server.php`, null, {
      params: {
        wstoken: MOODLE_TOKEN,
        wsfunction: "enrol_manual_enrol_users",
        moodlewsrestformat: "json",
        "enrolments[0][roleid]": 5, // estudiante
        "enrolments[0][userid]": userId,
        "enrolments[0][courseid]": courseId,
      },
    });
    return resp.data;
  } catch (error) {
    console.error("Error inscribiendo usuario en Moodle:", error.response?.data || error.message);
    return null;
  }
}

/**
 * Función completa: crea usuario y lo inscribe en curso
 */
async function registrarUsuarioEnCurso({ cedula, nombres, apellidos, email, courseShortname }) {
  const usuario = await crearUsuarioMoodle({ cedula, nombres, apellidos, email });
  if (!usuario) {
    console.error("No se pudo crear o encontrar el usuario en Moodle");
    return null;
  }

  const inscripcion = await inscribirUsuarioCurso({ userId: usuario.id, courseShortname });
  return { usuario, inscripcion };
}

module.exports = {
  crearUsuarioMoodle,
  inscribirUsuarioCurso,
  registrarUsuarioEnCurso,
  getMoodleCourseId,
};
