// Deteccion automatica si es celular
function aplicarDeteccion(inputVisible, inputHidden) {
  const visible = $(inputVisible);
  const oculto = $(inputHidden);

  visible.on("input", function () {
    let valor = $(this).val();
    
    // 1. Si contiene @, tratamos como Email (sin máscara)
    if (valor.includes("@")) {
      oculto.val(valor.trim()); 
    } 
    else {
      // 2. Si no hay @, tratamos como Celular
      // Limpiamos todo lo que no sea número
      let soloNumeros = valor.replace(/\D/g, "");
      
      // Limitamos a 10 dígitos (estándar celular)
      soloNumeros = soloNumeros.substring(0, 10);
      
      // Guardamos el valor limpio en el input oculto para el server
      oculto.val(soloNumeros);

      // 3. Aplicamos la MÁSCARA visual: (XX) XXXX - XXXX
      let formateado = "";
      if (soloNumeros.length > 0) {
        formateado = "(" + soloNumeros.substring(0, 2);
        if (soloNumeros.length > 2) {
          formateado += ") " + soloNumeros.substring(2, 6);
        }
        if (soloNumeros.length > 6) {
          formateado += " - " + soloNumeros.substring(6, 10);
        }
        $(this).val(formateado);
      }
    }
    console.log("Detección activa - Oculto:", oculto.val());
  });

  // Evitar que borre el paréntesis inicial y rompa la lógica
  visible.on("keydown", function(e) {
    if (e.key === "Backspace" && ($(this).val().length <= 1)) {
       $(this).val("");
       oculto.val("");
    }
  });
}


$(document).ready(function () {
  // 1. Inicializar máscaras para Celular/Email
  if (typeof aplicarDeteccion === "function") {
    aplicarDeteccion("#login_input", "#login_final");

    aplicarDeteccion("#destino_recuperar_mask", "#destino_recuperar_final");
  }

  // 2. Control del Formulario de Login (AJAX + SweetAlert)
  // 2. Control del Formulario de Login
  $("#formlogin").on("submit", async function (e) {
    e.preventDefault();
    console.log("--- INICIANDO PROCESO DE LOGIN ---");

    // Rescate de valores
    let loginInput = $("#login_final").val();
    const passInput = $("#pass").val();

    console.log("Valor capturado en hidden (#login_final):", loginInput);

    if (!loginInput || loginInput.trim() === "") {
      loginInput = $("#login_input").val();
      console.log(
        "Campo hidden vacío. Rescatando de visible (#login_input):",
        loginInput
      );
    }

    if (!loginInput || !passInput) {
      console.warn("Validación fallida: Faltan datos (Usuario o Pass)");
      Swal.fire("Error", "Por favor, completa todos los campos", "warning");
      return;
    }

    console.log("Enviando a /login:", {
      celular: loginInput,
      password: " [OCULTO] ",
    });

    Swal.showLoading();

    try {
      const response = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          celular: loginInput,
          pass: passInput, // <-- CAMBIADO para que coincida con el backend
        }),
      });

      console.log("Respuesta HTTP del servidor:", response.status);
      const result = await response.json();
      console.log("Resultado del JSON:", result);

      if (result.success) {
        console.log("Login exitoso. Redirigiendo a /home...");
        window.location.href = "/mascotacambia";
      } else {
        console.error(
          "Login rechazado por el servidor:",
          result.error || "Credenciales inválidas"
        );
        Swal.fire("Error", "Usuario o contraseña incorrectos", "error");
        document.getElementById("pass").value = "";
      }
    } catch (error) {
      console.error("ERROR CRÍTICO en la conexión:", error);
      Swal.fire("Error", "No se pudo conectar con el servidor", "error");
    }
  });

  // Log para verificar que las máscaras se inicializan
  if (typeof aplicarDeteccion === "function") {
    console.log(
      "Función aplicarDeteccion encontrada. Inicializando máscaras..."
    );
  } else {
    console.error(
      "ALERTA: aplicarDeteccion no está definida. Revisa tus archivos JS."
    );
  }

  // 3. Lógica de saltos automáticos para el PIN
  const pins = $(".pin-in");
  pins.each(function (index) {
    $(this).on("input", function () {
      if ($(this).val().length === 1 && index < pins.length - 1) {
        pins.eq(index + 1).focus();
      }
      let fullPin = "";
      pins.each(function () {
        fullPin += $(this).val();
      });
      $("#pin_completo").val(fullPin);
    });

    $(this).on("keydown", function (e) {
      if (e.key === "Backspace" && $(this).val() === "" && index > 0) {
        pins.eq(index - 1).focus();
      }
    });
  });

  // 4. Ocultar mensaje de error de contraseña
  $("#confirmar_pass, #nueva_pass").on("input", function () {
    $("#msg-error-pass").fadeOut();
  });
});

/** * --- FUNCIONES GLOBALES ---
 */

$(document).on("click", ".toggle-pass", function () {
  const target = $($(this).data("target"));
  const isPass = target.attr("type") === "password";
  target.attr("type", isPass ? "text" : "password");
  $(this).text(isPass ? "🙈" : "👁️");
});

function abrirModalRecuperar() {
  $("#modalRecuperar").addClass("active");
}

function cerrarModal(id) {
  $(id).removeClass("active");
}

async function solicitarPinRecuperacion() {
  let destino = $("#destino_recuperar_final").val();
  if (!destino) {
    destino = $("#destino_recuperar_mask").val();
  }

  if (!destino || destino.trim() === "") {
    return Swal.fire("Aviso", "Ingresá un Email o WhatsApp", "warning");
  }

  Swal.showLoading();
  try {
    const res = await fetch("/recuperar-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destino: destino.trim() }),
    });
    const data = await res.json();

    if (data.success) {
      $("#destino_hidden").val(destino);
      $("#txt_destino_rec").text(destino);
      cerrarModal("#modalRecuperar");
      $("#modalPIN").addClass("active");
      Swal.close();
    } else {
      Swal.fire("Error", data.error, "error");
    }
  } catch (e) {
    Swal.fire("Error", "Error al procesar la solicitud", "error");
  }
}

async function validarPinRecuperacion() {
  const pin = $("#pin_completo").val();
  const destino = $("#destino_hidden").val();
  const intentos = $("#intentos_input").val();

  if (pin.length < 4)
    return Swal.fire("PIN", "Completá los 4 dígitos", "warning");

  try {
    const res = await fetch("/validar-pin-recuperacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, destino, intentos }),
    });
    const data = await res.json();

    if (data.success) {
      cerrarModal("#modalPIN");
      $("#modalNuevaPass").addClass("active");
    } else {
      $(".pin-in").val("");
      $("#pin_completo").val("");
      $(".pin-in").first().focus();

      if (data.agotado) {
        Swal.fire(
          "Agotado",
          "PIN expirado. Solicitá uno nuevo.",
          "error"
        ).then(() => location.reload());
      } else {
        $("#intentos_input").val(data.intentosRestantes);
        Swal.fire({
          title: "PIN Incorrecto",
          text: `Quedan ${data.intentosRestantes} intentos.`,
          icon: "error",
          timer: 1500,
          showConfirmButton: false,
        });
      }
    }
  } catch (e) {
    Swal.fire("Error", "Error al procesar", "error");
  }
}

async function confirmarCambioFinal() {
  const destino = $("#destino_hidden").val();
  const pin = $("#pin_completo").val();
  const nuevaPass = $("#nueva_pass").val();
  const confirmarPass = $("#confirmar_pass").val();

  if (nuevaPass.length < 6)
    return Swal.fire("Seguridad", "Mínimo 6 caracteres", "warning");

  if (nuevaPass !== confirmarPass) {
    $("#msg-error-pass").fadeIn();
    return Swal.fire("Error", "Las contraseñas no coinciden", "error");
  }

  Swal.showLoading();
  try {
    const res = await fetch("/confirmar-nuevo-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destino, pin, nuevaPass }),
    });
    const data = await res.json();

    if (data.success) {
      Swal.fire({
        title: "¡Éxito!",
        text: "Contraseña actualizada. Ingresando...",
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      }).then(() => {
        window.location.href = "/home";
      });
    } else {
      Swal.fire("Error", data.error, "error");
    }
  } catch (e) {
    Swal.fire("Error", "No se pudo actualizar la contraseña", "error");
  }
}
