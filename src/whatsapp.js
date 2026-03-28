import pool from "../db.js";

// Función principal que exportarás
export async function enviarMensajeRegistro(cel, cliente, codigo) {
  const mensajeWhatsapp = `Hola *${cliente}*, hemos recibido un registro en nuestra página web.\n\nSu código es: ${codigo}\n\nSi usted no hizo esto, ignore este mensaje.\n\nMuchas Gracias.`;
  
  try {
    // 1. Graba en la base de datos
    const resultId = await grabaWhasbasededatos(
      process.env.CELULAR_ORIGEN,
      cel,
      mensajeWhatsapp,
      new Date(),
      "fallido",
      "primera etapa - registro"
    );

    // 2. Envía el mensaje (Asegúrate de tener definida enviarWhatsapp)
    enviarWhatsapp(mensajeWhatsapp, cel, resultId); 
    
    console.log(`🚀 Mensaje en cola para ${cel}. ID DB: ${resultId}`);
    return resultId;
  } catch (error) {
    console.error("❌ Error en el proceso de WhatsApp:", error);
  }
}

async function grabaWhasbasededatos(cel_origen, cel_destino, mensaje, fecha, estado, motivo) {
  const query = `
    INSERT INTO whatsappMensajes 
    (telefono_origen, telefono_destino, mensaje, fecha_creacion, estado, error_log) 
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  const values = [cel_origen, cel_destino, mensaje, fecha, estado, motivo];
  const [result] = await pool.query(query, values);
  return result.insertId;
}

// Exportación por defecto para que coincida con tu import en usuario.js

async function enviarWhatsapp(mensaje, telefono, idbasededatos) {
  // Asegúrate de que la URL termine en /enviar-pedido
  const url = process.env.SERVER_WHATSAPP_URL;
  console.log("enviarwhatsapp", mensaje, telefono, url, idbasededatos);
  const data = {
    telefono: telefono,
    mensaje: mensaje,
    idbasededatos: idbasededatos,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    console.log("Respuesta del servidor de WhatsApp:", result);
    console.log("ID en base de datos para este mensaje:", result.messageId);
    if (result.success) {
      console.log("✅ Mensaje enviado:", result);
      // regrabar en la base de datos que se envio correctamente
      const [
        resultUpdate,
      ] = await pool.query(
        "UPDATE whatsappMensajes SET estado = ?, error_log = ?, whatsapp_id = ?, fecha_envio = ? WHERE id = ?",
        ["enviado", "envio ok", result.messageId, new Date(), idbasededatos]
      );

      // CORRECCIÓN: Paréntesis añadidos y uso de resultUpdate.affectedRows
      if (resultUpdate.affectedRows > 0) {
        console.log(
          "✅ Base de datos what actualizada correctamente para ID:",
          idbasededatos
        );
      } else {
        console.error(
          "⚠️ No se pudo actualizar: ID no encontrado:",
          idbasededatos
        );
      }
    } else {
      console.error("⚠️ El servidor respondió con error:", result.error);
      // Aquí puedes disparar una alerta al usuario: "WhatsApp no está listo"
    }
  } catch (error) {
    console.error("❌ Error de red o servidor apagado:", error);
  }
}

export default { enviarMensajeRegistro };
