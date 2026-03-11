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
    inputIntentos: document.getElementById("intentos_input"),
    inputDestino: document.getElementById("destino_hidden"),
    inputMetodo: document.getElementById("metodo_hidden"),
    inputPinCompleto: document.getElementById("pin_completo"),
    txtDestinoVisual: document.getElementById("txt_destino"),
    txtContadorVisual: document.getElementById("contador_visual"),
  },

  init() {
    this.bindEvents();
    this.toggleView();
  },

  bindEvents() {
    this.ui.radioWs?.addEventListener("change", () => this.toggleView());
    this.ui.radioEmail?.addEventListener("change", () => this.toggleView());

    this.ui.mask?.addEventListener("input", (e) => {
      this.handleMask(e);
      if (this.ui.final.value.length === 10) {
        this.ejecutarChequeoExistencia(this.ui.final.value);
      } else {
        this.bloquearPasosSiguientes();
      }
    });

    this.ui.emailInput?.addEventListener("blur", () => {
      const email = this.ui.emailInput.value.trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        this.ejecutarChequeoExistencia(email);
      }
    });

    this.ui.btnToggle?.addEventListener("click", () => this.togglePassword());

    this.ui.pins.forEach((input, idx) => {
      input.addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/\D/g, "");
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

  setLoading(isLoading) {
    this.ui.btnRegistrar.disabled = isLoading;
    this.ui.btnRegistrar.innerHTML = isLoading
      ? "ENVIANDO CÓDIGO..."
      : "REGISTRARME AHORA";
  },

  async procesarRegistroFinal() {
    // 1. Captura de valores directa del DOM para evitar errores de referencia
    const nombre = document.getElementById("nombre")?.value.trim();
    const pass = this.ui.passInput.value;
    const metodo = this.ui.radioWs.checked ? "ws" : "email";

    // Capturamos el destino (celular limpio o email)
    const celular = this.ui.final.value; // El valor sin ( ) ni -
    const email = this.ui.emailInput.value.trim();

    // 2. Validación previa en el Frontend
    if (!nombre) {
      return Swal.fire(
        "Campo requerido",
        "Por favor, ingresa tu nombre completo.",
        "warning"
      );
    }

    if (metodo === "ws" && celular.length < 10) {
      return Swal.fire(
        "WhatsApp inválido",
        "Por favor, ingresa un número de teléfono completo.",
        "warning"
      );
    }

    if (metodo === "email" && !email.includes("@")) {
      return Swal.fire(
        "Email inválido",
        "Por favor, ingresa un correo electrónico válido.",
        "warning"
      );
    }

    if (pass.length < 6) {
      return Swal.fire(
        "Contraseña corta",
        "La contraseña debe tener al menos 6 caracteres.",
        "warning"
      );
    }

    // 3. Estado de carga en el botón
    this.setLoading(true);

    try {
      // 4. Envío de la petición
      const response = await fetch("/registrar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nombre,
          celular,
          email,
          pass,
          metodo_contacto: metodo,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // ÉXITO: Sincronizamos los datos con el Modal
        this.ui.txtDestinoVisual.innerText = result.destino;
        this.ui.inputDestino.value = result.destino;
        this.ui.inputMetodo.value = result.metodo;
        this.ui.inputIntentos.value = result.intentos;
        this.ui.txtContadorVisual.innerText = result.intentos;

        // Abrimos modal y damos foco al primer input del PIN
        this.ui.modal.classList.add("active");
        setTimeout(() => {
          if (this.ui.pins[0]) this.ui.pins[0].focus();
        }, 500);

        Swal.fire({
          icon: "success",
          title: "Código enviado",
          text: `Revisa tu ${metodo === "ws" ? "WhatsApp" : "correo"}`,
          timer: 2000,
          showConfirmButton: false,
        });
      } else {
        // ERROR del servidor (aquí cae el 400 con el mensaje de "Usuario ya existe")
        throw new Error(result.error || "Error desconocido en el registro");
      }
    } catch (error) {
      // Restauramos el botón y mostramos el error real
      this.setLoading(false);
      console.error("Detalle del error:", error);
      Swal.fire("Error en el registro", error.message, "error");
    }
  },

  syncPin() {
    const pinValue = Array.from(this.ui.pins)
      .map((i) => i.value)
      .join("");
    this.ui.inputPinCompleto.value = pinValue;
    // Validación automática al completar los 4 dígitos
    if (pinValue.length === 4) this.validarPinFetch();
  },

  async validarPinFetch() {
    const pin = this.ui.inputPinCompleto.value;
    const destino_verif = this.ui.inputDestino.value;
    const intentosActuales = parseInt(this.ui.inputIntentos.value);

    if (pin.length < 4) return;

    try {
      const response = await fetch("/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          destino_verif,
          intentos: intentosActuales,
        }),
      });

      const result = await response.json();

      if (result.success) {
        this.ui.modal.classList.remove("active");
        Swal.fire({
          icon: "success",
          title: "¡Bienvenido!",
          text: "Cuenta verificada con éxito.",
          allowOutsideClick: false,
        }).then(() => (window.location.href = "/signin"));
      } else {
        const nuevos = result.intentosRestantes;
        this.ui.inputIntentos.value = nuevos;
        this.ui.txtContadorVisual.innerText = nuevos;
        this.ui.pins.forEach((i) => (i.value = ""));
        this.ui.pins[0].focus();

        if (result.agotado) {
          Swal.fire(
            "Agotado",
            "Registro eliminado por seguridad.",
            "error"
          ).then(() => (window.location.href = "/"));
        } else {
          Swal.fire("PIN Incorrecto", `Te quedan ${nuevos} intentos.`, "error");
        }
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

  // La función de toggle
  togglePassword() {
    const isPass = this.ui.passInput.type === "password";
    this.ui.passInput.type = isPass ? "text" : "password";
    // Cambiamos el icono según el estado
    this.ui.btnToggle.innerText = isPass ? "🙈" : "👁️";
  },

  bloquearPasosSiguientes() {
    this.ui.passInput.disabled = true;
    this.ui.btnRegistrar.disabled = true;
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
        Swal.fire("Aviso", "Este usuario ya está registrado.", "info");
      } else {
        this.ui.passInput.disabled = false;
        this.ui.btnRegistrar.disabled = false;
      }
    } catch (e) {
      console.error(e);
    }
  },
};

document.addEventListener("DOMContentLoaded", () => RegistroApp.init());

function validarRegistro(event) {
  if (event) event.preventDefault(); // Blindaje extra contra refrescos
  RegistroApp.procesarRegistroFinal();
}
function enviarPin() {
  RegistroApp.validarPinFetch();
}
async function cancelarRegistro() {
  const destino = document.getElementById("destino_hidden").value;
  if (destino) {
    await fetch("/limpiar-registro-fallido", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ celular: destino }),
    });
  }
  window.location.href = "/usuario";
}
