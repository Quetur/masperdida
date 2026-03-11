import express from "express";
import pool from "../db.js";
import bcrypt from "bcryptjs";
import whastapp from "./whatsapp.js";
import nodemailer from "nodemailer";

const router = express.Router();

// Configuración de Email
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
    },
    tls: {
        rejectUnauthorized: false,
    },
});

/**
 * Muestra la página de registro
 */
router.get("/registro", (req, res) => {
    res.render("usuario", { title: "Registro - Mascota Perdida" });
});

/**
 * 1. REGISTRO INICIAL
 * Sirve para usuario.hbs
 */
router.post("/registrar", async (req, res) => {
    try {
        const { nombre, celular, email, pass, metodo_contacto } = req.body;

        const idUsuario = metodo_contacto === "ws" 
            ? celular.replace(/\D/g, "") 
            : email.toLowerCase().trim();

        const salt = await bcrypt.genSalt(10);
        const passHash = await bcrypt.hash(pass, salt);
        const pinGenerado = Math.floor(1000 + Math.random() * 9000).toString();

        // Agregué 'intentos' en 5 por defecto al insertar
        const sql = `INSERT INTO users (id, username, mail, password, categoria, estado, direccion, barrio, intentos) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        await pool.query(sql, [idUsuario, nombre, email || null, passHash, "user", pinGenerado, "", "", 5]);

        try {
            if (metodo_contacto === "ws") {
                await whastapp.enviarMensajeRegistro(idUsuario, nombre, pinGenerado);
            } else {
                const mailOptions = {
                    from: process.env.MAIL_USER,
                    to: email,
                    subject: "Mascota Perdida - Código de verificación",
                    html: `<h1>Hola ${nombre}:</h1><p>Tu PIN es: <b>${pinGenerado}</b></p>`
                };
                await transporter.sendMail(mailOptions);
            }
        } catch (sendError) {
            await pool.query("DELETE FROM users WHERE id = ?", [idUsuario]);
            return res.status(500).json({ success: false, error: "Error al enviar el código de verificación." });
        }

        return res.json({
            success: true,
            destino: idUsuario,
            metodo: metodo_contacto,
            intentos: 5
        });

    } catch (error) {
        let msg = "Error interno del servidor.";
        if (error.code === "ER_DUP_ENTRY") msg = "Este Email o WhatsApp ya está registrado.";
        res.status(400).json({ success: false, error: msg });
    }
});

/**
 * 2. VALIDACIÓN DE PIN (REGISTRO)
 * Sirve para usuario.hbs
 */
router.post("/validar", async (req, res) => {
    try {
        const { pin, destino_verif, intentos } = req.body;
        const [rows] = await pool.query("SELECT estado FROM users WHERE id = ?", [destino_verif]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: "Usuario no encontrado." });
        }

        if (pin === rows[0].estado) {
            await pool.query("UPDATE users SET estado = 'verificado' WHERE id = ?", [destino_verif]);
            return res.json({ success: true });
        } else {
            const restantes = parseInt(intentos) - 1;
            if (restantes <= 0) {
                // Si falla registro, borramos para que pueda reintentar de cero
                await pool.query("DELETE FROM users WHERE id = ? AND estado != 'verificado'", [destino_verif]);
                return res.json({ success: false, intentosRestantes: 0, agotado: true });
            }
            return res.json({ success: false, intentosRestantes: restantes });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: "Error en la validación." });
    }
});

/**
 * 3. SOLICITUD DE RECUPERACIÓN
 * Sirve para signin.hbs
 */
router.post("/recuperar-password", async (req, res) => {
    const { destino } = req.body;
    const esEmail = destino.includes("@");
    const idUsuario = esEmail ? destino.toLowerCase().trim() : destino.replace(/\D/g, "");

    try {
        const [rows] = await pool.query("SELECT username FROM users WHERE id = ?", [idUsuario]);
        
        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: "No encontramos esa cuenta." });
        }

        const pinTemporal = Math.floor(1000 + Math.random() * 9000).toString();
        // Guardamos el PIN en 'estado' y reseteamos intentos si fuera necesario
        await pool.query("UPDATE users SET estado = ? WHERE id = ?", [pinTemporal, idUsuario]);

        if (esEmail) {
            const mailOptions = {
                from: process.env.MAIL_USER,
                to: idUsuario,
                subject: "PIN de Recuperación - Mascota Perdida",
                html: `<h3>Hola ${rows[0].username}:</h3>
                       <p>Tu PIN temporal es: <b>${pinTemporal}</b></p>`
            };
            await transporter.sendMail(mailOptions);
        } else {
            await whastapp.enviarMensajeRegistro(idUsuario, rows[0].username, pinTemporal);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error al procesar la recuperación." });
    }
});

/**
 * 4. VALIDACIÓN DE PIN (RECUPERACIÓN)
 * Sirve para el modal de signin.hbs
 */
router.post("/validar-pin-recuperacion", async (req, res) => {
    try {
        const { pin, destino, intentos } = req.body;
        const idUsuario = destino.includes("@") ? destino.toLowerCase().trim() : destino.replace(/\D/g, "");

        const [rows] = await pool.query("SELECT estado FROM users WHERE id = ?", [idUsuario]);

        if (rows.length === 0) return res.status(404).json({ success: false, error: "Usuario no encontrado." });

        if (pin === rows[0].estado) {
            return res.json({ success: true });
        } else {
            const restantes = parseInt(intentos) - 1;
            if (restantes <= 0) {
                await pool.query("UPDATE users SET estado = 'expirado' WHERE id = ?", [idUsuario]);
                return res.json({ success: false, intentosRestantes: 0, agotado: true });
            }
            return res.json({ success: false, intentosRestantes: restantes, agotado: false });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: "Error interno al validar PIN." });
    }
});

/**
 * 5. CONFIRMACIÓN FINAL DE PASSWORD
 * Sirve para signin.hbs
 */
router.post("/confirmar-nuevo-password", async (req, res) => {
    const { destino, pin, nuevaPass } = req.body;
    const idUsuario = destino.includes("@") ? destino.toLowerCase().trim() : destino.replace(/\D/g, "");

    try {
        const [rows] = await pool.query("SELECT estado FROM users WHERE id = ?", [idUsuario]);
        
        if (rows.length === 0 || rows[0].estado !== pin) {
            return res.status(400).json({ success: false, error: "PIN incorrecto o expirado." });
        }

        const salt = await bcrypt.genSalt(10);
        const passHash = await bcrypt.hash(nuevaPass, salt);

        await pool.query("UPDATE users SET password = ?, estado = 'verificado' WHERE id = ?", [passHash, idUsuario]);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error al cambiar la contraseña." });
    }
});

/**
 * OTROS: Verificación de existencia y limpieza
 */
router.post("/verificar-usuario-existente", async (req, res) => {
    try {
        const { codigo } = req.body;
        const [rows] = await pool.query("SELECT id FROM users WHERE id = ? LIMIT 1", [codigo]);
        res.json({ existe: rows.length > 0 });
    } catch (error) { res.status(500).json({ existe: false }); }
});

router.post("/limpiar-registro-fallido", async (req, res) => {
    try {
        const { celular } = req.body;
        await pool.query("DELETE FROM users WHERE id = ? AND estado != 'verificado'", [celular]);
        res.json({ status: "ok" });
    } catch (error) { res.status(500).json({ status: "error" }); }
});

export default router;