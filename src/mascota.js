import express from "express";
import pool from "../db.js";
import { S3Client } from "@aws-sdk/client-s3";
import multer from "multer";
import multerS3 from "multer-s3";
import { isAuthenticated } from "./authenticated.js";

const router = express.Router();

// Configuración de AWS S3 Client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Configuración de Multer con S3
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_BUCKET,
    acl: "public-read",
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      cb(null, `mascotas/${Date.now()}_${file.originalname}`);
    },
  }),
});

router.get("/mascotas", async (req, res) => {
  console.log("GET /mascotas con filtros:", req.query);
  try {
    // 1. Obtener Categorías Y Tipos para el Sidebar
    const [categorias] = await pool.execute(
      "SELECT id_categoria, des FROM categoria"
    );
    const [tipos] = await pool.execute("SELECT id_tipo, des FROM tipo");

    // 2. Construir la consulta de mascotas dinámicamente
    let sql = "SELECT * FROM mascota WHERE 1=1";
    const params = [];

    // Recorremos los parámetros de la URL
    Object.keys(req.query).forEach((key) => {
      // Si empieza con 'f' -> Filtro por Categoría
      if (key.startsWith("f")) {
        const idCategoria = key.substring(1);
        sql += " AND id_categoria = ?";
        params.push(idCategoria);
      }
      // Si empieza con 't' -> Filtro por Tipo (Perro, Gato, etc.)
      if (key.startsWith("t")) {
        const idTipo = key.substring(1);
        sql += " AND id_tipo = ?";
        params.push(idTipo);
      }
    });

    const [rows] = await pool.execute(sql, params);

    // 3. Renderizar pasando todos los datos necesarios
    res.render("home", {
      mascotas: rows,
      categorias: categorias,
      tipos: tipos, // <--- Nueva variable para el Sidebar
      filtros: req.query,
    });
  } catch (err) {
    console.error("Error en GET /mascotas:", err);
    res.status(500).send(`Error: ${err.message}`);
  }
});

router.post("/mascotamodi/:id", isAuthenticated, async (req, res) => {
  try {
    console.log("/mascotamodi/", req.params.id, req.body);
    const { id } = req.params;
    const { id_categoria } = req.body;

    if (id_categoria > "1") {
      const NuevosDatos = req.body;
      const sqlText = "UPDATE mascota SET ? WHERE id_mascota = ?";
      const values = [NuevosDatos, id];

      const queryCompleta = pool.format(sqlText, values);
      console.log("--- SQL A EJECUTAR ---");
      console.log(queryCompleta);
      console.log("----------------------");

      await pool.query(sqlText, values);
    }

    const [data] = await pool.query(
      "SELECT *, c.des as cat_des, mascota.des as prod_des FROM mascota " +
        "INNER JOIN categoria c ON c.id_categoria = mascota.id_categoria " +
        "ORDER BY mascota.id_categoria, mascota.id_raza, mascota.orden"
    );

    res.render("mascotacambia", { data });
  } catch (error) {
    console.error("Error detectado:", error.message);
    res.status(500).send("Error en el servidor: " + error.message);
  }
});

router.get("/mascotanuevo", isAuthenticated, async (req, res) => {
  try {
    // Extraemos id (celular) y nombre de la sesión
    const { id, nombre } = req.session.user;

    console.log(`🐾 Cargando formulario para el usuario ID: ${id}`);

    // 2. Consultas Maestras con AWAIT (Indispensable para obtener los datos)
    // Usamos [rows] para obtener solo el array de resultados de cada tabla
    const [cat] = await pool.query("SELECT * FROM categoria");
    const [tipo] = await pool.query("SELECT * FROM tipo");
    const [raza] = await pool.query("SELECT * FROM raza ORDER BY des ASC");
    const [pais] = await pool.query("SELECT * FROM pais");
    const [provincia] = await pool.query("SELECT * FROM provincia");

    console.log("raza", raza);
    // 3. Pasamos TODO al render
    res.render("mascotanuevo", {
      title: "Agregar Mascota - Mascota Perdida",
      userid: id,
      username: nombre,
      cat,
      tipo,
      raza,
      pais,
      provincia,
    });
  } catch (error) {
    console.error("❌ Error al cargar datos para mascotanuevo:", error.message);

    // Si falla la DB, informamos al usuario en el perfil
    res.render("auth/profile", {
      // Usamos una validación por si la sesión se rompió justo en el error
      user: req.session.user ? req.session.user.nombre : "Usuario",
      alert: true,
      alertTitle: "Error de conexión",
      alertMessage:
        "No pudimos obtener las razas o categorías. Intenta de nuevo.",
      alertIcon: "error",
      ruta: "profile",
      hideSidebar: true,
    });
  }
});

// Agregar mascota: Agregado middleware upload.single("foto2")
router.post(
  "/mascota_nuevo_graba",
  isAuthenticated,
  upload.single("foto2"),
  async (req, res) => {
    console.log("POST /mascota_nuevo_graba - Datos recibidos:", req.body);

    try {
      // 1. Extraer datos (Agregamos latitud y longitud aquí)
      const {
        id_usuario,
        id_categoria,
        id_tipo,
        id_raza,
        titulo,
        des,
        sexo,
        fecha_perdida,
        fecha_nacimiento,
        id_pais,
        id_provincia,
        id_localidad,
        calle,
        altura,
        cp,
        latitud,  // <--- CAPTURAR DESDE EL FORMULARIO
        longitud  // <--- CAPTURAR DESDE EL FORMULARIO
      } = req.body;

      let id_final = id_usuario || (req.session.user ? req.session.user.id : null);
      const hoy = new Date().toISOString().split('T')[0];
      const f_suceso = (fecha_perdida && fecha_perdida !== "") ? fecha_perdida : hoy;
      const f_nacimiento = (fecha_nacimiento && fecha_nacimiento !== "") ? fecha_nacimiento : "1900-01-01";
      
      const newmascota = {
        id_usuario: id_final,
        id_categoria: id_categoria,
        id_tipo: id_tipo,
        id_raza: id_raza,
        sexo: sexo || "Macho",
        titulo: titulo || "Sin Nombre",
        des: des || "",
        nota: "Registro manual",
        fecha_suceso: f_suceso,
        fecha_nacimiento: f_nacimiento,
        
        id_pais: id_pais,
        id_provincia: id_provincia,
        id_localidad: id_localidad,
        codigopostal: cp, 
        direccion: `${calle} ${altura}`.substring(0, 40),

        // CAMPOS CORREGIDOS: Ahora usan los valores del body o 0 por defecto
        latitud: latitud || 0,
        longitud: longitud || 0,

        visible: 1,
        orden: req.body.orden || "1",
        foto2: req.file ? (req.file.location || req.file.filename) : "sin-foto.jpg",
        descuentoxunidad: 0,
        descuentoapartir: 0
      };

      console.log("📝 Objeto a insertar con coordenadas:", newmascota);

      const [result] = await pool.query("INSERT INTO mascota SET ?", [newmascota]);

      const [data] = await pool.query(
        "SELECT m.*, c.des as cat_des FROM mascota m " +
        "INNER JOIN categoria c ON c.id_categoria = m.id_categoria " +
        "WHERE m.id_usuario = ? ORDER BY m.id_mascota DESC",
        [id_final]
      );
      console.log("mascotas", data)

      res.render("mascotacambia", {
        data,
        alert: true,
        alertTitle: "🐾 ¡Publicado!",
        alertMessage: "La mascota se registró con coordenadas y dirección.",
        alertIcon: "success",
        ruta: "mascotacambia",
      });

    } catch (error) {
      console.error("❌ Error en el POST:", error.message);
      res.status(500).render("mascotanuevo", {
        error: "Error al procesar el registro: " + error.message,
        userid: req.body.id_usuario
      });
    }
  }
);



// Eliminar mascota
router.get("/mascotadel/:id", isAuthenticated, async (req, res) => {
  const { id } = req.params;
  console.log("delete", id);
  await pool.query("DELETE FROM mascota WHERE id_mascota = ?", [id]);

  const [data] = await pool.query(
    "SELECT *, c.des as cat_des, mascota.des as prod_des FROM mascota INNER JOIN categoria c ON c.id_categoria = mascota.id_categoria ORDER BY mascota.id_categoria,mascota.id_raza,mascota.orden"
  );
  res.render("mascotacambia", { data });
});

// Cambiar estado a Visible
router.get("/tildar/:id", isAuthenticated, async (req, res) => {
  const { id } = req.params;
  console.log("tildar");
  const pro = await pool.query(
    "update mascota set visible=1 where id_mascota = ?",
    [id]
  );
  const [data] = await pool.query(
    "SELECT *, c.des as cat_des, mascota.des as prod_des  FROM mascota INNER JOIN categoria c ON c.id_categoria = mascota.id_categoria ORDER BY mascota.id_categoria,mascota.id_raza,mascota.orden"
  );
  res.render("mascotacambia", { data });
});

// Cambiar estado a Oculto
router.get("/destildar/:id", isAuthenticated, async (req, res) => {
  const { id } = req.params;
  console.log("destildar");
  const pro = await pool.query(
    "update mascota set visible=0 where id_mascota = ?",
    [id]
  );
  const [data] = await pool.query(
    "SELECT *, c.des as cat_des, mascota.des as prod_des  FROM mascota INNER JOIN categoria c ON c.id_categoria = mascota.id_categoria ORDER BY mascota.id_categoria,mascota.id_raza,mascota.orden"
  );
  res.render("mascotacambia", { data });
});

router.get("/api/localidades/:id_provincia", async (req, res) => {
  const { id_provincia } = req.params;
  console.log("provincia", id_provincia)

  try {
    // Ajusta la consulta SQL según el nombre de tu tabla y campos
    const query = "SELECT id_localidad, descripcion FROM localidad WHERE provincia = ? ORDER BY descripcion ASC";
    console.log("query",query)
    const [rows] = await pool.query(query, [id_provincia]);

    if (rows.length > 0) {
      res.json(rows);
    } else {
      res.status(404).json({ error: "No se encontraron localidades para esta provincia" });
    }
  } catch (error) {
    console.error("Error en API localidades:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
