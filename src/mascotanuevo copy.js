
    // Referencias DOM
    const selectCat = document.getElementById('id_categoria');
    const divPerdida = document.getElementById('div_fecha_perdida');
    const divNacimiento = document.getElementById('div_fecha_nacimiento');
    const inputPerdida = document.getElementById('input_fecha_perdida');
    const inputNacimiento = document.getElementById('input_fecha_nacimiento');
    const selectTipo = document.getElementById('id_tipo');
    const selectRaza = document.getElementById('id_raza');
    const opcionesRaza = document.querySelectorAll('.raza-option');

    // Lógica dinámica para Adopción vs Otros
    selectCat.addEventListener('change', function() {
        const texto = this.options[this.selectedIndex].text.toLowerCase();
        if (texto.includes('adopcion') || texto.includes('adopción')) {
            divNacimiento.classList.remove('hidden');
            divPerdida.classList.add('hidden');
            inputPerdida.value = "";
        } else {
            divPerdida.classList.remove('hidden');
            divNacimiento.classList.add('hidden');
            inputNacimiento.value = "1900-01-01";
        }
    });

    // Lógica Filtrado de Razas
    selectTipo.addEventListener('change', function() {
      selectRaza.disabled = false;
      selectRaza.value = "";
      opcionesRaza.forEach(opt => {
        opt.classList.toggle('hidden', opt.getAttribute('data-tipo') !== this.value);
      });
    });

    // Vista previa de imagen
    document.getElementById('foto2').onchange = function (e) {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          document.getElementById('img_preview').src = e.target.result;
          document.getElementById('img_preview').classList.remove('hidden');
          document.getElementById('placeholder').classList.add('hidden');
        }
        reader.readAsDataURL(file);
      }
    };

    // Fecha actual automática
    document.addEventListener("DOMContentLoaded", () => {
      document.getElementById('fecha_actual').value = new Date().toISOString().split('T')[0];
    });
  