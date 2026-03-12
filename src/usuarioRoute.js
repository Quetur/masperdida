import express from "express";
import pool from "../db.js";
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
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
// Cambiamos el nombre de la ruta a /registrar_usuario
router.post("/registrar_usuario", async (req, res) => {
    try {
        const { nombre, celular, email, pass, metodo_contacto } = req.body;

        // --- REGLA DE NEGOCIO: Definición del ID Universal ---
        // Si es WhatsApp, el ID es solo el número. Si es Email, es el correo.
        const idUsuario = metodo_contacto === "ws" 
            ? celular.replace(/\D/g, "") 
            : email.toLowerCase().trim();

        // --- SEGURIDAD ---
        const salt = await bcryptjs.genSalt(10);
        const passHash = await bcryptjs.hash(pass, salt);
        
        // Generamos el PIN que se guardará temporalmente en la columna 'estado'
        const pinGenerado = Math.floor(1000 + Math.random() * 9000).toString();

        // --- BASE DE DATOS ---
        // Preparamos los 9 campos según la estructura de tu tabla
        const sql = `INSERT INTO users (id, username, mail, password, categoria, estado, direccion, barrio, intentos) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        // Ejecutamos el INSERT
        // Enviamos "Pendiente" a dirección y barrio porque tu tabla NO acepta NULLs en esos campos
        await pool.query(sql, [
            idUsuario,          // id (PK)
            nombre,             // username (varchar 16 - Cuidado con el largo!)
            email || null,      // mail
            passHash,           // password (hash)
            "user",             // categoria
            pinGenerado,        // estado (aquí vive el PIN hasta que verifique)
            "Pendiente",        // direccion (NOT NULL)
            "Pendiente",        // barrio (NOT NULL)
            5                   // intentos (Default de tabla)
        ]);

        // --- ENVÍO DE CÓDIGO ---
        try {
            if (metodo_contacto === "ws") {
                // Envío por WhatsApp
                await whastapp.enviarMensajeRegistro(idUsuario, nombre, pinGenerado);
            } else {
                // Envío por Email
                const mailOptions = {
                    from: process.env.MAIL_USER,
                    to: email,
                    subject: "Mascota Perdida - Código de verificación",
                    html: `
                        <div style="font-family: sans-serif; border: 1px solid #ddd; padding: 20px; border-radius: 10px;">
                            <h1 style="color: #3498db;">Hola ${nombre}:</h1>
                            <p style="font-size: 1.1em;">Tu código de verificación para el portal de mascotas es:</p>
                            <div style="background: #f4f4f4; padding: 15px; text-align: center; font-size: 2em; letter-spacing: 5px; font-weight: bold;">
                                ${pinGenerado}
                            </div>
                            <p>Este código expirará pronto. No lo compartas con nadie.</p>
                        </div>
                    `
                };
                await transporter.sendMail(mailOptions);
            }
        } catch (sendError) {
            console.error("Error crítico en envío de código:", sendError);
            // Si el mensaje no sale, borramos el usuario para que no quede "trabado" y pueda reintentar
            await pool.query("DELETE FROM users WHERE id = ?", [idUsuario]);
            return res.status(500).json({ 
                success: false, 
                error: "El servicio de mensajería falló. Por favor, intenta más tarde." 
            });
        }

        // --- RESPUESTA EXITOSA ---
        return res.json({
            success: true,
            destino: idUsuario,
            metodo: metodo_contacto,
            intentos: 5
        });

    } catch (error) {
        console.error("ERROR EN REGISTRO_USUARIO:", error);
        
        let msg = "Error interno del servidor.";
        
        // Manejo de errores específicos de MySQL
        if (error.code === "ER_DUP_ENTRY") {
            msg = "Este identificador (Celular o Email) ya se encuentra registrado.";
        } else if (error.code === "ER_DATA_TOO_LONG") {
            msg = "El nombre es demasiado largo (máximo 16 caracteres).";
        }

        res.status(400).json({ 
            success: false, 
            error: msg 
        });
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

        const salt = await bcryptjs.genSalt(10);
        const passHash = await bcryptjs.hash(nuevaPass, salt);

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


router.post("/login", async (req, res, next) => {
    try {
        // CORRECCIÓN CRÍTICA: Extraemos 'pass' porque así llega desde tu frontend
        const { celular, pass } = req.body; 
        
        // Debug para confirmar en terminal
        console.log("--- Intento de Login ---");
        console.log("Body recibido:", req.body);

        // 1. LÓGICA DE IDENTIFICACIÓN UNIVERSAL
        // Si tiene @ es email, si no, limpiamos para que sea solo números (ID de tabla)
        const esEmail = celular && celular.includes("@");
        const loginID = esEmail 
            ? celular.toLowerCase().trim() 
            : (celular ? celular.replace(/\D/g, '') : null);
        
        console.log("ID procesado para búsqueda:", loginID);

        // Validamos que existan ambos datos
        if (!loginID || !pass) {
            return res.json({ 
                success: false, 
                error: "Ingrese sus credenciales" 
            });
        }

        // 2. BÚSQUEDA EN BASE DE DATOS
        // Buscamos siempre por el campo 'id' (PK de tu tabla)
        const [results] = await pool.query("SELECT * FROM users WHERE id = ?", [loginID]);
        const user = results[0];

        if (!user) {
            return res.json({ 
                success: false, 
                error: "Usuario no encontrado" 
            });
        }

        // 3. VALIDACIÓN DE CREDENCIALES
        // Comparación de Contraseña (bcrypt)
        const esPassValida = await bcryptjs.compare(pass, user.password);
        
        // Comparación de PIN (el PIN está guardado en la columna 'estado')
        const esPinValido = (pass === user.estado);

        console.log("¿Password válida?:", esPassValida);
        console.log("¿PIN válido?:", esPinValido);

        if (!esPassValida && !esPinValido) {
            return res.json({ 
                success: false, 
                error: "Contraseña o PIN incorrectos" 
            });
        }

        // 4. MANEJO DE VERIFICACIÓN AUTOMÁTICA
        // Si el usuario ingresó con el PIN, lo verificamos de inmediato en la DB
        if (esPinValido) {
            await pool.query("UPDATE users SET estado = 'verificado' WHERE id = ?", [user.id]);
            user.estado = 'verificado'; // Actualizamos localmente para el siguiente check
            console.log("Cuenta verificada automáticamente mediante PIN.");
        }

        // Bloqueo si intenta entrar con pass normal pero nunca verificó la cuenta
        if (user.estado !== 'verificado') {
            return res.json({ 
                success: false, 
                error: "Debes verificar tu cuenta con el código enviado antes de entrar." 
            });
        }

        // 5. GENERACIÓN DE SESIÓN
        req.session.user = {
            id: user.id,
            nombre: user.username 
        };

        // 6. GENERACIÓN DE TOKEN JWT
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRETO, {
            expiresIn: '1h' 
        });

        // 7. GUARDADO DE SESIÓN Y COOKIE
        req.session.save((err) => {
            if (err) {
                console.error("Error al guardar sesión:", err);
                return res.json({ success: false, error: "Error al guardar sesión" });
            }

            res.cookie('token_acceso', token, { 
                httpOnly: false, 
                secure: false,   // Cambiar a true si usas HTTPS
                maxAge: 3600000, 
                path: '/'        
            });

            return res.json({
                success: true,
                message: esPinValido ? "¡Cuenta verificada e ingreso exitoso!" : "¡Ingreso exitoso!",
                user: user.username,
                token: token
            });
        });

    } catch (error) {
        console.error("Error crítico en el login:", error);
        res.status(500).json({ success: false, error: "Error interno del servidor" });
    }
});


export default router;