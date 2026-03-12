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
    
    // Inyectar datos básicos al modal
    document.getElementById('pop-titulo').innerText = d.titulo;
    document.getElementById('pop-img').src = d.foto || '/img/placeholder.jpg';
    document.getElementById('pop-categoria').innerText = d.category;
    document.getElementById('pop-tipo').innerText = d.tipo || 'No especificado';
    document.getElementById('pop-sexo').innerText = d.sexo || 'No especificado';
    document.getElementById('pop-raza').innerText = d.raza || 'No especificada';
    document.getElementById('pop-descripcion').innerText = d.descripcion;
    document.getElementById('pop-direccion').innerText = "📍 " + (d.direccion || 'No especificada');

    // --- LÓGICA DE CONTACTO (Basada en tu nueva tabla Users) ---
    const labelUsuario = document.getElementById('pop-usuario');
    const nombreDueño = d.usuario || 'Usuario'; // data-usuario="{{this.dueño_nombre}}"
    const contactoId = d.contacto || '';     // data-contacto="{{this.contacto_id}}"
    
    // Limpiamos el ID para ver si es un teléfono (solo números)
    const telLimpio = contactoId.replace(/\D/g, '');
    
    labelUsuario.innerText = nombreDueño;
    
    // Si el contacto_id parece un celular (10 o más dígitos)
    if (telLimpio.length >= 10) {
        labelUsuario.style.cursor = 'pointer';
        labelUsuario.style.color = '#10b981'; // Color verde éxito/whatsapp
        labelUsuario.title = "Click para enviar WhatsApp";
        
        labelUsuario.onclick = () => {
            // Formateamos para Argentina (+54) si no lo tiene
            const nroFinal = telLimpio.startsWith('54') ? telLimpio : '54' + telLimpio;
            const mensaje = `Hola ${nombreDueño}, te contacto por la mascota ${d.titulo} que vi en MasPerdida.`;
            window.open(`https://wa.me/${nroFinal}?text=${encodeURIComponent(mensaje)}`, '_blank');
        };
    } else {
        // Si es un mail o ID texto, solo mostramos el nombre
        labelUsuario.style.cursor = 'default';
        labelUsuario.style.color = '#2563eb';
        labelUsuario.onclick = null;
    }

    // --- MANEJO DE NOTAS ---
    const notaCont = document.getElementById('pop-nota-container');
    if (d.nota && d.nota !== 'undefined' && d.nota.trim() !== '') {
        document.getElementById('pop-nota').innerText = d.nota;
        notaCont.style.display = 'block';
    } else {
        notaCont.style.display = 'none';
    }

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

        markersGroup = L.layerGroup().addTo(mapaGeneral);
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
                
                // Al hacer click en un marcador, abrimos el PopUp con la info de ese botón
                m.on('click', () => {
                    mostrarPopUp(btn); 
                });

                markersCache.push(m);
            }
        });
        
        L.layerGroup(markersCache).addTo(markersGroup);
    }

    // Forzar re-render del mapa para evitar cuadros grises
    setTimeout(() => {
        mapaGeneral.invalidateSize();
        // Intentar geolocalizar al usuario
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                const coords = [pos.coords.latitude, pos.coords.longitude];
                mapaGeneral.flyTo(coords, 14, { animate: true, duration: 0.8 });
                L.circleMarker(coords, { 
                    radius: 8, 
                    color: '#fff', 
                    weight: 3, 
                    fillColor: '#2563eb', 
                    fillOpacity: 1 
                }).addTo(markersGroup);
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