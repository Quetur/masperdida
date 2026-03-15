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
    checkingIndicator: document.getElementById("checking-user"),
  },

  init() {
    this.bindEvents();
    this.toggleView();
  },

  bindEvents() {
    this.ui.radioWs?.addEventListener("change", () => this.toggleView());
    this.ui.radioEmail?.addEventListener("change", () => this.toggleView());

    // Interceptamos el primer carácter para el cambio automático
    this.ui.mask?.addEventListener("keydown", (e) => {
      const isNumber = e.key >= '0' && e.key <= '9';
      
      // Si el campo está vacío y presionan un número
      if (this.ui.mask.value === "" && isNumber) {
        if (!this.ui.radioWs.checked) {
          this.ui.radioWs.checked = true;
          this.toggleView();
          // El foco ya vuelve a 'mask' dentro de toggleView()
        }
      }
    });

    this.ui.mask?.addEventListener("input", (e) => {
      this.handleMask(e);
      const valorLimpio = this.ui.final.value;
      
      // Chequeo automático para Argentina (10 dígitos)
      if (valorLimpio.length === 10) {
        this.ejecutarChequeoExistencia(valorLimpio);
      } else {
        this.bloquearPasosSiguientes();
      }
    });

    this.ui.emailInput?.addEventListener("blur", () => {
      const email = this.ui.emailInput.value.trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        this.ejecutarChequeoExistencia(email);
      } else if (email.length > 0) {
        this.bloquearPasosSiguientes();
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

  // --- ACTUALIZACIÓN DE LA MÁSCARA ESPECÍFICA ---
  handleMask(e) {
    let valor = e.target.value;
    // Extraemos solo los números
    let soloNumeros = valor.replace(/\D/g, "");

    // Limitamos a 10 dígitos (característica de celulares en Argentina)
    soloNumeros = soloNumeros.substring(0, 10);

    let formateado = "";
    if (soloNumeros.length > 0) {
      // Formato: (XX) XXXX - XXXX
      formateado = "(" + soloNumeros.substring(0, 2);
      if (soloNumeros.length > 2) {
        formateado += ") " + soloNumeros.substring(2, 6);
      }
      if (soloNumeros.length > 6) {
        formateado += " - " + soloNumeros.substring(6, 10);
      }
    }

    // Actualizamos el input visual
    e.target.value = formateado;
    
    // Guardamos el valor limpio para el backend (ej: 1170609536)
    this.ui.final.value = soloNumeros; 
  },

  setLoading(isLoading) {
    this.ui.btnRegistrar.disabled = isLoading;
    this.ui.btnRegistrar.innerHTML = isLoading
      ? "ENVIANDO CÓDIGO..."
      : "REGISTRARME AHORA";
  },

  async procesarRegistroFinal() {
    // Definición clara de variables para evitar ReferenceError
    const nombre = document.getElementById("nombre")?.value.trim();
    const pass = this.ui.passInput.value;
    const metodo = this.ui.radioWs.checked ? "ws" : "email";
    const celular = this.ui.final.value; // Aseguramos que celular esté definido aquí
    const email = this.ui.emailInput.value.trim();

    if (!nombre) {
      return Swal.fire("Campo requerido", "Por favor, ingresa tu nombre completo.", "warning");
    }

    if (metodo === "ws" && celular.length < 10) {
      return Swal.fire("WhatsApp inválido", "Por favor, ingresa un número de teléfono completo.", "warning");
    }

    if (metodo === "email" && !email.includes("@")) {
      return Swal.fire("Email inválido", "Por favor, ingresa un correo electrónico válido.", "warning");
    }

    if (pass.length < 6) {
      return Swal.fire("Contraseña corta", "La contraseña debe tener al menos 6 caracteres.", "warning");
    }

    this.setLoading(true);

    try {
      // Sincronizado con la nueva ruta de tu backend
      const response = await fetch("/registrar_usuario", {
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

      if (response.ok && result.success) {
        this.ui.txtDestinoVisual.innerText = result.destino;
        this.ui.inputDestino.value = result.destino;
        this.ui.inputMetodo.value = result.metodo;
        this.ui.inputIntentos.value = result.intentos;
        this.ui.txtContadorVisual.innerText = result.intentos;

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
        throw new Error(result.error || "Error desconocido en el registro");
      }
    } catch (error) {
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
        // Si el servidor te devolviera un token/session aquí, podrías guardarlo.
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
          Swal.fire("Agotado", "Registro eliminado por seguridad.", "error")
          .then(() => (window.location.href = "/"));
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
    if (v.length > 10) v = v.substring(0, 10);
    if (v.length > 0) {
      let formatted = `(${v.substring(0, 2)}`;
      if (v.length > 2) formatted += `) ${v.substring(2, 6)}`;
      if (v.length > 6) formatted += `-${v.substring(6, 10)}`;
      e.target.value = formatted;
    }
    this.ui.final.value = v;
  },

  toggleView() {
    const isWs = this.ui.radioWs.checked;
    this.ui.wrapCelular.style.display = isWs ? "block" : "none";
    this.ui.wrapEmail.style.display = isWs ? "none" : "block";

    if (isWs) {
      this.ui.mask.focus(); // <--- Esto es vital
    } else {
      this.ui.emailInput.focus();
    }
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

async ejecutarChequeoExistencia(valorId) {
    if (this.ui.checkingIndicator) this.ui.checkingIndicator.style.display = "flex";
    this.bloquearPasosSiguientes();

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
        // ACTIVACIÓN DE PASOS SIGUIENTES
        this.ui.passInput.disabled = false;
        this.ui.btnRegistrar.disabled = false;
        
        // --- EL CAMBIO ESTÁ AQUÍ ---
        // Ponemos el foco automáticamente en la contraseña
        setTimeout(() => {
            this.ui.passInput.focus();
        }, 100); 
        // Usamos un pequeño timeout para asegurar que el navegador 
        // procese el cambio de 'disabled' antes de intentar dar el foco.
      }
    } catch (e) {
      console.error("Error en la verificación:", e);
    } finally {
      if (this.ui.checkingIndicator) this.ui.checkingIndicator.style.display = "none";
    }
  }
};

// --- Funciones Globales ---

document.addEventListener("DOMContentLoaded", () => RegistroApp.init());

function validarRegistro(event) {
  if (event) event.preventDefault();
  RegistroApp.procesarRegistroFinal();
}

function enviarPin() {
  RegistroApp.validarPinFetch();
}

async function cancelarRegistro() {
  const destino = document.getElementById("destino_hidden").value;
  if (destino) {
    try {
      await fetch("/limpiar-registro-fallido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ celular: destino }),
      });
    } catch (e) {
      console.error("Error al cancelar:", e);
    }
  }
  window.location.href = "/usuario";
}