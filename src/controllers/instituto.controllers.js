const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const catchError = require("../utils/catchError");
const Certificado = require("../models/Certificado");
const Inscripcion = require("../models/Inscripcion");
const User = require("../models/User");


// ================================
// 1) LISTAR CERTIFICADOS POR CURSO
// ================================
const listarCertificadosPorCurso = catchError(async (req, res) => {
  const { sigla } = req.params;

  if (!sigla) {
    return res.status(400).json({ message: "Falta parámetro sigla de curso" });
  }

  const carpeta = path.join(__dirname, "..", "..", "uploads", "certificados", sigla);

  if (!fs.existsSync(carpeta)) {
    return res.json({ curso: sigla, archivos: [] });
  }

  // 1) Leer PDFs del disco
  const archivos = fs.readdirSync(carpeta).filter((f) => f.endsWith(".pdf"));

  // 2) Traer certificados ya registrados en BD para este curso
  //    (obtenemos la cédula via Inscripcion -> User)
  const certificadosBD = await Certificado.findAll({
    where: { curso: sigla },
    attributes: ["id", "curso", "inscripcionId", "entregado"],
    include: [
      {
        model: Inscripcion,
        attributes: ["id"],
        include: [
          {
            model: User,
            attributes: ["cI"],
          },
        ],
      },
    ],
  });

  // 3) Crear un set de cédulas que ya tienen certificado en BD (para ese curso)
  //    Si quieres filtrar solo cuando entregado=true, activa el if.
  const cedulasConCertificado = new Set(
    certificadosBD
      .filter((c) => true /* o: c.entregado === true */)
      .map((c) => c.inscripcion?.user?.cI)
      .filter(Boolean)
  );

  // 4) Armar respuesta solo con los que NO están en BD
  const host = `${req.protocol}://${req.get("host")}`;
  const response = archivos
    .map((file) => {
      const cedula = file.split("_")[0];
      return {
        cedula,
        nombreArchivo: file,
        url: `${host}/uploads/certificados/${sigla}/${file}`,
      };
    })
    .filter((item) => !cedulasConCertificado.has(item.cedula));

  return res.json({ curso: sigla, archivos: response });
});


// ===============================================
// 2) DESCARGAR EN ZIP LOS CERTIFICADOS SELECCIONADOS
// ===============================================
const descargarCertificadosSeleccionados = catchError(async (req, res) => {
  const { sigla } = req.params;
  const { archivos } = req.body;

  if (!sigla) {
    return res.status(400).json({ error: "Falta parámetro sigla" });
  }

  if (!archivos || !Array.isArray(archivos) || archivos.length === 0) {
    return res
      .status(400)
      .json({ error: "Debe enviar un array 'archivos' con al menos un nombre" });
  }

  const baseDir = path.join(
    __dirname,
    "..",
    "..",
    "uploads",
    "certificados",
    sigla
  );

  if (!fs.existsSync(baseDir)) {
    return res.status(404).json({ error: "No existe la carpeta del curso" });
  }

  // Headers de respuesta ZIP
const now = new Date();

// Formato YYYY-MM-DD
const fecha = now.toISOString().split("T")[0];

// Formato HH-MM-SS
const hora = now
  .toTimeString()
  .split(" ")[0]      // "14:32:55"
  .replace(/:/g, "-"); // "14-32-55"

const filename = `certificados_${sigla}_${fecha}_${hora}.zip`;

// Headers ZIP
res.setHeader("Content-Type", "application/zip");
res.setHeader(
  "Content-Disposition",
  `attachment; filename="${filename}"`
);

// 👇 AGREGA ESTA LÍNEA
res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");



  const archive = archiver("zip", { zlib: { level: 9 } });

  // Pipe ZIP → response
  archive.pipe(res);

  for (const fileName of archivos) {
    const filePath = path.join(baseDir, fileName);

    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: fileName });
    } else {
      console.warn("⚠️ Archivo no encontrado, no se incluye en ZIP:", fileName);
    }
  }

  archive.finalize();
});

module.exports = {
  listarCertificadosPorCurso,
  descargarCertificadosSeleccionados,
};
