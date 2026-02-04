// utils/generarCertificado.js

const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const Pagos = require("../models/Pagos");
const Inscripcion = require("../models/Inscripcion");
const User = require("../models/User");
const Course = require("../models/Course");

const firmarPdfFirmaEc = require("./firmarPdfFirmaEc");

module.exports = async function generarCertificado(pagoId) {
  console.log("🔥 generarCertificado llamado para pagoId:", pagoId);

  // 1) Traer pago + relaciones
  const pago = await Pagos.findByPk(pagoId, {
    include: [
      {
        model: Inscripcion,
        include: [{ model: User }, { model: Course }],
      },
    ],
  });

  if (!pago) throw new Error("Pago no encontrado en generarCertificado");

  const inscripcion = pago.inscripcion || pago.Inscripcion;
  if (!inscripcion) throw new Error("Inscripción no encontrada para este pago");

  const user = inscripcion.user || inscripcion.User;
  if (!user) throw new Error("Usuario no encontrado para esta inscripción");

  const course = inscripcion.course || inscripcion.Course || null;
  const cursoSigla = course?.sigla || inscripcion.curso || pago.curso;

  if (!cursoSigla) throw new Error("No se pudo determinar la sigla del curso");

  const dataCertificado = {
    pagoId: pago.id,
    inscripcionId: inscripcion.id,
    userId: user.id,
    nombresCompletos: `${user.firstName} ${user.lastName}`,
    cedula: user.cI,
    grado: user.grado,
    cursoCodigo: inscripcion.curso || pago.curso || cursoSigla,
    cursoNombre: course ? course.nombre : (inscripcion.curso || pago.curso || cursoSigla),
    cursoSigla,
    fechaPago: pago.createdAt,
    valorDepositado: pago.valorDepositado,
    grupo: null,
  };

  console.log("✅ Datos para certificado:", dataCertificado);

  // 2) Selección de template por regla:
  // "grupo = último número después del último '_' en el nombre"
  const templatesDir = path.join(__dirname, "..", "..", "uploads", "templates");
  if (!fs.existsSync(templatesDir)) {
    throw new Error("No existe la carpeta de templates: " + templatesDir);
  }

  const all = fs.readdirSync(templatesDir);

  // Match: template_<sigla>_<NUM>.pdf (NUM = último segmento)
  // NOTA: la sigla puede tener underscores, pero aquí la sigla viene como texto exacto,
  // así que buscamos por prefijo "template_${sigla}_"
  const prefix = `template_${cursoSigla}_`;
  const suffixRegex = /_(\d+)\.pdf$/i;

  let best = null; // { file, grupoNumber }
  for (const f of all) {
    if (!f.toLowerCase().endsWith(".pdf")) continue;
    if (!f.startsWith(prefix)) continue;

    const m = f.match(suffixRegex);
    if (!m) continue;

    const g = Number(m[1]);
    if (!Number.isFinite(g)) continue;

    if (!best || g > best.grupoNumber) {
      best = { file: f, grupoNumber: g };
    }
  }

  let templatePath = null;
  let grupo = null;

  if (best) {
    templatePath = path.join(templatesDir, best.file);
    grupo = String(best.grupoNumber);
    console.log("🟢 Usando template:", best.file, "| grupo:", grupo);
  } else {
    // fallback a template base sin grupo
    const templateBase = `template_${cursoSigla}.pdf`;
    const basePath = path.join(templatesDir, templateBase);

    if (fs.existsSync(basePath)) {
      templatePath = basePath;
      grupo = null;
      console.log("🟡 Usando template base:", templateBase);
    } else {
      // fallback genérico
      const generalPath = path.join(templatesDir, "template_general.pdf");
      if (!fs.existsSync(generalPath)) {
        throw new Error("❌ No se encontró ninguna plantilla disponible.");
      }
      templatePath = generalPath;
      grupo = null;
      console.warn("⚠️ Usando template_general.pdf");
    }
  }

  dataCertificado.grupo = grupo;

  // 3) Leer template
  const existingPdfBytes = fs.readFileSync(templatePath);

  // 4) Editar PDF
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);


  const firstPage = pdfDoc.getPages()[0];
  const { width, height } = firstPage.getSize();
  console.log("📄 Tamaño página:", width, height);

  // 5) Pintar nombres/apellidos (ajusta coords según tu template)
  const nombres = user.firstName || "";
  const apellidos = user.lastName || "";
  const nombreCompleto = `${user.firstName || ""} ${user.lastName || ""}`.trim();


  const fontSizeNombre = 40;
  const fontSizeApellido = 40;
  const fontSizeNombreCompleto = 33;
  const minFontSize = 24;
  const maxWidth = width - 100;

  const nombreWidth = font.widthOfTextAtSize(nombres, fontSizeNombre);
  const apellidoWidth = font.widthOfTextAtSize(apellidos, fontSizeApellido);
  let nombreCompletoWidth = font.widthOfTextAtSize(nombreCompleto, fontSizeNombreCompleto);

  while (nombreCompletoWidth > maxWidth && fontSizeNombreCompleto > minFontSize) {
    fontSizeNombreCompleto -= 1;
    nombreCompletoWidth = fontRegular.widthOfTextAtSize(
      nombreCompleto,
      fontSizeNombreCompleto
    );
  }

  const yNombre = 250;
  const yApellido = 200;
  const yNombreCompleto = 260;


  const xNombre = (width - nombreWidth) / 2;
  const xApellido = (width - apellidoWidth) / 2;
  const xNombreCompleto = (width - nombreCompletoWidth) / 2;


  // firstPage.drawText(nombres, {
  //   x: xNombre,
  //   y: yNombre,
  //   size: fontSizeNombre,
  //   font: fontBold,
  //   color: rgb(0, 0, 0),
  // });

  // firstPage.drawText(apellidos, {
  //   x: xApellido,
  //   y: yApellido,
  //   size: fontSizeApellido,
  //   font: fontBold,
  //   color: rgb(0, 0, 0),
  // });

  firstPage.drawText(nombreCompleto, {
    x: xNombreCompleto,
    y: yNombreCompleto,
    size: fontSizeNombreCompleto,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });

  // 6) Guardar bytes
  const pdfBytes = await pdfDoc.save();

  // 7) Guardar en uploads/certificados/<sigla>/
  const outputDir = path.join(__dirname, "..", "..", "uploads", "certificados", cursoSigla);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const grupoSuffix = grupo ? `_g${grupo}` : "";
  const fileName = `${dataCertificado.cedula}_${cursoSigla}${grupoSuffix}.pdf`;
  const outputPath = path.join(outputDir, fileName);

  fs.writeFileSync(outputPath, pdfBytes);
  console.log("📄 Certificado generado (sin firma) en:", outputPath);

  // 8) Firmar (mock/real)
  let signedPath = outputPath;
  try {
    signedPath = await firmarPdfFirmaEc(outputPath, dataCertificado);
    console.log("✅ Certificado firmado en:", signedPath);
  } catch (err) {
    console.error("❌ Error firmando el certificado:", err);
    signedPath = outputPath;
  }

  // 9) Borrar sin firma si generó otro
  try {
    if (fs.existsSync(outputPath) && outputPath !== signedPath) {
      fs.unlinkSync(outputPath);
      console.log("🗑️ Archivo sin firma eliminado:", outputPath);
    }
  } catch (err) {
    console.error("⚠️ No se pudo eliminar el PDF sin firma:", err);
  }

  return {
    outputPath: signedPath,
    fileName: path.basename(signedPath),
    dataCertificado,
  };
};
