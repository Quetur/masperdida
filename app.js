import express from "express";
import cors from 'cors';
import { engine } from "express-handlebars";
import path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";
import pool from "./db.js";
import session from "express-session";
import cookieParser from "cookie-parser";
import router from "./src/routes/router.js";

dotenv.config();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4020;
app.use(cors());
// 3. MIDDLEWARES
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. MOTOR DE PLANTILLAS (Configuración con nuevo helper JSON)
app.engine(
  "hbs",
  engine({
    extname: ".hbs",
    defaultLayout: "main",
    partialsDir: path.join(__dirname, "views", "partials"),
    helpers: {
      eq: (a, b) => a === b,
      list: (...args) => args.slice(0, -1),
      concat: (a, b) => String(a) + String(b),
      isChecked: (filtros, key) => (filtros && filtros[key] ? "checked" : ""),
      // --- SOLUCIÓN AL ERROR: Helper JSON ---
      json: (context) => JSON.stringify(context),
    },
  })
);
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "views"));

// 5. CONFIGURACIÓN DE SESIÓN
app.use(
  session({
    secret: process.env.MICLAVESECRETA || "default_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      maxAge: 3600000,
    },
  })
);

// MIDDLEWARE PARA USUARIO GLOBAL
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});


// 6. RUTAS
app.get("/", async (req, res) => {
  try {
    const [promesaCategorias, promesaMascotas, promesaTipos] = await Promise.all([
      pool.execute("SELECT id_categoria, des FROM categoria"),
      (async () => {
        // 1. Base de la consulta SIN punto y coma al final
        let sql = `
          SELECT 
            m.*, 
            c.des AS cat_des, 
            d.des AS tipo_des, 
            e.des AS raza_des,
            u.username AS dueño_nombre,
            u.id AS contacto_id,
            u.barrio AS dueño_barrio
          FROM mascota m 
          LEFT JOIN categoria c ON c.id_categoria = m.id_categoria 
          LEFT JOIN tipo d ON d.id_tipo = m.id_tipo  
          LEFT JOIN raza e ON e.id_raza = m.id_raza 
          LEFT JOIN users u ON u.id = m.id_usuario
          WHERE m.visible = 1`; // Terminamos en el WHERE para concatenar

        const params = [];

        // 2. Filtros dinámicos
        Object.keys(req.query).forEach((key) => {
          if (key.startsWith("f")) {
            const idCategoria = key.substring(1);
            sql += " AND m.id_categoria = ?";
            params.push(idCategoria);
          }
          if (key.startsWith("t")) {
            const idTipo = key.substring(1);
            sql += " AND m.id_tipo = ?";
            params.push(idTipo);
          }
        });

        // 3. Orden y cierre de la consulta
        sql += ` ORDER BY m.fecha_suceso DESC`;

        return pool.execute(sql, params);
      })(),
      pool.execute("SELECT id_tipo, des FROM tipo"),
    ]);

    // ... resto de tu lógica de formateo de fechas y render ...
    const [categorias] = promesaCategorias;
    const [rows] = promesaMascotas;
    const [tipos] = promesaTipos;

    const mascotasFormateadas = rows.map((m) => {
      const fecha = m.fecha_suceso ? new Date(m.fecha_suceso) : new Date();
      let fechaLarga = fecha.toLocaleDateString("es-AR", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      });
      return {
        ...m,
        fecha_formateada: fechaLarga.replace(/ de /g, " ").replace(/,/g, ""),
      };
    });

    res.render("home", {
      mascotas: mascotasFormateadas,
      categorias,
      tipos,
      filtros: req.query,
    });
  } catch (err) {
    console.error("Error en Home:", err);
    res.status(500).send("Error interno del servidor");
  }
});

app.use("/", router);

app.use((req, res) => {
  res.status(404).render("home");
});

app.listen(PORT, () => {
  console.log(`✅ Servidor listo en http://localhost:${PORT}`);
});
