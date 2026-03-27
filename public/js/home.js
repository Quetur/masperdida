/**
 * home.js - Versión Completa y Unificada
 */

let mapaGeneral = null;
let markersGroup = null;
let cachedCards = null; 
let markersCache = [];  

// --- POPUP INDIVIDUAL (MODAL) ---
function mostrarPopUp(btn) {
    const d = btn.dataset;
    
    // --- FUNCIÓN DE LIMPIEZA INTERNA ---
    // Si el dato no existe, es 'undefined' o está vacío, devuelve null
    const validar = (val) => {
        if (!val || val === 'undefined' || val.trim() === '') return null;
        return val;
    };

    // --- INYECTAR TEXTOS PRINCIPALES ---
    document.getElementById('pop-titulo').innerText = validar(d.titulo) || 'Sin nombre';
    document.getElementById('pop-img').src = d.foto || '/img/placeholder.jpg';
    document.getElementById('pop-descripcion').innerText = validar(d.descripcion) || 'Sin descripción adicional.';
    document.getElementById('pop-direccion').innerText = "📍 " + (validar(d.direccion) || 'No especificada');

    // --- MANEJO DE BADGES (Categoría, Tipo, Sexo, Raza) ---
    // Esta lógica oculta el <span> si el dato es undefined
    const badges = [
        { id: 'pop-categoria', val: d.category },
        { id: 'pop-tipo', val: d.tipo },
        { id: 'pop-sexo', val: d.sexo },
        { id: 'pop-raza', val: d.raza }
    ];

    badges.forEach(badge => {
        const el = document.getElementById(badge.id);
        const valorLimpio = validar(badge.val);
        if (valorLimpio) {
            el.innerText = valorLimpio;
            el.style.display = 'inline-block';
        } else {
            el.style.display = 'none'; // Oculta el badge si no hay dato
        }
    });

    // --- LÓGICA DE CONTACTO ---
    const labelUsuario = document.getElementById('pop-usuario');
    const nombreDueño = validar(d.usuario) || 'Usuario';
    const contactoId = d.contacto || ''; 
    const telLimpio = contactoId.replace(/\D/g, '');
    
    labelUsuario.innerText = nombreDueño;
    
    if (telLimpio.length >= 10) {
        labelUsuario.style.cursor = 'pointer';
        labelUsuario.style.color = '#10b981';
        labelUsuario.title = "Click para enviar WhatsApp";
        
        labelUsuario.onclick = () => {
            // Formateo para Argentina: aseguramos el 54
            const nroFinal = telLimpio.startsWith('54') ? telLimpio : '54' + telLimpio;
            const mensaje = `Hola ${nombreDueño}, te contacto por la mascota ${d.titulo} que vi en MasPerdida.`;
            window.open(`https://wa.me/${nroFinal}?text=${encodeURIComponent(mensaje)}`, '_blank');
        };
    } else {
        labelUsuario.style.cursor = 'default';
        labelUsuario.style.color = '#2563eb';
        labelUsuario.onclick = null;
    }

    // --- MANEJO DE NOTAS ---
    const notaCont = document.getElementById('pop-nota-container');
    const valorNota = validar(d.nota);
    if (valorNota) {
        document.getElementById('pop-nota').innerText = valorNota;
        notaCont.style.display = 'block';
    } else {
        notaCont.style.display = 'none';
    }

    // Mostrar modal
    document.getElementById('detalle-pop-up').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function cerrarPopUp() {
    document.getElementById('detalle-pop-up').style.display = 'none';
    // Si el mapa general no está abierto, devolvemos el scroll al body
    if (document.getElementById('modal-mapa-general').style.display !== 'flex') {
        document.body.style.overflow = 'auto';
    }
}

// --- MAPA GENERAL ---
// --- MAPA GENERAL ---
function abrirMapaGeneral() {
    document.getElementById('modal-mapa-general').style.display = 'flex';
    document.body.style.overflow = 'hidden';

    if (!mapaGeneral) {
        // Inicializar mapa centrado en Buenos Aires por defecto
        mapaGeneral = L.map('map-general', { 
            preferCanvas: true,
            zoomControl: false
        }).setView([-34.6037, -58.3816], 12);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(mapaGeneral);

        // --- CAMBIO 1: Cambiar L.layerGroup() por L.markerClusterGroup() ---
        markersGroup = L.markerClusterGroup({
            spiderfyOnMaxZoom: true,   // Separa marcadores en la misma posición al zoom máximo
            showCoverageOnHover: false, // No muestra el área del cluster al pasar el mouse
            zoomToBoundsOnClick: true, // Al hacer click en el número, hace zoom a la zona
            disableClusteringAtZoom: 18 // Opcional: a este zoom se ven todos sueltos
        }).addTo(mapaGeneral);

        L.control.zoom({ position: 'bottomright' }).addTo(mapaGeneral);

        // Crear marcadores usando los datos de las cards existentes
        const buttons = document.querySelectorAll('.btn-view');
        
        buttons.forEach(btn => {
            const lat = parseFloat(btn.dataset.lat);
            const lng = parseFloat(btn.dataset.lng);

            if (!isNaN(lat) && lat !== 0) {
                const icon = L.divIcon({
                    className: 'custom-pet-icon',
                    html: `
                        <div style="width:48px; height:48px; border:3px solid white; border-radius:50%; overflow:hidden; box-shadow:0 4px 10px rgba(0,0,0,0.3); background:#fff;">
                            <img src="${btn.dataset.foto}" style="width:100%; height:100%; object-fit:cover;">
                        </div>
                        <div style="width:0; height:0; border-left:8px solid transparent; border-right:8px solid transparent; border-top:10px solid white; margin:-2px auto 0;"></div>`,
                    iconSize: [48, 58],
                    iconAnchor: [24, 58]
                });

                const m = L.marker([lat, lng], { icon });
                
                m.on('click', () => {
                    mostrarPopUp(btn); 
                });

                // --- CAMBIO 2: Agregar el marcador directamente al grupo de cluster ---
                markersGroup.addLayer(m);
                
                // Guardamos la referencia por si la necesitas luego
                markersCache.push(m);
            }
        });
        
        // --- CAMBIO 3: Borramos la línea L.layerGroup(markersCache).addTo(markersGroup); ---
        // Ya no es necesaria porque addLayer(m) ya los metió al grupo de clusters.
    }

    // Forzar re-render del mapa
    setTimeout(() => {
        mapaGeneral.invalidateSize();
        
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                const coords = [pos.coords.latitude, pos.coords.longitude];
                mapaGeneral.flyTo(coords, 14, { animate: true, duration: 0.8 });
                
                // El marcador de "tu ubicación" lo agregamos directo al mapa o un grupo aparte
                // para que no se mezcle con las mascotas en el cluster
                L.circleMarker(coords, { 
                    radius: 8, 
                    color: '#fff', 
                    weight: 3, 
                    fillColor: '#2563eb', 
                    fillOpacity: 1 
                }).addTo(mapaGeneral); 
            }, null, { enableHighAccuracy: false });
        }
    }, 200);
}

function cerrarMapaGeneral() {
    document.getElementById('modal-mapa-general').style.display = 'none';
    document.body.style.overflow = 'auto';
}

// --- BUSCADOR EN TIEMPO REAL ---
document.getElementById('search-input')?.addEventListener('input', function (e) {
    const term = e.target.value.toLowerCase().trim();
    
    // Cachear cards la primera vez para mayor velocidad
    if (!cachedCards) {
        cachedCards = Array.from(document.querySelectorAll('.product-card')).map(card => ({
            el: card,
            text: (card.dataset.title + " " + card.dataset.category).toLowerCase()
        }));
    }

    let count = 0;
    cachedCards.forEach(item => {
        const isMatch = item.text.includes(term);
        item.el.style.display = isMatch ? 'flex' : 'none';
        if (isMatch) count++;
    });
    
    const countEl = document.getElementById('count');
    if (countEl) countEl.innerText = count;
});