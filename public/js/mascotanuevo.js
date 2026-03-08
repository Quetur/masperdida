// 1. VARIABLES GLOBALES
let map, marker;

// 2. CONFIGURACIÓN DE ICONOS (Leaflet oficial)
const fixLeafletIcons = () => {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com",
    iconUrl: "https://cdnjs.cloudflare.com",
    shadowUrl: "https://cdnjs.cloudflare.com",
  });
};

// 3. FUNCIÓN DE FILTRADO (Razas y Provincias)
const configurarFiltrado = (idPadre, idHijo, atributoData) => {
  const padre = document.getElementById(idPadre);
  const hijo = document.getElementById(idHijo);
  if (!padre || !hijo) return;

  padre.addEventListener("change", function () {
    const seleccion = this.value;
    hijo.disabled = false;
    hijo.value = ""; 
    hijo.querySelectorAll("option").forEach((opt) => {
      const dataRelacion = opt.getAttribute(atributoData);
      if (!dataRelacion) return;
      const match = dataRelacion === seleccion;
      opt.classList.toggle("hidden", !match);
      opt.style.display = match ? "block" : "none";
      opt.disabled = !match;
    });
  });
};

// 4. GEOLOCALIZACIÓN Y API DIRECCIÓN
async function llena_locali(lat, lon) {
  try {
    const res = await fetch(`/api/direccion/lat=${lat}&lon=${lon}`);
    const data = await res.json();
    if (data && !data.error) {
      document.querySelector('input[name="calle"]').value = data.calle || "";
      document.querySelector('input[name="altura"]').value = data.numero || "";
      document.querySelector('input[name="cp"]').value = data.cp || "";
    }
  } catch (e) { console.error("Error geocoding:", e); }
}

// 5. NAVEGACIÓN (Stepper de 2 PASOS con Validación)
window.changeStep = function (step) {
  // VALIDACIÓN: Si intenta ir al Paso 2, verificamos Paso 1
  if (step === 2) {
    const titulo = document.querySelector('input[name="titulo"]')?.value;
    const des = document.querySelector('textarea[name="des"]')?.value;
    const cat = document.getElementById("id_categoria")?.value;

    if (!cat || !titulo || !des) {
      Swal.fire({
        icon: 'warning',
        title: 'Faltan datos',
        text: 'Por favor, completa el nombre, la descripción y la categoría.',
        confirmButtonColor: '#2563eb'
      });
      return; // Detiene el cambio de paso
    }
  }

  const steps = [1, 2].map((n) => document.getElementById(`step-${n}`));
  const progress = document.getElementById("progress-bar");
  const indicator = document.getElementById("step-indicator");

  steps.forEach((el, i) => { if (el) el.classList.toggle("hidden", i !== step - 1); });
  if (indicator) indicator.innerText = `Paso ${step} de 2`;
  if (progress) progress.style.width = `${(step / 2) * 100}%`;

  // --- LÓGICA DEL PASO 2 (MAPA) ---
  if (step === 2) {
    setTimeout(() => {
      const ocultarLeyenda = () => {
        const leyenda = document.querySelector('.leyenda-mapa');
        if (leyenda) {
          leyenda.style.opacity = '0';
          setTimeout(() => leyenda.remove(), 500);
        }
      };

      if (!document.querySelector('.leyenda-mapa')) {
          const mapaDiv = document.getElementById('map');
          const leyenda = document.createElement('div');
          leyenda.className = 'leyenda-mapa animate-fade-in';
          leyenda.innerText = 'Mueve el marcador o haz clic en el mapa para ubicar el suceso';
          mapaDiv.parentElement.style.position = 'relative';
          mapaDiv.parentElement.appendChild(leyenda);
      }

      const iconoMascota = L.icon({
        iconUrl: '/img/iconoperrogato.png',
        iconSize: [45, 45],
        iconAnchor: [22, 45],
        popupAnchor: [0, -40]
      });

      if (!map) {
        map = L.map('map').setView([-34.6037, -58.3816], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        marker = L.marker([-34.6037, -58.3816], { draggable: true, icon: iconoMascota }).addTo(map);

        map.on('click', function(e) {
          ocultarLeyenda(); 
          const { lat, lng } = e.latlng;
          marker.setLatLng([lat, lng]);
          document.getElementById('latitud').value = lat;
          document.getElementById('longitud').value = lng;
          llena_locali(lat, lng);
          marker.bindPopup("<b>Ubicación marcada</b>").openPopup();
        });

        marker.on('dragend', function() {
          ocultarLeyenda();
          const pos = marker.getLatLng();
          document.getElementById('latitud').value = pos.lat;
          document.getElementById('longitud').value = pos.lng;
          llena_locali(pos.lat, pos.lng);
        });
      }

      map.invalidateSize();

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          const { latitude: lat, longitude: lon } = pos.coords;
          const miPosicion = [lat, lon];
          Swal.fire({
            title: '¡Ubicación Detectada!',
            text: 'Estás aquí, ahora marca donde viste o encontraste la mascota',
            icon: 'success',
            confirmButtonColor: '#2563eb'
          });
          map.flyTo(miPosicion, 17);
          marker.setLatLng(miPosicion);
          document.getElementById('latitud').value = lat;
          document.getElementById('longitud').value = lon;
          marker.bindPopup("<b>Tu ubicación actual</b>").openPopup();
          llena_locali(lat, lon);
        }, null, { enableHighAccuracy: true });
      }
    }, 400);
  }
  window.scrollTo(0, 0);
};

// 6. EVENTOS PRINCIPALES, FOTO Y GRABADO
document.addEventListener("DOMContentLoaded", () => {
    const inputPerdida = document.getElementById("input_fecha_perdida");
  if (inputPerdida) {
    const hoy = new Date().toISOString().split("T")[0];
    inputPerdida.value = hoy; // Setea la fecha de hoy en el calendario
  }
  
  // También el campo oculto por las dudas
  const fActualHidden = document.getElementById("fecha_actual");
  if (fActualHidden) {
    fActualHidden.value = new Date().toISOString().split("T")[0];
  }
  fixLeafletIcons();
  configurarFiltrado("id_tipo", "id_raza", "data-tipo");


  // Preview Foto
  document.getElementById("foto2")?.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = document.getElementById("img_preview");
        img.src = ev.target.result;
        img.classList.remove("hidden");
        document.getElementById("placeholder").classList.add("hidden");
      };
      reader.readAsDataURL(file);
    }
  });

  // --- LÓGICA FINAL DE GRABADO ---
  const form = document.getElementById("formMascota");
  const btnGrabar = document.getElementById("btn-grabar");

  form?.addEventListener("submit", function(e) {
    const latInput = document.getElementById('latitud');
    const lonInput = document.getElementById('longitud');

    // Asegurar coordenadas antes de enviar
    if (!latInput.value || latInput.value === "") {
        const currentPos = marker.getLatLng();
        latInput.value = currentPos.lat;
        lonInput.value = currentPos.lng;
    }

    // Activar Spinner
    if (btnGrabar) {
        btnGrabar.disabled = true;
        document.getElementById("btn-text")?.classList.add("hidden");
        document.getElementById("btn-spinner")?.classList.remove("hidden");
    }
  });

});
