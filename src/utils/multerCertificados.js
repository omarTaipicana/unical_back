const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Carpeta temporal donde se guardarán los ZIP subidos
const uploadDir = path.join(__dirname, "..", "uploads", "certificados_tmp");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "_" + file.originalname);
  },
});

const fileFilter = (req, file, cb) => {
  // Solo aceptar ZIP
  if (file.mimetype === "application/zip" ||
      file.mimetype === "application/x-zip-compressed") {
    cb(null, true);
  } else {
    cb(new Error("Solo se permiten archivos ZIP para certificados"));
  }
};

const uploadCertificados = multer({
  storage,
  fileFilter,
  limits: { fileSize: 250 * 1024 * 1024 }, // 50 MB
});

module.exports = uploadCertificados;
