$(document).ready(function () {
    // Inicializar máscaras
    aplicarDeteccion("#login_input", "#login_final");
    aplicarDeteccion("#destino_recuperar_mask", "#destino_recuperar_final");

    // Saltos automáticos del PIN
    const pins = $('.pin-in');
    pins.each(function(index) {
        $(this).on('input', function() {
            if ($(this).val().length === 1 && index < pins.length - 1) pins.eq(index + 1).focus();
            let fullPin = "";
            pins.each(function() { fullPin += $(this).val(); });
            $('#pin_completo').val(fullPin);
        });
        $(this).on('keydown', function(e) {
            if (e.key === 'Backspace' && $(this).val() === '' && index > 0) pins.eq(index - 1).focus();
        });
    });

    // Ocultar error de contraseña mientras escribe
    $('#confirmar_pass, #nueva_pass').on('input', function() {
        $('#msg-error-pass').fadeOut();
    });
});

// Toggle del ojo (delegado)
$(document).on('click', '.toggle-pass', function() {
    const target = $($(this).data('target'));
    const isPass = target.attr('type') === 'password';
    target.attr('type', isPass ? 'text' : 'password');
    $(this).text(isPass ? '🙈' : '👁️');
});

function aplicarDeteccion(selectorInput, selectorHidden) {
    $(selectorInput).on("input", function (e) {
        let val = e.target.value;
        let hidden = $(selectorHidden);
        if (/^[0-9(]/.test(val)) {
            let num = val.replace(/\D/g, "");
            let f = (num.length > 0) ? "(" + num.substring(0, 2) + (num.length > 2 ? ") " + num.substring(2, 6) : "") + (num.length > 6 ? "-" + num.substring(6, 10) : "") : "";
            e.target.value = f;
            hidden.val(num);
        } else { hidden.val(val.toLowerCase().trim()); }
    });
}

function abrirRecuperacion() { $('#modal-recuperar').addClass('active'); }
function cerrarRecuperacion() { $('#modal-recuperar').removeClass('active'); }

async function enviarPinRecuperacion() {
    const destino = $('#destino_recuperar_final').val();
    if(!destino) return Swal.fire("Atención", "Ingresa tus datos de contacto", "warning");
    Swal.showLoading();
    try {
        const res = await fetch("/recuperar-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ destino })
        });
        const data = await res.json();
        if(data.success) {
            $('#destino_hidden').val(destino);
            $('#txt_destino').text($('#destino_recuperar_mask').val());
            cerrarRecuperacion();
            $('#modalPIN').addClass('active');
            $('.pin-in').first().focus();
            Swal.close();
        } else { Swal.fire("Error", data.error, "error"); }
    } catch (e) { Swal.fire("Error", "Fallo de conexión", "error"); }
}

async function procesarValidacionPin() {
    const pin = $('#pin_completo').val();
    const destino = $('#destino_hidden').val();
    const intentos = $('#intentos_input').val();
    if(pin.length < 4) return Swal.fire("PIN incompleto", "Ingresa los 4 dígitos", "info");

    try {
        const res = await fetch("/validar-pin-recuperacion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin, destino, intentos })
        });
        const data = await res.json();
        if(data.success) {
            $('#modalPIN').removeClass('active');
            $('#modal-reset-password').addClass('active');
        } else {
            $('.pin-in').val(""); $('#pin_completo').val("");
            $('#intentos_input').val(data.intentosRestantes);
            $('#contador_visual').text(data.intentosRestantes);
            $('.pin-in').first().focus();
            if(data.agotado) {
                Swal.fire("Agotado", "Has agotado los intentos.", "error").then(() => location.reload());
            } else {
                Swal.fire({ title: "PIN Incorrecto", text: `Quedan ${data.intentosRestantes} intentos.`, icon: "error", timer: 1500, showConfirmButton: false });
            }
        }
    } catch (e) { Swal.fire("Error", "Error al procesar", "error"); }
}

async function confirmarCambioFinal() {
    const destino = $('#destino_hidden').val();
    const pin = $('#pin_completo').val();
    const nuevaPass = $('#nueva_pass').val();
    const confirmarPass = $('#confirmar_pass').val();

    if(nuevaPass.length < 6) return Swal.fire("Seguridad", "Mínimo 6 caracteres", "warning");
    if(nuevaPass !== confirmarPass) {
        $('#msg-error-pass').fadeIn();
        return Swal.fire("Error", "Las contraseñas no coinciden", "error");
    }

    Swal.showLoading();
    try {
        const res = await fetch("/confirmar-nuevo-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ destino, pin, nuevaPass })
        });
        const data = await res.json();
        if(data.success) {
            Swal.fire("¡Éxito!", "Contraseña actualizada.", "success").then(() => location.reload());
        } else {
            Swal.fire("Error", data.error, "error");
        }
    } catch (e) { Swal.fire("Error", "Error al actualizar clave", "error"); }
}

function ingresar() {
    if(!$('#login_final').val() || !$('#pass').val()) return Swal.fire("Error", "Ingresa tus credenciales", "warning");
    $('#formlogin').submit();
}