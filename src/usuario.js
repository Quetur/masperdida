import express from 'express';
import pool from "../db.js"; 
import bcrypt from 'bcryptjs';
import whastapp from './whatsapp.js';

const router = express.Router();

// Objeto temporal para guardar registros pendientes de verificar
// (En un sistema real usarías una base de datos o Redis)
const verificacionesPendientes = {};

/**
 * RUTA GET: Muestra la página de registro (usuario.hbs)
 */
router.get('/registro', (req, res) => {
    console.log("🐾 Mostrando página de registro de nuevo usuario");
    res.render('usuario', {
        title: 'Registro - Mascota Perdida'
    });
});

/**
 * RUTA POST: Inicia el registro y genera el PIN de verificación
 */
router.post('/registrar', async (req, res) => {
    try {
        const { nombre, celular, email, pass } = req.body;

        // 1. Limpiar el celular (ID): Solo números
        const celularLimpio = celular.replace(/\D/g, ''); 

        // 2. ENCRIPTAR LA CONTRASEÑA
        const salt = await bcrypt.genSalt(10);
        const passHash = await bcrypt.hash(pass, salt);

        // 3. Generar PIN de 4 dígitos
        const pinGenerado = Math.floor(1000 + Math.random() * 9000).toString();

        // 4. INSERT en la tabla 'users'
        const sql = `INSERT INTO users (id, username, mail, password, categoria, estado, direccion, barrio) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const values = [
            celularLimpio, 
            nombre, 
            email || null, 
            passHash, 
            'user', 
            pinGenerado, // Guardado en columna 'estado'
            '', 
            ''
        ];

        await pool.query(sql, values);

        //  AQUÍ LLAMAS A LA FUNCIÓN DE WHATSAPP
        // Usas el import 'whastapp' que ya tienes al inicio del archivo
        await whastapp.enviarMensajeRegistro(celularLimpio, nombre, pinGenerado);
        
        console.log(`-----------------------------------------`);
        console.log(`✅ Registro DB: ${nombre} (Pendiente)`);
        console.log(`🐾 PIN GENERADO PARA ${celularLimpio}: ${pinGenerado}`);
        console.log(`-----------------------------------------`);

        // 5. Renderizar 'usuario' enviando las señales para el Popup
        res.render('usuario', { 
            title: 'Verificar Celular',
            showModal: true,      // Activa el modal en el frontend
            celular: celularLimpio, // Pasa el número para el texto y el hidden
            intentos: 5           // Valor inicial del contador
        });

    } catch (error) {
        console.error("❌ Error en Registro:", error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            return res.render('usuario', { error: "Este número de celular ya está registrado." });
        }
        
        res.render('usuario', { error: "Ocurrió un error al procesar el registro." });
    }
});



/**
 * RUTA POST: Verifica si el código ingresado es correcto
 */
router.post('/verificar-codigo', async (req, res) => {
    try {
        let { codigo, celular, intentos } = req.body;
        intentos = parseInt(intentos); // Convertimos a número

        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [celular]);
        const usuario = rows[0];

        if (usuario && codigo === usuario.estado) {
            await pool.query('UPDATE users SET estado = ? WHERE id = ?', ['verificado', celular]);
            return res.redirect('/signin?registro=exitoso');
        } else {
            // RESTAMOS UN INTENTO
            const nuevosIntentos = intentos - 1;

            if (nuevosIntentos <= 0) {
                // Opcional: Borrar de la DB si agota intentos
                await pool.query('DELETE FROM users WHERE id = ? AND estado != "verificado"', [celular]);
                return res.render('usuario', { 
                    error: "Has agotado los intentos. Por favor, regístrate de nuevo." 
                });
            }

            // Volvemos a mostrar el modal con el nuevo número de intentos
            return res.render('usuario', { 
                showModal: true, 
                celular: celular,
                error_pin: "PIN incorrecto.",
                intentos: nuevosIntentos // Enviamos el nuevo valor (4, 3, 2...)
            });
        }
    } catch (error) {
        res.redirect('/registro');
    }
});



// Ruta para limpiar registros fallidos
router.post('/limpiar-registro-fallido', async (req, res) => {
    const { celular } = req.body;
    await pool.query('DELETE FROM users WHERE id = ? AND estado != ?', [celular, 'verificado']);
    res.json({ status: 'ok' });
});


export default router;
