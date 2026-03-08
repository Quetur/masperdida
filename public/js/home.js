/**
 * Abre el modal para ver la información de la mascota
 * @param {HTMLElement} btn - El botón que tiene los datos (data-attributes)
 */
function abrirModal(btn) {
    const datos = btn.dataset;
    const modal = document.getElementById("miModal");
    
    if (modal) {
        document.getElementById('modal-titulo').textContent = datos.titulo;
        document.getElementById('modal-img2').src = datos.foto;
        
        // Cargar descripción y contacto si existen los elementos
        const desc = document.getElementById('modal-descripcion-text');
        const cont = document.getElementById('modal-contacto-text');
        
        if (desc) desc.textContent = datos.descripcion;
        if (cont) cont.textContent = "Contacto: " + datos.contacto;

        modal.style.display = "flex";
    }
}


/**
 * Cierra el modal
 */
function cerrarModal() {
    const modal = document.getElementById("miModal");
    if (modal) {
        modal.style.display = "none";
    }
}

// ASIGNACIÓN DE EVENTOS
document.addEventListener("DOMContentLoaded", () => {
    // 1. Botones de cerrar (X o botón cancelar)
    const botonesCerrar = document.querySelectorAll(".close-modal, .btn-modal-close");
    botonesCerrar.forEach(btn => {
        btn.addEventListener("click", cerrarModal);
    });

    // 2. Cerrar al hacer clic fuera del contenido blanco
    window.addEventListener("click", (event) => {
        const modal = document.getElementById("miModal");
        if (event.target === modal) {
            cerrarModal();
        }
    });

    // 3. Cerrar con tecla Escape
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") cerrarModal();
    });
});


document.addEventListener("DOMContentLoaded", () => {
    // 1. LÓGICA DEL BUSCADOR EN TIEMPO REAL
    const searchInput = document.getElementById('search-input');
    const products = document.querySelectorAll('.product-card');
    const countDisplay = document.getElementById('count');
    const noResults = document.getElementById('no-results');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            let visibleCount = 0;

            products.forEach(card => {
                const title = (card.getAttribute('data-title') || "").toLowerCase();
                const category = (card.getAttribute('data-category') || "").toLowerCase();

                if (title.includes(term) || category.includes(term)) {
                    card.style.display = 'flex';
                    visibleCount++;
                } else {
                    card.style.display = 'none';
                }
            });

            if (countDisplay) countDisplay.textContent = visibleCount;
            if (noResults) noResults.style.display = visibleCount === 0 ? 'block' : 'none';
        });
    }

    // 2. ACTUALIZACIÓN AUTOMÁTICA DEL CONTADOR (Del Storage)
    actualizarContadorVisual();
});

/**
 * Función para actualizar el número en el ícono del carrito/lista
 */
function actualizarContadorVisual() {
    const spanContador = document.getElementById('items');
    if (spanContador) {
        // Obtenemos el array de 'mascotas' guardado en LocalStorage
        const mascotasLS = JSON.parse(localStorage.getItem('mascotas')) || [];
        // Mostramos el total de elementos en el array
        spanContador.textContent = mascotasLS.length;
    }
}

/**
 * Función para cerrar el modal
 */
function cerrarModal() {
    const modal = document.getElementById("miModal");
    if (modal) modal.style.display = "none";
}

// Cerrar al hacer clic fuera del modal
window.onclick = (event) => {
    const modal = document.getElementById("miModal");
    if (event.target == modal) {
        cerrarModal();
    }
};
