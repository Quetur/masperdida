let map, marker;

document.addEventListener("DOMContentLoaded", () => {
    // 1. Obtener coordenadas de los inputs
    const latInput = document.getElementById("latitud_input");
    const lngInput = document.getElementById("longitud_input");
    
    const latVal = parseFloat(latInput.value);
    const lngVal = parseFloat(lngInput.value);

    const latInicial = !isNaN(latVal) ? latVal : -34.6037;
    const lngInicial = !isNaN(lngVal) ? lngVal : -58.3816;

    // 2. Inicializar Mapa
    setTimeout(() => {
        map = L.map("map").setView([latInicial, lngInicial], 15);
        
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        map.invalidateSize();

        const iconoMascota = L.icon({
            iconUrl: "/img/iconoperrogato.png",
            iconSize: [45, 45],
            iconAnchor: [22, 45],
            popupAnchor: [0, -40]
        });

        marker = L.marker([latInicial, lngInicial], {
            draggable: true,
            icon: iconoMascota
        }).addTo(map);

        // LLENADO INICIAL: Si ya tenemos coordenadas, buscamos la dirección completa
        if (!isNaN(latVal)) {
            marker.bindPopup("Ubicación actual del extravío").openPopup();
            obtenerDireccionEdicion(latVal, lngVal); // <--- Agregado para que llene al cargar
        }

        marker.on("dragend", function() {
            const pos = marker.getLatLng();
            actualizarCoordenadas(pos.lat, pos.lng);
        });

        map.on("click", function(e) {
            const { lat, lng } = e.latlng;
            actualizarCoordenadas(lat, lng);
        });
    }, 400);

    // 2. Filtrado de Razas
    configurarFiltrado("id_tipo", "id_raza", "data-tipo");
    const tipoSelect = document.getElementById("id_tipo");
    if (tipoSelect) {
        const event = new Event('change');
        tipoSelect.dispatchEvent(event);
    }

    // 3. Preview de Foto
    const inputFoto = document.getElementById("input_foto");
    if (inputFoto) {
        inputFoto.addEventListener("change", function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const imgPreview = document.getElementById("img_preview");
                    if (imgPreview) imgPreview.src = ev.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }
});

// --- FUNCIONES CORE ---

function actualizarCoordenadas(lat, lng) {
    if (marker) marker.setLatLng([lat, lng]);
    document.getElementById("latitud_input").value = lat;
    document.getElementById("longitud_input").value = lng;
    
    // Disparamos la búsqueda de dirección
    obtenerDireccionEdicion(lat, lng);
}

async function obtenerDireccionEdicion(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
    
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'MascotaPerdidaApp' }
        });
        const data = await response.json();
        
        if (data.address) {
            const a = data.address;
            
            // 1. Extraer Calle y Nro
            const calle = a.road || a.pedestrian || a.path || a.suburb || "Calle desconocida";
            const numero = a.house_number || "";
            const direccionTexto = `${calle} ${numero}`.trim();
            
            // 2. Extraer Ciudad (Nominatim usa varios campos dependiendo la zona)
            const ciudadTexto = a.city || a.town || a.village || a.municipality || "Localidad desconocida";
            
            // 3. Extraer Provincia
            const provinciaTexto = a.state || "Provincia desconocida";

            // LLENAR INPUTS (IDs del HBS)
            const inputCalle = document.getElementById("ubicacion_calle");
            const inputCiudad = document.getElementById("ubicacion_ciudad");
            const inputProvincia = document.getElementById("ubicacion_provincia");
            const inputPais = document.getElementById("ubicacion_pais");

            if (inputCalle) inputCalle.value = direccionTexto;
            if (inputCiudad) inputCiudad.value = ciudadTexto;
            if (inputProvincia) inputProvincia.value = provinciaTexto;
            if (inputPais) inputPais.value = a.country || "Argentina";

            console.log("Ubicación actualizada:", direccionTexto, ciudadTexto, provinciaTexto);
        }
    } catch (error) {
        console.error("Error obteniendo dirección:", error);
    }
}

function configurarFiltrado(idPadre, idHijo, atributoData) {
    const padre = document.getElementById(idPadre);
    const hijo = document.getElementById(idHijo);
    if (!padre || !hijo) return;

    padre.addEventListener("change", function () {
        const seleccion = this.value;
        hijo.querySelectorAll("option").forEach((opt) => {
            const dataRelacion = opt.getAttribute(atributoData);
            if (!dataRelacion) return;
            const match = dataRelacion === seleccion;
            opt.style.display = match ? "block" : "none";
            opt.disabled = !match;
        });
        const selectedOption = hijo.options[hijo.selectedIndex];
        if (selectedOption && selectedOption.disabled) {
            hijo.value = ""; 
        }
    });
}