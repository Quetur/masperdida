import express from 'express';
import { engine } from 'express-handlebars';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import pool from './db.js';
import session from 'express-session';
import cookieParser from 'cookie-parser'; 
import router from "./src/routes/router.js"; 

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express(); 
const PORT = process.env.PORT || 4020;

// 3. MIDDLEWARES
app.use(cookieParser()); 
app.use(express.static(path.join(__dirname, 'public'))); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. MOTOR DE PLANTILLAS (Configuración con nuevo helper JSON)
app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: 'main',
    partialsDir: path.join(__dirname, 'views/partials'),
    helpers: {
        eq: (a, b) => a === b, 
        list: (...args) => args.slice(0, -1),
        concat: (a, b) => String(a) + String(b), 
        isChecked: (filtros, key) => (filtros && filtros[key] ? 'checked' : ''),
        // --- SOLUCIÓN AL ERROR: Helper JSON ---
        json: (context) => JSON.stringify(context)
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

// MIDDLEWARE PARA USUARIO GLOBAL
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});



// 6. RUTAS (Optimizada para evitar inyecciones y mejorar rendimiento)
app.get('/', async (req, res) => {
    try {
        // Ejecutamos ambas consultas en paralelo para ganar velocidad
        const [promesaCategorias, promesaMascotas] = await Promise.all([
            pool.execute("SELECT id_categoria, des FROM categoria"),
            (async () => {
                let sql = "SELECT m.*,c.des as cat_des, d.des as tio_des, e.des as raza_des FROM mascota m INNER JOIN categoria c ON c.id_categoria = m.id_categoria INNER JOIN tipo d ON d.id_tipo = m.id_tipo  INNER JOIN raza e ON e.id_raza = m.id_raza WHERE 1=1"
                const params = [];
                Object.keys(req.query).forEach((key) => {
                    if (key.startsWith("f")) {
                        const idCategoria = key.substring(1);
                        sql += " AND id_categoria = ?";
                        params.push(idCategoria);
                    }
                });
                return pool.execute(sql, params);
            })()
        ]);

        const [categorias] = promesaCategorias;
        const [rows] = promesaMascotas;
        
        res.render('home', { 
            mascotas: rows, 
            categorias: categorias, 
            filtros: req.query 
        });
    } catch (err) {
        console.error("Error en Home:", err);
        res.status(500).send("Error interno del servidor");
    }
});

app.use("/", router);

app.use((req, res) => {
    res.status(404).render('home');
});

app.listen(PORT, () => {
    console.log(`✅ Servidor listo en http://localhost:${PORT}`);
});