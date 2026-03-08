import express from 'express';
import { engine } from 'express-handlebars';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import pool from './db.js';
import session from 'express-session';
import cookieParser from 'cookie-parser'; 
import router from "./src/routes/router.js"; 

// 1. Configuración de variables de entorno
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- INICIALIZACIÓN ---
const app = express(); 
const PORT = process.env.PORT || 4020;

// 3. MIDDLEWARES (Orden Crítico)
app.use(cookieParser()); 
app.use(express.static(path.join(__dirname, 'public'))); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. Motor de plantillas
app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: 'main',
    partialsDir: path.join(__dirname, 'views/partials'),
    helpers: {
        eq: (a, b) => a === b, 
        list: (...args) => args.slice(0, -1),
        concat: (a, b) => String(a) + String(b), 
        isChecked: (filtros, key) => (filtros && filtros[key] ? 'checked' : '')
    }
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// 5. CONFIGURACIÓN DE SESIÓN
app.use(session({
  secret: process.env.MICLAVESECRETA || 'default_secret', 
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, 
    maxAge: 3600000 
  }
}));

// --- NUEVO: MIDDLEWARE PARA PASAR USUARIO A LAS VISTAS ---
app.use((req, res, next) => {
    // Inyecta el usuario de la sesión en las variables globales de Handlebars
    res.locals.user = req.session.user || null;
    next();
});
// --------------------------------------------------------

// 6. RUTAS
app.get('/', async (req, res) => {
    try {
        const [categorias] = await pool.execute("SELECT id_categoria, des FROM categoria");
        let sql = "SELECT * FROM mascota WHERE 1=1";
        const params = [];
        Object.keys(req.query).forEach((key) => {
            if (key.startsWith("f")) {
                const idCategoria = key.substring(1);
                sql += " AND id_categoria = ?";
                params.push(idCategoria);
            }
        });
        const [rows] = await pool.execute(sql, params);
        
        // Ya no necesitas pasar 'user' aquí manualmente, res.locals lo hace solo
        res.render('home', { 
            mascotas: rows, 
            categorias: categorias, 
            filtros: req.query 
        });
    } catch (err) {
        res.status(500).send(`Error: ${err.message}`);
    }
});

// Rutas externas
app.use("/", router);

// 7. Manejo de errores 404
app.use((req, res) => {
    res.status(404).render('home');
});

// 8. Arranque
app.listen(PORT, () => {
    console.log(`✅ Servidor listo en http://localhost:${PORT}`);
});
