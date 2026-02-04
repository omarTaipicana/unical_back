// utils/firmarPdfFirmaEc.js
// Router entre distintas implementaciones de firma:
// - MOCK (desarrollo local)
// - UBUNTU (producción, firma real en el futuro)

const mode = process.env.FIRMA_MODE || "mock";

let impl;

if (mode === "ubuntu") {
  console.log("🔧 FIRMA_MODE=ubuntu → usando implementación Ubuntu");
  impl = require("./firmarPdfFirmaEc.ubuntu");
} else {
  console.log("🔧 FIRMA_MODE=mock (o vacío) → usando implementación MOCK");
  impl = require("./firmarPdfFirmaEc.mock");
}

module.exports = impl;
