const RegistroApp = {
  ui: {
    radioWs: document.getElementById("opt_ws"),
    radioEmail: document.getElementById("opt_email"),
    wrapCelular: document.getElementById("wrapper_celular"),
    wrapEmail: document.getElementById("wrapper_email"),
    mask: document.getElementById("celular_mask"),
    final: document.getElementById("celular_final"),
    emailInput: document.getElementById("email"),
    passInput: document.getElementById("pass"),
    btnToggle: document.getElementById("btn-toggle"),
    pins: document.querySelectorAll(".pin-in"),
    modal: document.getElementById("modalPIN"),
    btnRegistrar: document.getElementById("btn-registrar"),
    // Campos ocultos y visuales del Modal
    inputIntentos: document.getElementById("intentos_input"),
    inputDestino: document.getElementById("destino_hidden"),
    inputMetodo: document.getElementById("metodo_hidden"),
    inputPinCompleto: document.getElementById("pin_completo"),
    txtDestinoVisual: document.getElementById("txt_destino"),
    txtContadorVisual: document.getElementById("contador_visual"),
  },

  init() {
    // Limpia bloqueos de accesibilidad que impiden el foco
    document.querySelectorAll('[aria-hidden="true"]').forEach((el) => {
      if (el.contains(this.ui.modal)) {
        el.removeAttribute("aria-hidden");
      }
    });
    this.bindEvents();
    this.toggleView();
  },

  bindEvents() {
    // Cambio entre WhatsApp y Email
    this.ui.radioWs?.addEventListener("change", () => this.toggleView());
    this.ui.radioEmail?.addEventListener("change", () => this.toggleView());

    // Máscara de WhatsApp y verificación de existencia
    this.ui.mask?.addEventListener("input", (e) => {
      this.handleMask(e);
      if (this.ui.final.value.length === 10) {
        this.ejecutarChequeoExistencia(this.ui.final.value);
      } else {
        this.bloquearPasosSiguientes();
      }
    });

    // Verificación de existencia por Email
    this.ui.emailInput?.addEventListener("blur", () => {
      const email = this.ui.emailInput.value.trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        this.ejecutarChequeoExistencia(email);
      }
    });

    // Toggle para ver contraseña
    this.ui.btnToggle?.addEventListener("click", () => this.togglePassword());

    // Manejo de los 4 cuadros del PIN
    this.ui.pins.forEach((input, idx) => {
      input.addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/\D/g, ""); // Solo números
        if (e.target.value && idx < 3) this.ui.pins[idx + 1].focus();
        this.syncPin();
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !e.target.value && idx > 0) {
          this.ui.pins[idx - 1].focus();
        }
      });
    });
  },

  /**
   * Paso 1: Registro Inicial vía Fetch
   */
  async procesarRegistroFinal() {
    const nombre = document.getElementById("nombre").value.trim();
    const pass = this.ui.passInput.value;
    const metodo = this.ui.radioWs.checked ? "ws" : "email";
    const celular = this.ui.final.value;
    const email = this.ui.emailInput.value;

    if (!nombre || pass.length < 6) {
      return Swal.fire(
        "Atención",
        "Nombre completo y contraseña (min 6 carac.) son requeridos.",
        "warning"
      );
    }

    this.ui.btnRegistrar.disabled = true;
    this.ui.btnRegistrar.innerHTML = "Enviando código...";

    try {
      const response = await fetch("/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          celular,
          email,
          pass,
          metodo_contacto: metodo,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Sincronizar datos con el modal
        this.ui.txtDestinoVisual.innerText = result.destino;
        this.ui.inputDestino.value = result.destino;
        this.ui.inputMetodo.value = result.metodo;
        this.ui.inputIntentos.value = result.intentos; // Inicialmente 5
        this.ui.txtContadorVisual.innerText = result.intentos;

        this.ui.modal.classList.add("active");
        Swal.fire(
          "Código enviado",
          `Revisa tu ${metodo === "ws" ? "WhatsApp" : "correo"}`,
          "success"
        );
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      this.ui.btnRegistrar.disabled = false;
      this.ui.btnRegistrar.innerHTML = "REGISTRARME AHORA";
      Swal.fire("Error", error.message || "Error al registrar", "error");
    }
  },

  /**
   * Paso 2: Validación de PIN vía Fetch (Sin recarga)
   */
  async validarPinFetch() {
    this.syncPin();

    // Forzamos la lectura directa del DOM en cada clic
    const elIntentos = document.getElementById("intentos_input");
    let intentosActuales = parseInt(elIntentos.value);

    const pin = this.ui.inputPinCompleto.value;
    const destino_verif = this.ui.inputDestino.value;
    const metodo_verif = this.ui.inputMetodo.value;

    console.log("Enviando al servidor:", { pin, intentosActuales });

    if (pin.length < 4)
      return Swal.fire("Incompleto", "Ingresa los 4 dígitos", "warning");

    try {
      const response = await fetch("/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          destino_verif,
          metodo_verif,
          intentos: intentosActuales,
          nombre,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // 1. CERRAMOS EL MODAL INMEDIATAMENTE
        const modal = document.getElementById("modalPIN");
        if (modal) {
          modal.classList.remove("active"); // Esto lo oculta visualmente
        }

        // 2. Mostramos el SweetAlert de éxito (ahora sí será visible y clickeable)
        Swal.fire({
          icon: "success",
          title: "¡Bienvenido!",
          text: "Ya puedes ingresar a la comunidad.",
          confirmButtonText: "Aceptar",
          confirmButtonColor: "#0d6efd",
          allowOutsideClick: false,
        }).then((res) => {
          if (res.isConfirmed) {
            window.location.href = "/signin";
          }
        });

        return; // Detenemos la ejecución para que no entre al bloque de error
      } else {
        // 2. ERROR: Sincronización de intentos con el DOM
        const nuevosIntentos = result.intentosRestantes;

        // Actualizamos tanto el input hidden como el contador visual
        if (elIntentos) elIntentos.value = nuevosIntentos;
        const elContador = document.getElementById("contador_visual");
        if (elContador) elContador.innerText = nuevosIntentos;

        // Limpieza de los cuadraditos del PIN para el nuevo intento
        this.ui.pins.forEach((input) => (input.value = ""));
        this.ui.inputPinCompleto.value = "";
        this.ui.pins[0].focus();

        // 3. CASO: Intentos Agotados (Bandera 'agotado' o intentos en 0)
        if (result.agotado || nuevosIntentos <= 0) {
          Swal.fire({
            icon: "error",
            title: "Registro Cancelado",
            text:
              "Has superado el límite de intentos. Tu registro ha sido eliminado por seguridad.",
            confirmButtonText: "Ir al Inicio",
            confirmButtonColor: "#dc3545",
            allowOutsideClick: false,
          }).then(() => {
            // Redirección definitiva al Home según lo solicitado
            window.location.href = "/";
          });
        } else {
          // 4. CASO: PIN Incorrecto (Todavía tiene intentos)
          Swal.fire({
            icon: "error",
            title: "PIN Incorrecto",
            text: `Te quedan ${nuevosIntentos} ${
              nuevosIntentos === 1 ? "intento" : "intentos"
            }.`,
            confirmButtonColor: "#0d6efd",
          });
        }
      }
    } catch (error) {
      console.error("Error:", error);
    }
  },

  async ejecutarChequeoExistencia(valorId) {
    try {
      const res = await fetch("/verificar-usuario-existente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: valorId }),
      });
      const data = await res.json();
      if (data.existe) {
        this.bloquearPasosSiguientes();
        Swal.fire("Usuario Registrado", "Ya estas registrado", "info");
      } else {
        this.ui.passInput.disabled = false;
        this.ui.btnRegistrar.disabled = false;
      }
    } catch (e) {
      console.error(e);
    }
  },

  handleMask(e) {
    let v = e.target.value.replace(/\D/g, "");
    if (v.length > 0)
      e.target.value = `(${v.substring(0, 2)}) ${v.substring(
        2,
        6
      )}-${v.substring(6, 10)}`;
    this.ui.final.value = v;
  },

  toggleView() {
    const isWs = this.ui.radioWs?.checked;
    this.ui.wrapCelular.style.display = isWs ? "block" : "none";
    this.ui.wrapEmail.style.display = isWs ? "none" : "block";
  },

  togglePassword() {
    const isPass = this.ui.passInput.type === "password";
    this.ui.passInput.type = isPass ? "text" : "password";
    this.ui.btnToggle.innerText = isPass ? "🙈" : "👁️";
  },

  bloquearPasosSiguientes() {
    this.ui.passInput.disabled = true;
    this.ui.btnRegistrar.disabled = true;
  },

  syncPin() {
    this.ui.inputPinCompleto.value = Array.from(this.ui.pins)
      .map((i) => i.value)
      .join("");
  },
};

/**
 * Disparadores Globales
 */
function validarRegistro() {
  RegistroApp.procesarRegistroFinal();
}

function enviarPin() {
  RegistroApp.validarPinFetch();
}

async function cancelarRegistro() {
  const destino = document.getElementById("destino_hidden").value;

  if (!destino) {
    window.location.href = "/usuario";
    return;
  }

  try {
    const response = await fetch("/limpiar-registro-fallido", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ celular: destino }), // Enviamos el destino como 'celular' según tu ruta
    });

    const result = await response.json();

    if (result.status === "ok") {
      window.location.href = "/usuario";
    }
  } catch (error) {
    console.error("Error al limpiar registro:", error);
    // Redirigimos de todos modos para no trabar al usuario
    window.location.href = "/usuario";
  }
}

document.addEventListener("DOMContentLoaded", () => RegistroApp.init());
