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
    console.log("ingreso en login", req.body)
    try {
        const { celular, pass } = req.body; 
        
        console.log("--- Intento de Login ---");
        
        const esEmail = celular && celular.includes("@");
        const loginID = esEmail 
            ? celular.toLowerCase().trim() 
            : (celular ? celular.replace(/\D/g, '') : null);
        
        if (!loginID || !pass) {
            return res.json({ success: false, error: "Ingrese sus credenciales" });
        }

        // 2. BÚSQUEDA EN BASE DE DATOS
        const [results] = await pool.query("SELECT * FROM users WHERE id = ?", [loginID]);
        const user = results[0];

        if (!user) {
            return res.json({ success: false, error: "Usuario no encontrado" });
        }

        // 3. VALIDACIÓN DE CREDENCIALES
        const esPassValida = await bcryptjs.compare(pass, user.password);
        const esPinValido = (pass === user.estado);

        if (!esPassValida && !esPinValido) {
            return res.json({ success: false, error: "Contraseña o PIN incorrectos" });
        }

        // 4. MANEJO DE VERIFICACIÓN AUTOMÁTICA
        if (esPinValido) {
            await pool.query("UPDATE users SET estado = 'verificado' WHERE id = ?", [user.id]);
            user.estado = 'verificado';
        }

        if (user.estado !== 'verificado') {
            return res.json({ success: false, error: "Debes verificar tu cuenta..." });
        }

        // --- CAMBIO AQUÍ: LOG DE CATEGORÍA ---
        console.log(`USUARIO IDENTIFICADO: ${user.username} | CATEGORIA: ${user.categoria}`);

        // 5. GENERACIÓN DE SESIÓN (Agregamos categoria)
        req.session.user = {
            id: user.id,
            nombre: user.username,
            categoria: user.categoria // <--- CLAVE 1
        };

        // 6. GENERACIÓN DE TOKEN JWT (Agregamos categoria al Payload)
        // Esto permite que el middleware 'isAuthenticated' recupere el rol si se reinicia el server
        const token = jwt.sign(
            { 
                id: user.id, 
                nombre: user.username,
                categoria: user.categoria // <--- CLAVE 2
            }, 
            process.env.JWT_SECRETO, 
            { expiresIn: '1h' }
        );

        // 7. GUARDADO DE SESIÓN Y COOKIE
        req.session.save((err) => {
            if (err) {
                console.error("Error al guardar sesión:", err);
                return res.json({ success: false, error: "Error al guardar sesión" });
            }

            res.cookie('token_acceso', token, { 
                httpOnly: false, 
                secure: false, 
                maxAge: 3600000, 
                path: '/'        
            });

            return res.json({
                success: true,
                message: "¡Ingreso exitoso!",
                user: user.username,
                categoria: user.categoria, // También lo enviamos al frontend por si lo necesitas
                token: token
            });
        });

    } catch (error) {
        console.error("Error crítico en el login:", error);
        res.status(500).json({ success: false, error: "Error interno del servidor" });
    }
});

router.get('/perfil/editar', async (req, res) => {
    console.log("entro en editar perfil",   req.session.user );

    // 1. Verificamos si el usuario está logueado
    // Asegúrate de que req.session.userId contenga el valor que guardaste en el login
  if (!req.session.user) {
        console.log("Sesión no encontrada, redirigiendo a signin...");
        return res.redirect('/signin');
    }

    try {
        // 2. Extraemos el ID del objeto user
        const userId = req.session.user.id; 

        // 3. Consulta a la tabla 'users' con tus campos reales
        const [rows] = await pool.query(
            'SELECT username, id, mail FROM users WHERE id = ?', 
            [userId]
        );

        if (rows.length > 0) {
            const row = rows[0];
            
            // Mapeamos para que el HBS reciba lo que espera
            const usuarioParaVista = {
                nombre: row.username,
                celular: row.id,
                email: row.mail,
                identificador: row.id // Usamos el celular como ID visual
            };

            res.render('usuario', { 
                editMode: true, 
                usuario: usuarioParaVista,
                title: 'Editar mi Perfil'
            });
        } else {
            res.redirect('/');
        }
    } catch (error) {
        console.error("Error al cargar perfil:", error);
        res.status(500).send("Error interno");
    }
});

router.post('/api/perfil/actualizar', async (req, res) => {
    // 1. Validamos usando req.session.user (según tu configuración)
    if (!req.session.user) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    // 2. Extraemos los datos del body y el ID de la sesión
    const { nombre, pass, email } = req.body; 
    const userId = req.session.user.id; // El '1151260188' que mencionaste

    try {
        if (pass && pass.trim().length >= 6) {
            // CASO A: Actualiza nombre, mail y password (en la tabla 'users')
            // Nota: Si usas bcrypt para las contraseñas, recordá hashearla antes.
            await pool.query(
                'UPDATE users SET username = ?, mail = ?, password = ? WHERE id = ?', 
                [nombre, email, pass, userId]
            );
        } else {
            // CASO B: Solo actualiza nombre y mail
            await pool.query(
                'UPDATE users SET username = ?, mail = ? WHERE id = ?', 
                [nombre, email, userId]
            );
        }

        // 3. ACTUALIZACIÓN CRÍTICA: Sincronizamos la sesión con el nuevo nombre
        // Esto hace que el nombre en el menú desplegable cambie sin refrescar sesión.
        req.session.user.nombre = nombre;

        res.json({ success: true, message: 'Perfil actualizado correctamente' });
    } catch (error) {
        console.error("Error al actualizar en tabla users:", error);
        res.status(500).json({ success: false, error: 'Error al guardar los datos en la base de datos' });
    }
});


export default router;