const nodemailer = require("nodemailer");

const sendEmail = (options) => new Promise((resolve, reject) => {

    const transporter = nodemailer.createTransport({
        host: "smtp.hostinger.com", // Servidor SMTP correcto
        port: 465,                  // o 587 si prefieres TLS
        secure: true,               // true para 465, false para 587
        auth: {
            user: process.env.EMAIL,      // ej: no-reply@acadexeduc.com
            pass: process.env.PASSWORD,   // contraseña del buzón de Hostinger
        },
        tls: {
            rejectUnauthorized: false,
        },
    });

    const mailOptions = {
        from: `"Eduka" <noreply@acadexeduc.com>`,
        ...options,
    };
    transporter.sendMail(mailOptions, (error, info) => {
        console.log(error, info)
        if (error) {
            console.log(error);
            return reject({ message: "Error sending email", error })
        }
        return resolve({ message: "Email sent successfully" })
    })
})

module.exports = sendEmail;