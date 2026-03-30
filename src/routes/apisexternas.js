import express from "express";
import pool from "../../db.js";

const router = express.Router();

router.get('/api/robot_config', async (req, res) => {
  try {
    // 1. Buscamos el grupo que no esté dado de baja (fecha_baja es NULL)
    // Ordenamos por fecha_lectura ASC para que el robot procese el que hace más tiempo no visita
    const [rows] = await pool.query(
      `SELECT id, descripcion, url, latitud, longitud 
       FROM url_facebook 
       WHERE fecha_baja IS NULL 
       ORDER BY fecha_lectura ASC 
       LIMIT 1`
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "No hay URLs de Facebook activas" });
    }

    const grupo = rows[0];

    // 2. Actualizamos la fecha_lectura a hoy para que en la próxima vuelta se elija otro grupo
    await pool.query(
      "UPDATE url_facebook SET fecha_lectura = CURDATE() WHERE id = ?",
      [grupo.id]
    );

    // 3. Enviamos la respuesta al robot
    res.json({
      success: true,
      id: grupo.id,
      nombre: grupo.descripcion,
      url: grupo.url,
      latitud: grupo.latitud,
      longitud: grupo.longitud,
      limite: 15 // Podés hardcodearlo o agregarlo a la tabla después
    });

    console.log(`🤖 Robot solicitó pista: ${grupo.descripcion}`);

  } catch (error) {
    console.error("❌ Error en /api/robot_config:", error);
    res.status(500).json({ success: false, error: "Error interno del servidor" });
  }
});


export default router;