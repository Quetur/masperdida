import express from "express";
const router = express.Router();
import jwt from "jsonwebtoken";
import pool from "../../db.js";
import { promisify } from "util";
//import AWS from "aws-sdk";
//import fs from "fs";
import bcryptjs from "bcryptjs";
import nodemailer from "nodemailer";
import { error } from "console";
import { isAuthenticated } from '../authenticated.js'; 
import mascotaRoutes from "../mascota.js"; 
import categoriaRoutes from "../categoria.js"; 
import usuario from "../usuarioRoute.js";

router.use("/", mascotaRoutes); 
router.use("/", categoriaRoutes);
router.use("/", usuario);

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com", // Para pruebas, usa ethereal.email
  port: 587,
  secure: false, // true para puerto 465, false para otros puertos como 587
  auth: {
    user: process.env.MAIL_USER, // Tu usuario de mail
    pass: process.env.MAIL_PASS, // Tu password de mail
  },
  tls: {
    // Esta es la clave para ignorar el error del certificado
    rejectUnauthorized: false,
  },
});
console.log("transporter", transporter);

// ingreso
router.get("/signin", (req, res) => {
  console.log("get signin");
  res.render("auth/signin", {
    title: "Acceso - Tienda ES6",
    hideSidebar: true, // <--- Esta variable controla la visibilidad
  });
});

router.post("/login", async (req, res, next) => {
  // 1. Cambiamos 'dni' por 'celular' (que es lo que envía el nuevo form)
  const { celular, pass } = req.body;
  
  // Limpiamos el celular por si el form lo envía con formato (XX) XXXX-XXXX
  const celularLimpio = celular ? celular.replace(/\D/g, '') : '';
  
  console.log("Intento de login - ID (Celular):", celularLimpio);

  if (!celularLimpio || !pass) {
    return res.render("auth/signin", {
      alert: true,
      alertTitle: "Advertencia",
      alertMessage: "Ingrese su celular y contraseña",
      alertIcon: "info",
      showConfirmButton: true,
      timer: false,
      ruta: "",
    });
  }

  try {
    // 2. Consulta a la nueva tabla 'users' usando el 'id' (celular)
    const [results] = await pool.query("SELECT * FROM users WHERE id = ?", [celularLimpio]);
    const user = results[0];
    console.log("Usuario encontrado en DB:", user ? user.username : "No encontrado");
    // 3. Verificación de existencia y password encriptado
    // Nota: cambié user.pass por user.password y bcryptjs por el que uses
    if (!user || !(await bcryptjs.compare(pass, user.password))) {
      return res.render("auth/signin", {
        alert: true,
        alertTitle: "Error",
        alertMessage: "Celular o password incorrectos",
        alertIcon: "error",
        showConfirmButton: true,
        timer: 5000,
        ruta: "auth/signin",
      });
    }

    // --- NUEVO: Validar que el usuario esté verificado ---
    if (user.estado !== 'verificado') {
        return res.render("auth/signin", {
          alert: true,
          alertTitle: "Cuenta Pendiente",
          alertMessage: "Debes verificar tu celular con el PIN antes de entrar.",
          alertIcon: "warning",
          showConfirmButton: true,
          timer: 10000,
          ruta: "auth/signin",
        });
    }
    console.log("usuario", user.id, user.username, user.estado);
    // 4. GENERACIÓN DE SESIÓN (Mantenemos tu lógica original)
    req.session.user = {
      id: user.id, // ahora es el celular
      nombre: user.username // campo de tu tabla
    };

    // 5. Generación de Token JWT
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRETO, {
        expiresIn: '1h' 
    });

    // 6. Guardar sesión y responder enviando la Cookie (Misma lógica)
    req.session.save((err) => {
      if (err) {
        console.error("Error al guardar sesión:", err);
        return next(err);
      }

      console.log("Sesión creada para:", user.username);

      res.cookie('token_acceso', token, { 
          httpOnly: false, 
          secure: false,   
          maxAge: 3600000, 
          path: '/'        
      });

      res.render("auth/profile", {
        alert: true,
        alertTitle: "Bienvenido",
        alertMessage: "¡Ingreso exitoso!",
        alertIcon: "success",
        showConfirmButton: true,
        timer: 2000,
        ruta: "mascotacambia", 
        user: user.username,
        userid: user.id,
        token: token,
        nombre: user.username,
      });
    });

  } catch (error) {
    console.error("Error en el login:", error);
    next(error);
  }
});


router.get("/logout", (req, res) => {
    // 1. Eliminar la cookie del token JWT
    res.clearCookie('token_acceso', { path: '/' });

    // 2. Destruir la sesión del servidor
    if (req.session) {
        req.session.destroy((err) => {
            if (err) {
                console.error("Error al destruir la sesión:", err);
                return res.redirect("/"); // O manejar el error
            }
            
            // 3. Redirigir al login con un mensaje de éxito (opcional)
            // Usamos redirect directamente o renderizamos una alerta final
            res.redirect("/"); 
        });
    } else {
        res.redirect("/");
    }
});


//    listado decarrito de compras
router.get("/carritobarra", async (req, res) => {
  console.log(res.lis);

  res.render("carrito", { hideSidebar: true }); // pasar pro a carritoadd
});

router.get("/mailok", async (req, res) => {
  console.log("post /mailok body:");
  res.render("mailok", { hideSidebar: true }); // pasar pro a carritoadd
}
);


router.get("/mascotacambia", isAuthenticated, async (req, res) => {
  console.log("router /mascotacambia", req.session.user.nombre );
  const [data] = await pool.query(
    "SELECT *, c.des as cat_des, mascota.des as prod_des  FROM mascota INNER JOIN categoria c ON c.id_categoria = mascota.id_categoria ORDER BY mascota.id_categoria,mascota.id_raza,mascota.orden"
  );
  console.log("mascotas router", [data]);
  res.render("mascotacambia", { data,
    title: "Administrar mascotas",
    hideSidebar: true, // <--- Esta variable controla la visibilidad
    usuario: req.session.user.nombre 
  });
});




router.get("/modificarmascota/:id", async (req, res) => {
  console.log("modificarmascota");
  const [pro] = await pool.query(
    "SELECT * FROM mascota WHERE id_mascota = ?",
    [req.params.id]
  );

  const [
    cat,
  ] = await pool.query(
    "SELECT c.id_categoria, c.des, IF(p.id_categoria=c.id_categoria, 'S', '') id_categoria_mascota FROM categoria c, mascota p where p.id_mascota=?",
    [req.params.id]
  );

  //const cat = await pool.query("SELECT c.id_categoria, c.des, IF(p.id_categoria=c.id_categoria, 'S', '') id_categoria_mascota  FROM categoria c, mascota p ");

  const [
    subcat,
  ] = await pool.query(
    "SELECT d.id_categoria, d.raza, d.des, IF(p.id_raza=d.id_raza, 'S', '')  id_raza_mascota FROM raza d, mascota p where p.id_mascota=?",
    [req.params.id]
  );
  console.log("subcategoria ", subcat);
  res.render("modificarmascota", { pro, cat, subcat, title: "Modificar mascota", hideSidebar: true });
});

router.post("/send-email", async (req, res) => {
  console.log("send email", req.body);
  const {
    cliente,
    correo,
    cel,
    direccion,
    localidad,
    sucursal,
    message,
    cant,
    desc,
    prec,
    prod_id,
    tipo,
    unid,
    sttl,
    enviostr,
    total,
    totalgralstr,
    nota,
    articulos,
    fecha,
    horalocal,
  } = req.body;
  const datos = req.body;
  
  let direccionCompleta = direccion;
  if (sucursal && sucursal.trim() !== "") {
    direccionCompleta = `${direccion}, Sucursal: ${sucursal}`;
  }
  console.log("total general string: ", totalgralstr);
  console.log("Datos : ", datos);
  // graba en la base de datos el mensaje de whatsapp
  const mensajeWhatsapp = `Hola *${cliente}*, hemos recibido tu pedido, generado a traves de nuestra pagina web, se te enviara un mail a ${correo} con mas Información.\nNos estaremos comunicando con vos a este celular dentro de las próximas 48 horas habliles.\nLos datos de tu pedido del dia ${fecha} a las ${horalocal}, son los Siguientes:\nD͟i͟r͟e͟c͟c͟i͟o͟n͟: *${direccionCompleta}, ${localidad}*\nD̲e̲t̲a̲l̲l̲e̲:\n${
    articulos > 1
      ? desc
          .map(
            (d, i) =>
              `◆${Math.trunc(cant[i])} x ${d} a $${Math.trunc(prec[i])} c/u => $${Math.trunc(sttl[i])}`
          )
          .join("\n")
      : `◆ ${Math.trunc(cant)} x ${desc} a $${Math.trunc(prec)} c/u => $${Math.trunc(sttl)}`
  }\n\n*Total del pedido: ${totalgralstr}*\n *N͟o͟t͟a͟:* ${nota}\n\nMuchas Gracias.`;
  console.log(mensajeWhatsapp)
  // 1. Agregamos await para esperar que la DB devuelva el ID
  const resultId = await grabaWhasbasededatos(
    process.env.CELULAR_ORIGEN,
    cel,
    mensajeWhatsapp,
    new Date(),
    "fallido",
    "primera etapa - antes de enviar"
  );

  console.log("ID del mensaje grabado:", resultId);

  // 2. Ahora resultId tiene el valor real y podemos enviarlo
  enviarWhatsapp(mensajeWhatsapp, cel, resultId);

  
  var mfecha = fecha;
  console.log("/send-email");
  console.log("cantidad de items", cant);
  console.log("localidad :", localidad);
  console.log("articulos :", articulos);
  var cliente_des = cliente;
  var cliente_tel = cel;
  var cliente_dir = direccion;
  var cliente_saldoAnt = 0;
  var cliente_cod = await Actuali_Cliente(
    cel,
    cliente,
    direccion,
    localidad,
    correo
  );
  console.log("codigo de cliente:", cliente_cod);

  console.log("total: ", totalgralstr);
  const total2 = Math.trunc(total);
  console.log("total2: ", total2);
  const enviostr2 = Math.trunc(enviostr);
  const totalgralstr2 = Math.trunc(totalgralstr);
  console.log(prod_id);
  console.log(cant);
  console.log(desc);
  console.log(prec);
  console.log("sttl: ", sttl);
  console.log("enviostr: ", enviostr2);

  console.log("totagralstr: ", totalgralstr2);

  const hoy = fecha + "  " + horalocal;
  console.log("fecha: ", fecha);
  console.log(hoy);
  // cargo el pedido en base de datos

  var mascota = [];

  var encabezado = ``,
    cuerpo = ``,
    pie = ``;
  encabezado = `
  <ul>
  <a>Hola ${cliente}, </a>
  <a>hemos recibido tu pedido, generado a traves de nuestra pagina web</a><br>
  <a>Nos estaremos comunicando con vos al numero : ${cel}  dentro de las 48 hs habliles </a><br>
  <a>Tu pedido del dia ${hoy}, ha sido enviado con el siguiente detalle.</a><br><br>
  <a>Muchas Gracias</a><br>
  </ul>

  <br>
  <style type="text/css">
    table {width: 100%; border-collapse: collapse;}
    td, th {border: solid 1px black;}
    h1 {text-align: center;}
    span {float: right;}
  </style>
  <hr/>
  <hr/>
  <b> Cliente : </b>${cliente} <b><br>
  <b> Email : </b>${correo}</b><br>
  <b> Telefono : </b>${cel}<br>
  <b> Direccion : </b>${direccion} , </b>${localidad} <br>
  <hr/>
  <p></p>
  <table>
    <thead>
      <tr>
        <th>Cantidad</th>
        <th style="text-align:left">Descripcion</th>
        <th>Precio Unitario</th>
        <th>Subtotal</th>
      </tr>
    </thead>
    <tbody>`;
  //console.log("length cant: ", cant.length);
  if (articulos > 1) {
    for (let i = 0; i < cant.length; i++) {
      console.log(desc[i]);
      mascota.push([cant[i], desc[i], prec[i], sttl[i], prod_id[i]]);
    }
    for (let i = 0; i < mascota.length; i++) {
      cuerpo =
        cuerpo +
        `<tr>
            <td class="text-right" style="text-align:right" ;>
              <a type="text"  name="cant" hidden=true>${mascota[i][0]}&#09;</a></td>
            <td>
              <a type="text" name="desc" hidden=true>${mascota[i][1]}&#09;</a></td>
            <td class="text-right" style="text-align:right">
              <a type="text" name="precio" hidden=true>${mascota[i][2]}&#09;</a></td>
            <td class="text-right" id='subtotales' style="text-align:right">
              <a type="text" name="sttl" style="text-align:right" text hidden=true>${mascota[i][3]}&#09;</a></td>
        </tr>`;
    }
  } else {
    cuerpo =
      cuerpo +
      `<tr>
        <td class="text-right" style="text-align:right" ;>
          <a type="text"  name="cant" hidden=true>${cant} </a></td>
        <td>
          <a type="text" name="desc" hidden=true>${desc}</a></td>
        <td class="text-right" style="text-align:right">
          <a type="text"  name="precio" hidden=true>${prec}</a></td>
        <td class="text-right" id='subtotales' style="text-align:right">
          <a type="text" name="sttl" style="text-align:right" text hidden=true>${sttl}</a></td>
        </tr>`;
  }

  pie = `

  <tr>  
    <td></td>
    <td></td>   
    <td>Total Pedido</td>
    <td style="text-align:right" >${total2}</td> 
  </tr>   
    
  </tbody>
  </table> 
  <b>Nota: </b> ${nota}<br>
  <hr/> <hr/>
  <p><b> Importante:</b>  Todos los mascotas estan sujetos a disponobilidad.</p>
  <p><b>Si desea que le enviemos el pediodo su costo sera infortado  </b>.</p>
  <p>Muchas Gracias</p>`;

  const contentHTML = encabezado + cuerpo + pie;

  const mailOptions = {
    from: "jrosavila@gmail.com",
    cc: "jrosavila@gmail.com",
    to: correo,
    subject: "Mascota Perdida",
    text: cel,
    html: contentHTML,
  };

  //console.log(mailOptions);
  ///genero pedido

  /*const pedido_nro = await Genera_Pedido(fecha, horalocal, cliente_cod,
    cliente_des, cliente_tel, cliente_dir, total, nota, cliente_saldoAnt,
    mascota, prod_id, desc, cant, prec, sttl)
*/

  // envio el mail

  console.log("antes del send mail", mailOptions);

  //console.log(pppp);

  var result = await transporter.sendMail(mailOptions); // le doy laorden para que lo mande
  console.log("despues del send mail", result);
  //console.log(pppp);
  if (!result) {
    console.log("error :", result);
    res.render("carrito2");
  } else {
    console.log("Email enviado");
    res.render("mailok");
  }
});

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
        Authorization: "Bearer mi_token_secreto_123", // Verifica que coincida con el .env del servidor
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
          "✅ Base de datos router actualizada correctamente para ID:",
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



async function Actuali_Cliente(
  telefono,
  cliente,
  direccion,
  localidad,
  correo
) {
  console.log("Actuali_Cliente busco :", telefono);
  try {
    console.log("busco el telefono :", telefono);
    var [cli_busqueda] = await busca_cliente(telefono);

    console.log("cliente encontrado: ", cli_busqueda);
    if (cli_busqueda == 0) {
      var cli_busqueda = await nuevo_cliente(
        telefono,
        cliente,
        direccion,
        localidad,
        correo
      );
      console.log("nuevo cliente: ", cli_busqueda);
    }
    if (cli_busqueda > 0) {
      console.log("saldo anterir: ", cliente_saldoAnt);
    }
    return cli_busqueda;
  } catch (e) {
    console.log("error jesus :", e);
  }
}

async function busca_cliente(telefono) {
  let rows = "";
  let cliente_cod = "";
  let cliente_saldoAnt = "";
  let clienteNuevo = "";
  const linealsql = "SELECT * FROM cliente WHERE telefono = '" + telefono + "'";
  console.log("linea de sql : ", linealsql);
  var result = await pool.query(linealsql);
  console.log("encontro  : ", result.length);
  console.log("cliente", result[0]);
  if (result.length > 0) {
    rows = JSON.parse(JSON.stringify(result[0]));
    cliente_cod = result[0].id;
    cliente_saldoAnt = result[0].saldo;
    clienteNuevo = false;
    console.log("codigo del encontrado: ", cliente_cod);
    console.log("saldo en funcion:", cliente_saldoAnt);
  }
  if (result == 0) {
    console.log("cliente nuevo");
    clienteNuevo = true;
    cliente_cod = 0;
  }
  return cliente_cod;
}

async function nuevo_cliente(cel, cliente_des, direccion, localidad, correo) {
  console.log("entro en nuevo");
  var lineadesql =
    "INSERT INTO cliente values (NULL,'" +
    cliente_des +
    "', '" +
    direccion +
    "', '" +
    localidad +
    "', '" +
    cel +
    "', '" +
    " " +
    "', '" +
    " " +
    "', '" +
    correo +
    "', '" +
    1 +
    "', '" +
    0 +
    "', '" +
    0 +
    "' , 'efectivo'" +
    ")";
  console.log("linea de cliente nuevo", lineadesql);
  var result = await pool.query(lineadesql);
  console.log("despues que creo :", result.insertId);
  return result.insertId;
}

async function grabaWhasbasededatos(
  cel_origen,
  cel_destino,
  mensaje,
  fecha,
  estado,
  motivo
) {
  const query = `
    INSERT INTO whatsappMensajes 
    (telefono_origen, telefono_destino, mensaje, fecha_creacion, estado, error_log) 
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  const values = [cel_origen, cel_destino, mensaje, fecha, estado, motivo];

  try {
    const [result] = await pool.query(query, values);

    console.log(`✅ WhatsApp grabado. ID: ${result.insertId}`);
    return result.insertId;
  } catch (error) {
    console.error(
      "❌ Error al grabar whatsapp en base de datos:",
      error.message
    );
    // Opcional: lanzar el error para que quien llame a la función sepa que falló
    throw error;
  }
}

router.get("/mascotacambia", isAuthenticated, async (req, res) => {
  try {
    // Verificación de seguridad adicional para evitar errores de lectura
    const nombreUsuario = req.session?.user?.nombre || "Usuario";

    console.log("Accediendo a /mascotacambia - Usuario:", nombreUsuario);

    const [data] = await pool.query(
      "SELECT *, c.des as cat_des, mascota.des as prod_des FROM mascota INNER JOIN categoria c ON c.id_categoria = mascota.id_categoria ORDER BY mascota.id_categoria, mascota.id_raza, mascota.orden"
    );

    res.render("mascotacambia", { 
      data,
      title: "Administrar mascotas",
      hideSidebar: true, 
      usuario: nombreUsuario 
    });

  } catch (error) {
    console.error("Error en /mascotacambia:", error);
    res.status(500).send("Error interno del servidor");
  }
});

// Si usas lat=X&lon=Y como parámetro :ubi
router.get("/api/direccion/:ubi", async (req, res) => {
  const ubiParams = req.params.ubi; // ej: "lat=-34.5&lon=-58.4"
  const keyDom = process.env.GEOPASS;
console.log("entro en /api/direccion/:ubi", ubiParams, "keyDom", keyDom)

  try {
    const response = await fetch(`https://api.geoapify.com{ubiParams}&apiKey=${keyDom}`);
    const result = await response.json();
    console.log("resultado del gps", result)
    if (result.features && result.features.length > 0) {
      const prop = result.features[0].properties;
      res.json({
        calle: prop.street,
        numero: prop.housenumber,
        localidad: prop.city,
        cp: prop.postcode,
        provincia: prop.state,
        pais: prop.country
      });
      console.log("lugar",prop)
    } else {
      res.status(404).json({ error: "No encontrada" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



export default router;
