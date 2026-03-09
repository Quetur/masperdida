/**
 * home.js - Optimized for Performance
 */

let mapaGeneral = null;
let markersGroup = null;
let cachedCards = null; // Memoria para el buscador rápido

// --- POPUP INDIVIDUAL ---
function mostrarPopUp(btn) {
    const d = btn.dataset; 
    
    // Inyectar datos al modal de detalle
    document.getElementById('pop-titulo').innerText = d.titulo;
    document.getElementById('pop-img').src = d.foto || '/img/placeholder.jpg';
    document.getElementById('pop-categoria').innerText = d.category;
    document.getElementById('pop-tipo').innerText = d.tipo || 'No especificado';
    document.getElementById('pop-sexo').innerText = d.sexo || 'No especificado';
    document.getElementById('pop-raza').innerText = d.raza || 'No especificada';
    document.getElementById('pop-descripcion').innerText = d.descripcion;
    document.getElementById('pop-direccion').innerHTML = "📍 " + d.direccion;

    const notaCont = document.getElementById('pop-nota-container');
    if (d.nota && d.nota !== 'undefined') {
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
    document.body.style.overflow = 'auto';
}

// --- MAPA GENERAL (ZOOM TURBO) ---
function abrirMapaGeneral() {
    document.getElementById('modal-mapa-general').style.display = 'flex';
    document.body.style.overflow = 'hidden';

    if (!mapaGeneral) {
        // Inicialización con Aceleración por Hardware (Canvas)
        mapaGeneral = L.map('map-general', { 
            preferCanvas: true,
            zoomControl: false,
            inertia: false, // Desactiva el deslizamiento lento para más rapidez
            zoomAnimationThreshold: 100
        }).setView([-34.6037, -58.3816], 12);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(mapaGeneral);

        markersGroup = L.layerGroup().addTo(mapaGeneral);
        L.control.zoom({ position: 'bottomright' }).addTo(mapaGeneral);
    }

    // Pequeño delay para asegurar que el modal ya tiene sus dimensiones finales
    setTimeout(() => {
        mapaGeneral.invalidateSize();
        markersGroup.clearLayers();

        const buttons = document.querySelectorAll('.btn-view');
        const markers = [];

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
                    iconAnchor: [24, 58],
                    popupAnchor: [0, -58]
                });

                const m = L.marker([lat, lng], { icon }).bindPopup(`<b>${btn.dataset.titulo}</b>`);
                markers.push(m);
            }
        });

        // Agregamos todos los marcadores en un solo batch
        L.layerGroup(markers).addTo(markersGroup);

        // GEOLOCALIZACIÓN ACELERADA (FlyTo 0.6s)
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                const coords = [pos.coords.latitude, pos.coords.longitude];
                
                mapaGeneral.flyTo(coords, 15, {
                    animate: true,
                    duration: 0.6,    // ZOOM ULTRA RÁPIDO
                    easeLinearity: 0.1 // CURVA AGRESIVA
                });

                L.circleMarker(coords, { 
                    radius: 8, 
                    color: '#fff', 
                    weight: 3, 
                    fillColor: '#2563eb', 
                    fillOpacity: 1 
                }).addTo(markersGroup).bindPopup("Estás aquí");
            }, null, { enableHighAccuracy: false });
        }
    }, 150);
}

function cerrarMapaGeneral() {
    document.getElementById('modal-mapa-general').style.display = 'none';
    document.body.style.overflow = 'auto';
}

// --- BUSCADOR ULTRA-RÁPIDO ---
document.getElementById('search-input')?.addEventListener('input', function (e) {
    const term = e.target.value.toLowerCase().trim();
    
    // Cachear las cards la primera vez para no pedirlas al DOM siempre
    if (!cachedCards) {
        cachedCards = Array.from(document.querySelectorAll('.product-card')).map(card => ({
            el: card,
            text: (card.dataset.title + " " + card.dataset.category).toLowerCase()
        }));
    }

    let count = 0;
    for (let i = 0; i < cachedCards.length; i++) {
        const isMatch = cachedCards[i].text.includes(term);
        cachedCards[i].el.style.display = isMatch ? 'block' : 'none';
        if (isMatch) count++;
    }

    document.getElementById('count').innerText = count;
});