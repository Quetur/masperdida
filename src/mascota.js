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
  console.log("-----------------------------------------");
  console.log("📥 GET /mascotas con filtros:", req.query);
  
  try {
    // 1. Obtener datos para el Sidebar
    const [categorias] = await pool.execute("SELECT id_categoria, des FROM categoria");
    const [tipos] = await pool.execute("SELECT id_tipo, des FROM tipo");

    // 2. Construir consulta con JOINs (Igual que en el Home)
    let sql = `SELECT 
                m.*, 
                c.des AS cat_des, 
                d.des AS tipo_des, 
                e.des AS raza_des,
                u.username AS dueño_nombre,
                u.id AS contacto_id,
                u.barrio AS dueño_barrio
              FROM mascota m 
              INNER JOIN categoria c ON c.id_categoria = m.id_categoria 
              INNER JOIN tipo d ON d.id_tipo = m.id_tipo  
              INNER JOIN raza e ON e.id_raza = m.id_raza 
              INNER JOIN users u ON u.id = m.id_usuario
              WHERE m.visible = 1`;
    
    const params = [];

    // Filtros dinámicos
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

    const [rows] = await pool.execute(sql, params);
    console.log(`✅ Resultados encontrados: ${rows.length}`);

    // 3. Formatear datos para la vista (Fecha y Seguridad)
    const mascotasFormateadas = rows.map((m) => {
      const fechaBase = m.fecha_suceso || new Date();
      const fecha = new Date(fechaBase);
      
      let fechaLarga = fecha.toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      // Limpiamos formato para: "lunes 12 marzo 2026"
      fechaLarga = fechaLarga.replace(/ de /g, ' ').replace(/,/g, '');

      return {
        ...m,
        fecha_formateada: fechaLarga
      };
    });

    // 4. Renderizar pasando todo el contexto
    res.render("home", {
      mascotas: mascotasFormateadas,
      categorias: categorias,
      tipos: tipos,
      filtros: req.query,
    });

  } catch (err) {
    console.error("❌ Error en GET /mascotas:", err);
    res.status(500).send(`Error interno: ${err.message}`);
  }
});
/*
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
*/
router.get("/mascotanuevo", async (req, res) => {
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
    // Log para verificar en la consola de tu servidor Ubuntu lo que llega del formulario
    console.log("POST /mascota_nuevo_graba - Body:", req.body);
    if (req.file) console.log("Archivo recibido:", req.file.filename);

    try {
      // 1. Extraer datos (Nombres exactos de los 'name' en tu HBS)
      const {
        id_usuario,
        id_categoria,
        id_tipo,
        id_raza,
        titulo,
        des,
        nota,
        sexo,
        fecha_perdida,
        calle,        // Este contiene la dirección detectada/editada en el Paso 2
        latitud,
        longitud,
        orden,
        id_localidad,
        id_provincia,
        id_pais,
        codigopostal
      } = req.body;

      // 2. Preparar valores lógicos
      const id_final = id_usuario || (req.session.user ? req.session.user.id : null);
      const hoy = new Date().toISOString().split('T')[0];
      
      // Ajustamos a los nuevos 100 caracteres de tu tabla MySQL
      const direccionFinal = (calle || "Sin dirección").substring(0, 100);

      // 3. Construir objeto newmascota respetando tu estructura de tabla
      const newmascota = {
        orden: orden || "1",
        fecha_suceso: (fecha_perdida && fecha_perdida !== "") ? fecha_perdida : hoy,
        id_categoria: id_categoria,
        id_tipo: id_tipo,
        sexo: sexo || "Macho",
        id_raza: id_raza,
        // Si hay archivo usamos su nombre, si no, el icono por defecto
        foto2: req.file ? (req.file.location || req.file.filename) : "/img/iconoperrogato.png",
        titulo: (titulo || "Sin Nombre").substring(0, 70),
        des: (des || "").substring(0, 70),
        nota: nota || "",
        id_usuario: id_final,
        id_localidad: id_localidad || null,
        id_provincia: id_provincia || null,
        fecha_nacimiento: "1900-01-01",
        id_pais: id_pais || "1",
        codigopostal: codigopostal || "",
        // Coordenadas con precisión double(15,11)
        latitud: latitud ? parseFloat(latitud) : 0,
        longitud: longitud ? parseFloat(longitud) : 0,
        visible: 1,
        descuentoxunidad: 0,
        descuentoapartir: 0,
        direccion: direccionFinal
      };

      console.log("📝 Grabando en DB:", newmascota.titulo, "en", newmascota.direccion);

      // 4. Ejecutar INSERT
      const [result] = await pool.query("INSERT INTO mascota SET ?", [newmascota]);

      // 5. Recuperar la lista para la vista de éxito 'mascotacambia'
      const [data] = await pool.query(
        "SELECT m.*, c.des as cat_des FROM mascota m " +
        "INNER JOIN categoria c ON c.id_categoria = m.id_categoria " +
        "WHERE m.id_usuario = ? ORDER BY m.id_mascota DESC",
        [id_final]
      );

      // 6. Respuesta con SweetAlert integrada
      res.render("mascotacambia", {
        data,
        alert: true,
        alertTitle: "🐾 ¡Publicado!",
        alertMessage: "La mascota se registró correctamente.",
        alertIcon: "success",
        ruta: "mascotacambia",
      });

    } catch (error) {
      console.error("❌ Error en el proceso de grabación:", error);
      
      // Fallback en caso de error: intenta volver al formulario con el mensaje
      res.status(500).render("mascotanuevo", {
        error: "No se pudo grabar la mascota: " + error.message,
        userid: req.body.id_usuario
      });
    }
  }
);


router.post(
  "/Mascotamodi/:id",
  isAuthenticated,
  upload.single("foto2"),
  async (req, res) => {
    const { id } = req.params;
    console.log("Modificando Mascota ID:", id, "Body:", req.body);

    try {
      // 1. Extraer datos (usando los mismos nombres que en mascota_nuevo_graba)
      const {
        id_categoria,
        id_tipo,
        id_raza,
        titulo,
        des,
        nota,
        calle,        // Este es el campo 'direccion' en tu DB
        ciudad,       // Lo usaremos para armar la dirección final o si tenés campo ciudad
        provincia,    // Lo mismo para provincia
        latitud,
        longitud,
        visible
      } = req.body;

      // 2. Gestión de la Imagen (Mantener anterior o subir nueva)
      let fotoFinal;
      if (req.file) {
        fotoFinal = req.file.location || req.file.filename;
      } else {
        const [rows] = await pool.query("SELECT foto2 FROM mascota WHERE id_mascota = ?", [id]);
        fotoFinal = rows[0].foto2;
      }

      // 3. Preparar la dirección final 
      // Si el usuario editó calle, ciudad y provincia por separado, los unimos
      // Si solo usás el campo 'calle' como dirección completa, usá: const direccionFinal = calle
      const direccionFinal = `${calle || ""}, ${ciudad || ""}, ${provincia || ""}`
        .trim()
        .replace(/^,|,$/g, '')
        .substring(0, 100);

      // 4. Construir objeto para UPDATE respetando tu estructura
      const valoresUpdate = {
        id_categoria: id_categoria,
        id_tipo: id_tipo,
        id_raza: id_raza,
        titulo: (titulo || "Sin Nombre").substring(0, 70),
        des: (des || "").substring(0, 70),
        nota: nota || "",
        direccion: direccionFinal,
        latitud: latitud ? parseFloat(latitud) : 0,
        longitud: longitud ? parseFloat(longitud) : 0,
        foto2: fotoFinal,
        visible: visible || 1
        // Si tenés campos específicos para ciudad/provincia en la tabla, agregalos acá:
        // id_provincia: req.body.id_provincia 
      };

      // 5. Ejecutar UPDATE
      await pool.query("UPDATE mascota SET ? WHERE id_mascota = ?", [valoresUpdate, id]);

      // 6. Preparar datos para volver al listado
      const id_usuario = req.session.user ? req.session.user.id : null;
      const [data] = await pool.query(
        "SELECT m.*, c.des as cat_des FROM mascota m " +
        "INNER JOIN categoria c ON c.id_categoria = m.id_categoria " +
        "WHERE m.id_usuario = ? ORDER BY m.id_mascota DESC",
        [id_usuario]
      );

      // 7. Renderizar respuesta con SweetAlert
      res.render("mascotacambia", {
        data,
        alert: true,
        alertTitle: "🐾 ¡Actualizado!",
        alertMessage: "La información de " + valoresUpdate.titulo + " se actualizó correctamente.",
        alertIcon: "success",
        ruta: "mascotacambia",
      });

    } catch (error) {
      console.error("❌ Error al modificar:", error);
      res.status(500).render("modificarmascota", {
        pro: req.body,
        error: "No se pudieron guardar los cambios: " + error.message
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

// Ruta en Node.js (ej: routes/mascotas.js)
router.get("/mascotanuevo_datos", async (req, res) => {
  try {
    const [cat] = await pool.query("SELECT * FROM categoria");
    const [tipo] = await pool.query("SELECT * FROM tipo");
    const [raza] = await pool.query("SELECT * FROM raza ORDER BY des ASC");
    console.log("consolto", [cat])
    res.json({ cat, tipo, raza });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Error al cargar maestros" });
  }
});


// Nueva ruta para el portal de React (Chat)
router.post(
  "/api/mascota_chat_graba",
  upload.single("foto2"),
  async (req, res) => {
    console.log("🚀 Recibiendo reporte desde el Chat - Body:", req.body);
    
    try {
      const {
        id_categoria,
        id_tipo,
        id_raza,
        titulo,
        sexo,
        latitud,
        longitud,
        calle,
        celular, 
        nombre_contacto
      } = req.body;

      // 1. El celular como id_usuario
      const celularLimpio = celular ? celular.replace(/\D/g, "") : null;
      const id_final = celularLimpio ? parseInt(celularLimpio) : 0;
      const hoy = new Date().toISOString().split('T')[0];
      const direccionFinal = (calle || "Ituzaingó, Buenos Aires").substring(0, 100);

      // 2. Construir el objeto incluyendo los campos de "descuento" obligatorios
      const newmascota = {
        orden: "1",
        fecha_suceso: hoy,
        id_categoria: id_categoria,
        id_tipo: id_tipo,
        id_raza: (id_raza && id_raza !== "" && id_raza !== "null") ? id_raza : null,
        sexo: sexo || "Macho",
        foto2: req.file ? (req.file.location || req.file.filename) : "/img/iconoperrogato.png",
        titulo: (titulo || "Sin Nombre").substring(0, 70),
        des: `Contacto: ${nombre_contacto || 'Usuario'}`.substring(0, 70),
        nota: `Tel: ${celular || ''}`, 
        id_usuario: id_final,
        id_localidad: 1, 
        id_provincia: 1, 
        id_pais: "1",
        fecha_nacimiento: "1900-01-01",
        latitud: latitud ? parseFloat(latitud) : 0,
        longitud: longitud ? parseFloat(longitud) : 0,
        visible: 1,
        direccion: direccionFinal,
        // --- CAMPOS OBLIGATORIOS QUE FALTABAN ---
        descuentoxunidad: 0,
        descuentoapartir: 0
      };

      console.log("📝 Grabando en DB con campos de descuento en 0...");

      // 3. Ejecutar INSERT
      const [result] = await pool.query("INSERT INTO mascota SET ?", [newmascota]);

      res.status(200).json({
        success: true,
        message: "Mascota publicada con éxito",
        insertId: result.insertId
      });

    } catch (error) {
      console.error("❌ Error grabando desde el chat:", error);
      res.status(500).json({
        success: false,
        message: "Error interno al procesar el reporte",
        error: error.message
      });
    }
  }
);

export default router;
