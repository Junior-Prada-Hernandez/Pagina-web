// assets/js/galeria.js

// ========== CONFIGURACIÓN ==========
const API_BASE = 'http://localhost:8002';
let todasLasImagenes = [];
let imagenesFiltradas = [];
let imagenActualIndex = 0;

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Iniciando galería pública...');
    cargarGaleriaPublica();
    configurarEventos();
    iniciarAnimacionHojas();
});

function configurarEventos() {
    // Búsqueda en tiempo real
    document.getElementById('searchInput').addEventListener('input', function(e) {
        filtrarGaleria(e.target.value);
    });
    
    // Teclado para navegación en modal
    document.addEventListener('keydown', function(e) {
        const modal = document.getElementById('imageModal');
        if (modal.classList.contains('show')) {
            if (e.key === 'ArrowLeft') {
                navegarImagen(-1);
            } else if (e.key === 'ArrowRight') {
                navegarImagen(1);
            } else if (e.key === 'Escape') {
                const modalInstance = bootstrap.Modal.getInstance(modal);
                modalInstance.hide();
            }
        }
    });
}

// ========== CARGA DE DATOS ==========
async function cargarGaleriaPublica() {
    mostrarLoading(true);
    mostrarEmptyState(false);
    
    try {
        console.log('📡 Cargando imágenes desde:', API_BASE);
        const response = await fetch(`${API_BASE}/list-images`);
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ Datos recibidos:', data);
        
        if (data.images && data.images.length > 0) {
        // Filtrar solo imágenes publicadas PARA GALERÍA
        todasLasImagenes = data.images.filter(img => 
        (img.estado === 'publicada' || img.estado === 'activo') &&
        img.tipo_publicacion === 'galeria'
        );
            
            console.log(`📸 Imágenes publicadas: ${todasLasImagenes.length}`);
            
            if (todasLasImagenes.length > 0) {
                imagenesFiltradas = [...todasLasImagenes];
                mostrarGaleria(imagenesFiltradas);
                actualizarInfoBusqueda();
            } else {
                mostrarEmptyState(true, 'No hay imágenes publicadas disponibles');
            }
        } else {
            mostrarEmptyState(true, 'No se encontraron imágenes en la base de datos');
        }
    } catch (error) {
        console.error('❌ Error cargando galería:', error);
        mostrarEmptyState(true, 'Error al cargar la galería. Intenta recargar la página.');
    } finally {
        mostrarLoading(false);
    }
}

// ========== MOSTRAR GALERÍA ==========
function mostrarGaleria(imagenes) {
    const container = document.getElementById('galeriaContainer');
    
    if (imagenes.length === 0) {
        mostrarEmptyState(true, 'No se encontraron imágenes que coincidan con tu búsqueda');
        return;
    }
    
    container.innerHTML = imagenes.map((imagen, index) => `
        <div class="col-md-6 col-lg-4">
            <div class="card h-100" onclick="abrirModal(${index})">
                <img src="${imagen.url_imagen}" class="card-img-top" 
                     alt="${imagen.planta_id || 'Imagen de planta'}"
                     loading="lazy"
                     onerror="this.src='https://via.placeholder.com/400x250/4a7c59/ffffff?text=Imagen+no+disponible'">
                <div class="card-body">
                    <h5 class="card-title">${imagen.planta_id || 'Planta sin nombre'}</h5>
                    <p class="card-text">${imagen.description || 'Descripción no disponible.'}</p>
                </div>
                <div class="card-footer bg-transparent">
                    <small class="text-muted">
                        <i class="fas fa-calendar me-1"></i>${formatearFecha(imagen.fecha_subida)}
                        ${imagen.nombre_usuario ? `<i class="fas fa-user ms-2 me-1"></i>${imagen.nombre_usuario}` : ''}
                    </small>
                </div>
            </div>
        </div>
    `).join('');

    mostrarEmptyState(false);
}

// ========== BÚSQUEDA Y FILTRADO ==========
function filtrarGaleria(terminoBusqueda) {
    const termino = terminoBusqueda.toLowerCase().trim();
    
    if (termino === '') {
        imagenesFiltradas = [...todasLasImagenes];
    } else {
        imagenesFiltradas = todasLasImagenes.filter(imagen => {
            const nombre = imagen.planta_id?.toLowerCase() || '';
            const descripcion = imagen.description?.toLowerCase() || '';
            const usuario = imagen.nombre_usuario?.toLowerCase() || '';
            
            return nombre.includes(termino) || 
                   descripcion.includes(termino) || 
                   usuario.includes(termino);
        });
    }
    
    mostrarGaleria(imagenesFiltradas);
    actualizarInfoBusqueda(termino);
}

function actualizarInfoBusqueda(termino = '') {
    const searchInfo = document.getElementById('searchInfo');
    
    if (termino) {
        searchInfo.innerHTML = `
            Mostrando <strong>${imagenesFiltradas.length}</strong> de 
            <strong>${todasLasImagenes.length}</strong> imágenes
            <span class="ms-2">• Búsqueda: "${termino}"</span>
        `;
    } else {
        searchInfo.innerHTML = `
            Mostrando <strong>${todasLasImagenes.length}</strong> imágenes publicadas
        `;
    }
}

function limpiarBusqueda() {
    document.getElementById('searchInput').value = '';
    filtrarGaleria('');
    document.getElementById('searchInput').focus();
}

// ========== MODAL Y NAVEGACIÓN ==========
function abrirModal(index) {
    if (imagenesFiltradas.length === 0) return;
    
    imagenActualIndex = index;
    actualizarModal();
    
    const modal = new bootstrap.Modal(document.getElementById('imageModal'));
    modal.show();
}

function navegarImagen(direccion) {
    if (imagenesFiltradas.length === 0) return;
    
    imagenActualIndex += direccion;
    
    // Navegación circular
    if (imagenActualIndex < 0) {
        imagenActualIndex = imagenesFiltradas.length - 1;
    } else if (imagenActualIndex >= imagenesFiltradas.length) {
        imagenActualIndex = 0;
    }
    
    actualizarModal();
}

function actualizarModal() {
    if (imagenesFiltradas.length === 0) return;
    
    const imagen = imagenesFiltradas[imagenActualIndex];
    
    document.getElementById('modalImage').src = imagen.url_imagen;
    document.getElementById('modalPlantName').textContent = imagen.planta_id || 'Planta sin nombre';
    document.getElementById('detailPlantName').textContent = imagen.planta_id || 'Planta sin nombre';
    document.getElementById('detailPlantDescription').textContent = imagen.description || 'Descripción no disponible.';
    document.getElementById('detailDate').textContent = formatearFecha(imagen.fecha_subida);
    document.getElementById('detailUser').textContent = imagen.nombre_usuario || 'Anónimo';
}

// ========== UTILIDADES ==========
function formatearFecha(fechaString) {
    try {
        const fecha = new Date(fechaString);
        return fecha.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (error) {
        return 'Fecha no disponible';
    }
}

function mostrarLoading(mostrar) {
    document.getElementById('loading').style.display = mostrar ? 'block' : 'none';
}

function mostrarEmptyState(mostrar, mensaje = 'No hay imágenes publicadas') {
    const emptyState = document.getElementById('emptyState');
    
    if (mostrar) {
        emptyState.innerHTML = `
            <i class="fas fa-images"></i>
            <h3>${mensaje}</h3>
            <p>Pronto podrás ver aquí las imágenes de plantas que sean publicadas.</p>
        `;
        emptyState.style.display = 'block';
        document.getElementById('galeriaContainer').innerHTML = '';
    } else {
        emptyState.style.display = 'none';
    }
}

// ========== ANIMACIÓN DE HOJAS ==========
function iniciarAnimacionHojas() {
    const leafContainer = document.getElementById('leafContainer');
    
    // Crear hojas usando emojis (más simple y confiable)
    const leafEmojis = ['🍃', '🌿', '🍂', '🍁'];
    
    // Crear 8 hojas (cantidad moderada)
    for (let i = 0; i < 8; i++) {
        setTimeout(() => {
            const leaf = document.createElement('div');
            leaf.className = 'leaf';
            leaf.innerHTML = leafEmojis[Math.floor(Math.random() * leafEmojis.length)];
            
            // Configuración aleatoria moderada
            const size = Math.random() * 20 + 20; // 20-40px
            const duration = Math.random() * 15 + 10; // 10-25s
            const startX = Math.random() * 100;
            const delay = Math.random() * 5;
            
            leaf.style.cssText = `
                font-size: ${size}px;
                left: ${startX}%;
                top: -${size}px;
                --random-x: ${(Math.random() * 100 - 50)}px;
                animation-duration: ${duration}s;
                animation-delay: ${delay}s;
                transform: rotate(${Math.random() * 360}deg);
            `;
            
            leafContainer.appendChild(leaf);
            
            // Reiniciar animación cuando termine
            leaf.addEventListener('animationiteration', () => {
                leaf.style.left = `${Math.random() * 100}%`;
                leaf.style.top = `-${size}px`;
                leaf.style.opacity = '0';
                leaf.style.setProperty('--random-x', `${(Math.random() * 100 - 50)}px`);
                void leaf.offsetWidth;
                leaf.style.opacity = '0.6';
            });
        }, i * 800); // Espaciado entre creación de hojas
    }
}

// ========== FUNCIONES GLOBALES ==========
window.recargarGaleria = function() {
    cargarGaleriaPublica();
};

window.limpiarBusqueda = limpiarBusqueda;
window.navegarImagen = navegarImagen;
window.abrirModal = abrirModal;