const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const catchError = require("../utils/catchError");
const sendEmail = require("../utils/sendEmail");
const Certificado = require("../models/Certificado");
const Inscripcion = require("../models/Inscripcion");
const User = require("../models/User");
const Course = require("../models/Course");
const ReporteCertificados = require("../models/ReporteCertificados"); 
// const sendEmail = require("../utils/sendEmail"); // lo usamos luego

// ... cabecera igual que ya tienes ...

const subirCertificadosFirmados = catchError(async (req, res) => {
  const { sigla } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: "Debe subir un archivo ZIP" });
  }

  const zipPath = req.file.path;
  const zip = new AdmZip(zipPath);
  const zipEntries = zip.getEntries();

  const carpetaEduka = path.join(
    __dirname,
    "..",
    "..",
    "uploads",
    "certificados",
    sigla
  );

  const carpetaFinal = path.join(
    __dirname,
    "..",
    "..",
    "uploads",
    "certificados_firmados",
    sigla
  );

  if (!fs.existsSync(carpetaFinal)) {
    fs.mkdirSync(carpetaFinal, { recursive: true });
  }

  const reporte = {
    procesados: [],
    duplicados: [],
    ignorados: [],
    erroneos: [],
  };

  for (const entry of zipEntries) {
    if (entry.isDirectory) continue;
    if (!entry.name.endsWith(".pdf")) continue;

    const fileName = entry.name;
    const lower = fileName.toLowerCase();

    // 1) Buscar cedula (10 dígitos)
    const match = fileName.match(/(\d{10})/);
    if (!match) {
      reporte.erroneos.push({
        archivo: fileName,
        motivo: "No contiene cédula de 10 dígitos en el nombre",
      });
      continue;
    }

    const cedula = match[1];

    // 2) Leer grupo desde el nombre si viene tipo _g1
    let grupo = null;
    const matchGrupo = fileName.match(/_g(\d+)/i);
    if (matchGrupo) {
      grupo = matchGrupo[1]; // "1", "2", etc.
    }

    // 3) Validar segunda firma por nombre
    const firmadoInstituto =
      lower.includes("firma") ||
      lower.includes("signed") ||
      lower.includes("signer") ||
      lower.includes("final") ||
      lower.includes("double");

    if (!firmadoInstituto) {
      reporte.ignorados.push({
        archivo: fileName,
        cedula,
        motivo: "El archivo no parece tener firma del instituto (por nombre)",
      });
      continue;
    }

    // 4) Buscar usuario por cédula
    const user = await User.findOne({ where: { cI: cedula } });
    if (!user) {
      reporte.erroneos.push({
        archivo: fileName,
        cedula,
        motivo: "No se encontró usuario con esa cédula",
      });
      continue;
    }

    // 5) Buscar inscripción por userId + curso
    const inscripcion = await Inscripcion.findOne({
      where: { userId: user.id, curso: sigla },
    });

    if (!inscripcion) {
      reporte.erroneos.push({
        archivo: fileName,
        cedula,
        motivo: "No se encontró inscripción para esa cédula/curso",
      });
      continue;
    }


    // 5) Buscar curso por userId + curso
    const curso = await Course.findOne({
      where: { sigla: sigla },
    });


    // 6) Ver si ya hay certificado final
    const certExistente = await Certificado.findOne({
      where: { inscripcionId: inscripcion.id, curso: sigla },
    });

    if (certExistente && certExistente.entregado) {
      reporte.duplicados.push({
        archivo: fileName,
        cedula,
        motivo: "Ya existía un certificado firmado por el instituto",
      });
      continue;
    }

    // 7) Guardar PDF final
    const finalFileName = `${cedula}_${sigla}.pdf`;
    const finalPath = path.join(carpetaFinal, finalFileName);

    fs.writeFileSync(finalPath, entry.getData());

    // 8) Borrar certificados simples de EDUKA si existen
    const posibleSimple1 = path.join(
      carpetaEduka,
      `${cedula}_${sigla}_g${grupo}_firmado.pdf`
    );
    const posibleSimple2 = path.join(carpetaEduka, `${cedula}_${sigla}.pdf`);
    const posibleSimple3 = path.join(
      carpetaEduka,
      `${cedula}_${sigla}_g${grupo}.pdf`
    );

    [posibleSimple1, posibleSimple2, posibleSimple3].forEach((p) => {
      if (p && fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    });

    // 9) URL pública
    const relativeUrl = `/uploads/certificados_firmados/${sigla}/${finalFileName}`;
    const host = `${req.protocol}://${req.get("host")}`;
    const absoluteUrl = `${host}${relativeUrl}`;

    // 10) Crear o actualizar Certificado en BD con grupo
    if (certExistente) {
      certExistente.url = absoluteUrl;
      certExistente.entregado = true;
      if (grupo) certExistente.grupo = grupo;
      await certExistente.save();
    } else {
      await Certificado.create({
        inscripcionId: inscripcion.id,
        curso: sigla,
        grupo, // ← grupo proveniente del template (via nombre de archivo)
        url: absoluteUrl,
        entregado: true,
      });
    }


    await sendEmail({
      to: user.email,
      subject: "🎓 Tu certificado está listo - EDUKA",
      html: `
  <div style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 20px; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); overflow: hidden;">
      
      <!-- Header -->
      <div style="text-align: center; background-color: #1B326B; padding: 25px;">
        <img src="https://res.cloudinary.com/desgmhmg4/image/upload/v1765358711/eduka_2026_kh3h9e.png" alt="EDUKA" style="width: 160px;" />
      </div>
      
      <!-- Body -->
      <div style="padding: 35px; text-align: center;">
        <h1 style="color: #1B326B; margin-bottom: 10px;">¡Felicitaciones ${user.firstName} ${user.lastName}!</h1>
        <h2 style="font-weight: normal; margin-bottom: 25px;">Tu certificado del curso:</h2>
        <h2 style="color: #1B326B; margin-bottom: 25px;">"${curso.nombre.toUpperCase()}"</h2>
        
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 25px;">
          Nos complace informarte que tu certificado ha sido emitido exitosamente y ya se encuentra disponible para su descarga.
        </p>

        <!-- Botón de descarga -->
        <p style="text-align: center; margin-bottom: 35px;">
          <a href="${absoluteUrl}" target="_blank"
            style="
              background-color: #4D4D4D;
              color: #ffffff;
              padding: 14px 30px;
              text-decoration: none;
              border-radius: 6px;
              font-size: 16px;
              font-weight: 600;
              display: inline-block;
              box-shadow: 0 4px 8px rgba(0,0,0,0.15);
            ">
            📄 Descargar certificado
          </a>
        </p>

        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
          Si tienes dudas o necesitas asistencia adicional, estamos aquí para ayudarte.
        </p>

        <!-- WhatsApp -->
        <p style="margin-top: 20px;">
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
            Contactar por WhatsApp
          </a>
        </p>
      </div>
      
      <!-- Footer -->
      <div style="background-color: #f0f0f0; padding: 25px; text-align: center; font-size: 13px; color: #666;">
        <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
        <p style="margin-top: 20px;">© ${new Date().getFullYear()} EDUKA. Todos los derechos reservados.</p>
      </div>
      
    </div>
  </div>
  `
    });



    reporte.procesados.push({
      archivo: fileName,
      cedula,
      grupo,
      guardadoComo: finalFileName,
      url: absoluteUrl,
    });
  }

  try {
    fs.unlinkSync(zipPath);
  } catch (err) {
    console.error("⚠️ No se pudo borrar el ZIP temporal:", err);
  }


  // 13) Enviar correo de resumen al instituto + a ti
  // 🧾 Guardar reporte en BD
try {
  const { procesados, duplicados, ignorados, erroneos } = reporte;

  const totalProcesados = procesados.length;
  const totalDuplicados = duplicados.length;
  const totalIgnorados = ignorados.length;
  const totalErroneos = erroneos.length;

  await ReporteCertificados.create({
    curso: sigla,
    procesados: totalProcesados,
    duplicados: totalDuplicados,
    ignorados: totalIgnorados,
    erroneos: totalErroneos,
    detalle: reporte, // guarda todo el objeto { procesados, duplicados, ignorados, erroneos }
    // usuario: req.user?.email || null  // si más adelante usas auth, puedes guardar quién hizo la carga
  });
} catch (err) {
  console.error("⚠️ Error guardando reporte de certificados en BD:", err);
}


  try {
    const institEmail = process.env.INSTITUTO_EMAIL;
    const edukaEmail = process.env.EDUKA_EMAIL;
    const curso = await Course.findOne({
      where: { sigla: sigla },
    });

    const acadexEmail = "acadexeduc@gmail.com"


    const { procesados, duplicados, ignorados, erroneos } = reporte;

    const totalProcesados = procesados.length;
    const totalDuplicados = duplicados.length;
    const totalIgnorados = ignorados.length;
    const totalErroneos = erroneos.length;

    const filasProcesados = procesados
      .map(
        (p) => `
        <tr>
          <td style="padding: 6px 10px; border: 1px solid #ddd;">${p.cedula}</td>
          <td style="padding: 6px 10px; border: 1px solid #ddd;">${p.grupo || "-"}</td>
          <td style="padding: 6px 10px; border: 1px solid #ddd;">${p.guardadoComo}</td>
          <td style="padding: 6px 10px; border: 1px solid #ddd;">
            <a href="${p.url}" target="_blank">Ver</a>
          </td>
        </tr>
      `
      )
      .join("");

    const htmlProcesados =
      totalProcesados > 0
        ? `
      <h3 style="margin-top:20px;">Certificados procesados (${totalProcesados})</h3>
      <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
        <thead>
          <tr style="background-color:#f0f0f0;">
            <th style="padding: 8px 10px; border: 1px solid #ddd; text-align:left;">Cédula</th>
            <th style="padding: 8px 10px; border: 1px solid #ddd; text-align:left;">Grupo</th>
            <th style="padding: 8px 10px; border: 1px solid #ddd; text-align:left;">Archivo</th>
            <th style="padding: 8px 10px; border: 1px solid #ddd; text-align:left;">Enlace</th>
          </tr>
        </thead>
        <tbody>
          ${filasProcesados}
        </tbody>
      </table>
    `
        : "<p>No hubo certificados procesados correctamente.</p>";

    const htmlDuplicados =
      totalDuplicados > 0
        ? `
      <h3 style="margin-top:20px;">Duplicados (${totalDuplicados})</h3>
      <ul>
        ${duplicados
          .map(
            (d) =>
              `<li>${d.archivo} - cédula: ${d.cedula} (${d.motivo})</li>`
          )
          .join("")}
      </ul>
    `
        : "";

    const htmlIgnorados =
      totalIgnorados > 0
        ? `
      <h3 style="margin-top:20px;">Ignorados (${totalIgnorados})</h3>
      <ul>
        ${ignorados
          .map(
            (i) =>
              `<li>${i.archivo} - cédula: ${i.cedula} (${i.motivo})</li>`
          )
          .join("")}
      </ul>
    `
        : "";

    const htmlErroneos =
      totalErroneos > 0
        ? `
      <h3 style="margin-top:20px;">Erróneos (${totalErroneos})</h3>
      <ul>
        ${erroneos
          .map(
            (e) =>
              `<li>${e.archivo} (${e.motivo})</li>`
          )
          .join("")}
      </ul>
    `
        : "";

    await sendEmail({
      to: `${institEmail}, ${edukaEmail}, ${acadexEmail}`,
      subject: `Resumen de carga de certificados firmados - Curso ${curso.nombre.toUpperCase()}`,
      html: `
      <div style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 20px; color: #333;">
        <div style="max-width: 800px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); overflow: hidden;">
          
          <div style="text-align: center; background-color: #1B326B; padding: 20px;">
            <img src="https://res.cloudinary.com/desgmhmg4/image/upload/v1765358711/eduka_2026_kh3h9e.png" alt="EDUKA" style="width: 160px;" />
          </div>

          <div style="padding: 25px;">
            <h2 style="color:#1B326B; margin-bottom:10px;">Resumen de procesamiento de certificados firmados</h2>
            <p style="font-size:15px; margin-bottom:15px;">
              Curso: <strong>${curso.nombre.toUpperCase()}</strong>
            </p>
            <p style="font-size:14px; margin-bottom:15px;">
              <strong>Procesados:</strong> ${totalProcesados} &nbsp; | &nbsp;
              <strong>Duplicados:</strong> ${totalDuplicados} &nbsp; | &nbsp;
              <strong>Ignorados:</strong> ${totalIgnorados} &nbsp; | &nbsp;
              <strong>Erróneos:</strong> ${totalErroneos}
            </p>

            ${htmlProcesados}
            ${htmlDuplicados}
            ${htmlIgnorados}
            ${htmlErroneos}

            <p style="font-size:13px; color:#666; margin-top:25px;">
              Este correo se genera automáticamente después de procesar el archivo ZIP cargado en la plataforma EDUKA.
            </p>
          </div>

          <div style="background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666;">
            © ${new Date().getFullYear()} EDUKA. Todos los derechos reservados.
          </div>

        </div>
      </div>
      `,
    });

  } catch (err) {
    console.error("⚠️ Error enviando correo de resumen al instituto/admin:", err);
  }

  return res.json({
    mensaje: "Procesado finalizado",
    reporte,
  });
});

module.exports = { subirCertificadosFirmados };
