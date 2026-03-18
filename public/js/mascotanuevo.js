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
  } catch (e) {
    console.error("Error geocoding:", e);
  }
}

// 5. NAVEGACIÓN (Stepper de 2 PASOS con Validación)
window.changeStep = function (step) {
  // 1. VALIDACIÓN: Si intenta ir al Paso 2, verificamos Paso 1
  if (step === 2) {
    const titulo = document.querySelector('input[name="titulo"]')?.value;
    const des = document.querySelector('textarea[name="des"]')?.value;
    const cat = document.getElementById("id_categoria")?.value;

    if (!cat || !titulo || !des) {
      Swal.fire({
        icon: "warning",
        title: "Faltan datos",
        text: "Por favor, completa el nombre, la descripción y la categoría antes de ubicar en el mapa.",
        confirmButtonColor: "#2563eb",
      });
      return; // Detiene el cambio de paso
    }
  }

  // 2. CAMBIO VISUAL DE PASOS (Sincronizado con tu HBS)
  const step1 = document.getElementById("step-1");
  const step2 = document.getElementById("step-2");
  const progress = document.getElementById("progress-bar");
  const indicator = document.getElementById("step-indicator");

  if (step === 1) {
    if (step1) step1.classList.remove("hidden");
    if (step2) step2.classList.add("hidden");
    if (indicator) indicator.innerText = "Paso 1 de 2";
    if (progress) progress.style.width = "50%";
  } else {
    if (step1) step1.classList.add("hidden");
    if (step2) step2.classList.remove("hidden");
    if (indicator) indicator.innerText = "Paso 2 de 2";
    if (progress) progress.style.width = "100%";

    // 3. LÓGICA DEL MAPA (Solo se dispara al entrar al Paso 2)
    setTimeout(() => {
      // Inicializar el mapa si no existe
      if (!map) {
        // Coordenadas iniciales (Obelisco o las que prefieras)
        map = L.map("map").setView([-34.6037, -58.3816], 13);
        
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // Icono personalizado (Asegúrate de que la ruta sea correcta)
        const iconoMascota = L.icon({
          iconUrl: "/img/iconoperrogato.png",
          iconSize: [45, 45],
          iconAnchor: [22, 45],
          popupAnchor: [0, -40],
        });

        // Crear el marcador inicial
        marker = L.marker([-34.6037, -58.3816], {
          draggable: true,
          icon: iconoMascota,
        }).addTo(map);

        // Evento: Click en el mapa
        map.on("click", function (e) {
          const { lat, lng } = e.latlng;
          actualizarUbicacion(lat, lng);
        });

        // Evento: Arrastrar el marcador
        marker.on("dragend", function () {
          const pos = marker.getLatLng();
          actualizarUbicacion(pos.lat, pos.lng);
        });
      }

      // LA CLAVE: Forzar a Leaflet a recalcular el tamaño del div visible
      map.invalidateSize();
      
      // Disparar la geolocalización automática
      if (typeof obtenerUbicacionPro === "function") {
        obtenerUbicacionPro();
      }
    }, 400); // 400ms es el tiempo ideal para que termine la animación de fade-in
  }

  window.scrollTo(0, 0);
};

// Función auxiliar para no repetir código
function actualizarUbicacion(lat, lng) {
  marker.setLatLng([lat, lng]);
  document.getElementById("latitud").value = lat;
  document.getElementById("longitud").value = lng;
  
  // Llamamos a tu función de geocodificación (Nominatim)
  if (typeof obtenerDireccionLeaflet === "function") {
    obtenerDireccionLeaflet(lat, lng);
  }
}


const obtenerUbicacionPro = () => {
  // 1. Configuración de opciones (Performance vs Batería)
  const geoOptions = {
    enableHighAccuracy: true, // Usa GPS si está disponible
    timeout: 8000, // Tiempo máximo de espera (8 segundos)
    maximumAge: 60000, // Acepta una posición guardada si tiene menos de 1 min
  };

  // 2. Verificación de soporte
  if (!navigator.geolocation) {
    Swal.fire("Error", "Tu navegador no soporta geolocalización", "error");
    return;
  }

  // Mostrar un loader mientras se "busca" el satélite/red
  Swal.showLoading();

navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      const miPosicion = [lat, lon];

      console.log(`Precisión: ${accuracy} metros`);

      // Cerramos el loader anterior si existía y mostramos el éxito
      Swal.fire({
        title: "¡Ubicación Detectada!",
        text: `Precisión de ${Math.round(accuracy)}m. Ahora marca el punto exacto si es necesario.`,
        icon: "success",
        confirmButtonColor: "#2563eb",
      });

      // 1. Actualizar Mapa e Inputs con SEGURIDAD
      // Forzamos el redibujado por si el mapa estaba en un div oculto antes
      map.invalidateSize(); 
      map.flyTo(miPosicion, 17);
      
      marker
        .setLatLng(miPosicion)
        .bindPopup("<b>Tu ubicación aproximada</b>")
        .openPopup();

      // Asignación de coordenadas a los inputs ocultos
      const inputLat = document.getElementById("latitud");
      const inputLon = document.getElementById("longitud");

      if (inputLat) inputLat.value = lat;
      if (inputLon) inputLon.value = lon;

      // 2. BUSCAR DIRECCIÓN AUTOMÁTICA
      // Usamos solo obtenerDireccionLeaflet porque Nominatim ya nos da 
      // calle, número, ciudad, provincia y país en una sola llamada.
      if (typeof obtenerDireccionLeaflet === "function") {
          obtenerDireccionLeaflet(lat, lon);
      }

      // ELIMINADO: llena_locali(lat, lon); 
      // Se quita para evitar el Error 500 y llamadas duplicadas al servidor.
    },
    (error) => {
      let mensaje = "No se pudo obtener la ubicación.";
      switch (error.code) {
        case error.PERMISSION_DENIED:
          mensaje = "Permiso denegado. Activa la ubicación en el candado de la barra de direcciones.";
          break;
        case error.POSITION_UNAVAILABLE:
          mensaje = "Información de ubicación no disponible (¿tienes el GPS activo?).";
          break;
        case error.TIMEOUT:
          mensaje = "La solicitud expiró. Inténtalo de nuevo en un espacio más abierto.";
          break;
      }
      Swal.fire("Atención", mensaje, "warning");
    },
    geoOptions
  );

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

  form?.addEventListener("submit", function (e) {
    const latInput = document.getElementById("latitud");
    const lonInput = document.getElementById("longitud");

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

async function obtenerDireccionLeaflet(lat, lon) {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);

  // Usamos zoom 18 para obtener el máximo detalle posible de Nominatim
  const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&zoom=18`;
  
  try {
    const nomResponse = await fetch(nominatimUrl, {
      headers: { 'User-Agent': 'MascotaPerdidaApp' }
    });
    const nomData = await nomResponse.json();
    
    if (nomData.address) {
      const a = nomData.address;
      const callePrincipal = a.road || a.pedestrian || a.path || "Calle sin nombre";
      const numero = a.house_number || "";

      // Dirección base
      let direccionFinal = numero ? `${callePrincipal} ${numero}` : callePrincipal;

      // Si NO hay número, intentamos Overpass PERO con manejo de errores estricto
      if (!numero) {
        try {
          const overpassQuery = `[out:json][timeout:2];way(around:60,${latitude},${longitude})[highway];out tags;`;
          const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);

          const ovResponse = await fetch(overpassUrl, { signal: controller.signal });
          clearTimeout(timeoutId);

          // Solo intentamos parsear si el servidor respondió 200 OK y es JSON
          if (ovResponse.status === 200) {
            const ovData = await ovResponse.json();
            if (ovData.elements && ovData.elements.length > 0) {
              const callesCercanas = [...new Set(ovData.elements
                .map(el => el.tags.name)
                .filter(name => name && name !== callePrincipal)
              )];

              if (callesCercanas.length >= 2) {
                direccionFinal = `${callePrincipal} entre ${callesCercanas[0]} y ${callesCercanas[1]}`;
              } else if (callesCercanas.length === 1) {
                direccionFinal = `${callePrincipal} casi esquina ${callesCercanas[0]}`;
              }
            }
          } else {
            // Si hay Error 429 o 504, usamos datos de Nominatim como Plan B
            const zona = a.neighbourhood || a.suburb || "";
            if (zona && zona !== callePrincipal) direccionFinal = `${callePrincipal} (Zona ${zona})`;
          }
        } catch (ovErr) {
          // Si Overpass falla, no hacemos nada, nos quedamos con la calle de Nominatim
          console.warn("Overpass saltado por saturación o error.");
          const zona = a.neighbourhood || a.suburb || "";
          if (zona && zona !== callePrincipal) direccionFinal = `${callePrincipal} (Zona ${zona})`;
        }
      }

      // ASIGNACIÓN FINAL
      $("#ubicacion_calle").val(direccionFinal.trim());
      $("#ubicacion_ciudad").val(a.city || a.town || a.village || a.suburb || "");
      $("#ubicacion_provincia").val(a.state || "");
      $("#ubicacion_pais").val(a.country || "");

      $("#latitud").val(latitude);
      $("#longitud").val(longitude);
    }
  } catch (error) {
    console.error("Error crítico:", error);
  }
}