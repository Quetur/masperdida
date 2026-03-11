import express from "express";
import pool from "../db.js";
import bcrypt from "bcryptjs";
import whastapp from "./whatsapp.js";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com", // Para pruebas, usa ethereal.email
  port: 587,
  secure: false, // true para puerto 465, false para otros puertos como 587
  auth: {
    user: process.env.MAIL_USER, // Tu usuario de mail
    pass: process.env.MAIL_PASS, // Tu password de mail
  },
  tls: {
    // Esta es la clave para ignorar el error del certificado
    rejectUnauthorized: false,
  },
});
console.log("transporter", transporter);

const router = express.Router();

// Objeto temporal para guardar registros pendientes de verificar
// (En un sistema real usarías una base de datos o Redis)
const verificacionesPendientes = {};

/**
 * RUTA GET: Muestra la página de registro (usuario.hbs)
 */
router.get("/registro", (req, res) => {
  console.log("🐾 Mostrando página de registro de nuevo usuario");
  res.render("usuario", {
    title: "Registro - Mascota Perdida",
  });
});

router.post("/registrar", async (req, res) => {
  try {
    const { nombre, celular, email, pass, metodo_contacto } = req.body;

    // 1. Determinar el ID principal
    const idUsuario =
      metodo_contacto === "ws"
        ? celular.replace(/\D/g, "")
        : email.toLowerCase().trim();

    // 2. ENCRIPTAR LA CONTRASEÑA
    const salt = await bcrypt.genSalt(10);
    const passHash = await bcrypt.hash(pass, salt);

    // 3. Generar PIN de 4 dígitos
    const pinGenerado = Math.floor(1000 + Math.random() * 9000).toString();

    // 4. INSERT en la tabla 'users'
    const sql = `INSERT INTO users (id, username, mail, password, categoria, estado, direccion, barrio) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
      idUsuario,
      nombre,
      email || null,
      passHash,
      "user",
      pinGenerado,
      "",
      "",
    ];

    await pool.query(sql, values);

    // 5. ENVÍO DEL CÓDIGO
    if (metodo_contacto === "ws") {
      await whastapp.enviarMensajeRegistro(idUsuario, nombre, pinGenerado);
    } else {
      // Ejemplo rápido si usas nodemailer más adelante
      console.log(`📧 Enviando Email a ${idUsuario} con PIN: ${pinGenerado}`);

      const contentHTML = `<h1 style="color: #5e9ca0; text-align: center;">Mascota Perdida</h1>
                           <h2 style="color: #2e6c80; text-align: left;">Hola ${nombre}:</h2>
                           <h2 style="color: #2e6c80; text-align: left;">PIN de verificacion :</h2>
                           <h1 style="color: #3730ff; ; text-align: center;"><strong>${pinGenerado}</strong></h1>
                           <p><strong>Si usted no envio un pedido de verificacion ignore este mensaje.</strong></p>
                           <p><strong>Saludos !</strong></p>
                           <p><strong>www.mascotaperdida.com.ar</strong></p>`;
      const mailOptions = {
        from: "jrosavila@gmail.com",
        to: email,
        subject: "Mascota Perdida - Codigo de verificacion",
        html: contentHTML,
      };
      var result = await transporter.sendMail(mailOptions);
    }

    console.log(
      `✅ Registro DB: ${nombre} | ID: ${idUsuario} | PIN: ${pinGenerado}`
    );

    // --- CAMBIO CLAVE: Responder con JSON para el fetch del frontend ---
    return res.json({
      success: true,
      showModal: true,
      destino: idUsuario,
      metodo: metodo_contacto,
      intentos: 5,
    });
  } catch (error) {
    console.error("❌ Error en Registro:", error);

    let mensajeError = "Ocurrió un error al procesar el registro.";
    if (error.code === "ER_DUP_ENTRY") {
      mensajeError = "Este identificador (Email o Celular) ya está registrado.";
    }

    // Responder con error en formato JSON
    return res.status(400).json({
      success: false,
      error: mensajeError,
    });
  }
});

/**
 * RUTA POST: Valida el PIN ingresado por el usuario
 */
router.post("/validar", async (req, res) => {
  try {
    const { pin, destino_verif, metodo_verif, intentos, nombre } = req.body;
    console.log("validar :", pin, destino_verif, metodo_verif, intentos);
    // 1. Aseguramos que tomamos el número actual que viene del frontend
    const intentosActuales = parseInt(intentos);

    // BUSQUEDA EN BD
    const [rows] = await pool.query("SELECT estado FROM users WHERE id = ?", [
      destino_verif,
    ]);

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Usuario no encontrado" });
    }

    const pinEnBD = rows[0].estado;

    if (pin === pinEnBD) {
      // ✅ ÉXITO: Usuario verificado
      console.log("pin correcto");
      await pool.query("UPDATE users SET estado = ? WHERE id = ?", [
        "verificado",
        destino_verif,
      ]);
      return res.json({ success: true });
    } else {
      // ❌ FALLO: Restamos uno al contador que recibimos
      const restantes = intentosActuales - 1;

      if (restantes <= 0) {
        // 🗑️ BORRADO: Se acabaron los intentos, eliminamos el registro incompleto
        await pool.query("DELETE FROM users WHERE id = ? AND estado != ?", [
          destino_verif,
          "verificado",
        ]);

        return res.json({
          success: false,
          intentosRestantes: 0,
          agotado: true, // Esta bandera le dirá al JS que vaya al Home
        });
      }

      // Enviamos el nuevo número de intentos para que el JS actualice el DOM
      return res.json({
        success: false,
        intentosRestantes: restantes,
        agotado: false,
      });
    }
  } catch (error) {
    console.error("ERROR CRÍTICO EN /VALIDAR:", error);
    res
      .status(500)
      .json({ success: false, error: "Error interno del servidor" });
  }
});

router.post("/verificar-usuario-existente", async (req, res) => {
  console.log("entro en verificar usuario", req.body);
  try {
    const { codigo } = req.body;

    // Validar que el código no llegó vacío
    if (!codigo) {
      return res
        .status(400)
        .json({ existe: false, error: "Código no proporcionado" });
    }

    // Usamos tu estructura: el 'id' de la tabla 'users' es el email o whatsapp
    const [rows] = await pool.query(
      "SELECT id FROM users WHERE id = ? LIMIT 1",
      [codigo]
    );

    if (rows.length > 0) {
      res.json({ existe: true });
    } else {
      res.json({ existe: false });
    }
  } catch (error) {
    console.error("Error en la base de datos:", error);
    res
      .status(500)
      .json({ existe: false, error: "Error interno del servidor" });
  }
});

/**
 * RUTA POST: Verifica si el código ingresado es correcto
 */
router.post("/verificar-codigo", async (req, res) => {
  try {
    let { codigo, celular, intentos } = req.body;
    intentos = parseInt(intentos); // Convertimos a número

    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [
      celular,
    ]);
    const usuario = rows[0];

    if (usuario && codigo === usuario.estado) {
      await pool.query("UPDATE users SET estado = ? WHERE id = ?", [
        "verificado",
        celular,
      ]);
      return res.redirect("/signin?registro=exitoso");
    } else {
      // RESTAMOS UN INTENTO
      const nuevosIntentos = intentos - 1;

      if (nuevosIntentos <= 0) {
        // Opcional: Borrar de la DB si agota intentos
        await pool.query(
          'DELETE FROM users WHERE id = ? AND estado != "verificado"',
          [celular]
        );
        return res.render("usuario", {
          error: "Has agotado los intentos. Por favor, regístrate de nuevo.",
        });
      }

      // Volvemos a mostrar el modal con el nuevo número de intentos
      return res.render("usuario", {
        showModal: true,
        celular: celular,
        error_pin: "PIN incorrecto.",
        intentos: nuevosIntentos, // Enviamos el nuevo valor (4, 3, 2...)
      });
    }
  } catch (error) {
    res.redirect("/registro");
  }
});

// Ruta para limpiar registros fallidos
router.post("/limpiar-registro-fallido", async (req, res) => {
  const { celular } = req.body;
  await pool.query("DELETE FROM users WHERE id = ? AND estado != ?", [
    celular,
    "verificado",
  ]);
  res.json({ status: "ok" });
});

export default router;
