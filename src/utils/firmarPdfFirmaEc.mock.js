// utils/firmarPdfFirmaEc.js

const fs = require("fs");
const path = require("path");

module.exports = async function firmarPdfFirmaEc(pdfPath, dataCertificado) {
  console.log("🔏 [MOCK] Simulando firma del PDF (modo local):", pdfPath);

  if (!fs.existsSync(pdfPath)) {
    throw new Error("El archivo PDF a firmar no existe: " + pdfPath);
  }

  // Leer PDF original
  const buffer = fs.readFileSync(pdfPath);

  // Crear ruta para PDF firmado simulado
  const ext = path.extname(pdfPath);
  const signedPath = pdfPath.replace(ext, `_firmado${ext}`);

  // Guardar el mismo PDF como "firmado"
  fs.writeFileSync(signedPath, buffer);

  console.log("🔐 [MOCK] PDF firmado guardado en:", signedPath);

  return signedPath;
};
