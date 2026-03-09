/**
 * home.js - Optimized & Architecture-Corrected
 */

let mapaGeneral = null;
let markersGroup = null;
let cachedCards = null; 
let markersCache = [];  

// --- POPUP INDIVIDUAL (MODAL) ---
function mostrarPopUp(btn) {
    const d = btn.dataset;
    
    // Inyectar datos al modal
    document.getElementById('pop-titulo').innerText = d.titulo;
    document.getElementById('pop-img').src = d.foto || '/img/placeholder.jpg';
    document.getElementById('pop-categoria').innerText = d.category;
    document.getElementById('pop-tipo').innerText = d.tipo || 'No especificado';
    document.getElementById('pop-sexo').innerText = d.sexo || 'No especificado';
    document.getElementById('pop-raza').innerText = d.raza || 'No especificada';
    document.getElementById('pop-descripcion').innerText = d.descripcion;
    document.getElementById('pop-direccion').innerText = "📍 " + (d.direccion || 'No especificada');

    // Formateo de contacto con WhatsApp
    const telOriginal = d.usuario || '';
    const telLimpio = telOriginal.replace(/\D/g, '');
    const labelUsuario = document.getElementById('pop-usuario');
    labelUsuario.innerHTML = formatPhone(telOriginal);
    
    if (telLimpio.length >= 10) {
        labelUsuario.style.cursor = 'pointer';
        labelUsuario.onclick = () => window.open(`https://wa.me/${telLimpio.startsWith('54') ? telLimpio : '54' + telLimpio}`, '_blank');
    }

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
    if (document.getElementById('modal-mapa-general').style.display !== 'flex') {
        document.body.style.overflow = 'auto';
    }
}

// --- MAPA GENERAL ---
function abrirMapaGeneral() {
    document.getElementById('modal-mapa-general').style.display = 'flex';
    document.body.style.overflow = 'hidden';

    if (!mapaGeneral) {
        mapaGeneral = L.map('map-general', { 
            preferCanvas: true,
            zoomControl: false
        }).setView([-34.6037, -58.3816], 12);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(mapaGeneral);

        markersGroup = L.layerGroup().addTo(mapaGeneral);
        L.control.zoom({ position: 'bottomright' }).addTo(mapaGeneral);

        // Crear marcadores desde los botones del catálogo
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
                
                // EVENTO CLICK EN MARCADOR: Abre el mismo popup que el catálogo
                m.on('click', () => {
                    mostrarPopUp(btn); 
                });

                markersCache.push(m);
            }
        });
        
        L.layerGroup(markersCache).addTo(markersGroup);
    }

    setTimeout(() => {
        mapaGeneral.invalidateSize();
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                const coords = [pos.coords.latitude, pos.coords.longitude];
                mapaGeneral.flyTo(coords, 14, { animate: true, duration: 0.8 });
                L.circleMarker(coords, { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(markersGroup);
            }, null, { enableHighAccuracy: false });
        }
    }, 200);
}

function cerrarMapaGeneral() {
    document.getElementById('modal-mapa-general').style.display = 'none';
    document.body.style.overflow = 'auto';
}

// --- BUSCADOR ---
document.getElementById('search-input')?.addEventListener('input', function (e) {
    const term = e.target.value.toLowerCase().trim();
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
    document.getElementById('count').innerText = count;
});

// --- UTILIDADES ---
function formatPhone(number) {
    if (!number) return 'No disponible';
    let cleaned = ('' + number).replace(/\D/g, '');
    if (cleaned.length === 10) {
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return number;
}