// CONFIGURACIÓN
const API_BASE = 'https://pagina-web-2p69.onrender.com';
let todasLasImagenes = [];
let todosLosSuscriptores = [];

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', function() {
    console.log('Iniciando panel admin');
    cargarImagenes();
    cargarSuscriptores();
    configurarEventos();
});

// CONFIGURAR EVENTOS
function configurarEventos() {
    document.getElementById('searchInput').addEventListener('input', filtrarImagenes);
    document.getElementById('filterEstado').addEventListener('change', filtrarImagenes);
    document.getElementById('recargarBtn').addEventListener('click', cargarImagenes);
    document.getElementById('guardarEdicionBtn').addEventListener('click', guardarEdicion);
}

// CARGAR IMÁGENES
async function cargarImagenes() {
    mostrarLoading(true);
    
    try {
        const response = await fetch(API_BASE + '/list-images');
        
        if (!response.ok) {
            throw new Error('Error: ' + response.status);
        }
        
        const data = await response.json();
        
        if (data.images && data.images.length > 0) {
            todasLasImagenes = data.images;
            actualizarEstadisticas();
            mostrarImagenes(todasLasImagenes);
        } else {
            mostrarEmptyState();
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarMensaje('Error al cargar imágenes', 'error');
        mostrarEmptyState();
    } finally {
        mostrarLoading(false);
    }
}

// CARGAR SUSCRIPTORES
async function cargarSuscriptores() {
    try {
        const response = await fetch(API_BASE + '/suscriptores');
        const data = await response.json();
        
        if (data.success) {
            todosLosSuscriptores = data.suscriptores;
            actualizarContadorSuscriptores();
        }
    } catch (error) {
        console.error('Error suscriptores:', error);
    }
}

// ACTUALIZAR CONTADOR SUSCRIPTORES
function actualizarContadorSuscriptores() {
    const contador = document.getElementById('contadorSuscriptores');
    const activos = todosLosSuscriptores.filter(function(s) { 
        return s.activo !== false; 
    }).length;
    contador.innerHTML = '<strong>' + activos + ' suscriptores</strong>';
}

// ACTUALIZAR ESTADÍSTICAS
function actualizarEstadisticas() {
    const total = todasLasImagenes.length;
    const publicadas = todasLasImagenes.filter(function(img) { 
        return img.estado === 'publicada'; 
    }).length;
    const pendientes = todasLasImagenes.filter(function(img) { 
        return img.estado === 'pendiente'; 
    }).length;
    const rechazadas = todasLasImagenes.filter(function(img) { 
        return img.estado === 'rechazada'; 
    }).length;

    document.getElementById('totalImagenes').textContent = total;
    document.getElementById('publicadasCount').textContent = publicadas;
    document.getElementById('pendientesCount').textContent = pendientes;
    document.getElementById('rechazadasCount').textContent = rechazadas;
}

// FILTRAR IMÁGENES
function filtrarImagenes() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const estadoFiltro = document.getElementById('filterEstado').value;

    let imagenesFiltradas = todasLasImagenes.filter(function(imagen) {
        const coincideBusqueda = (imagen.planta_id && imagen.planta_id.toLowerCase().includes(searchTerm)) || 
                               (imagen.description && imagen.description.toLowerCase().includes(searchTerm));
        const coincideEstado = estadoFiltro === 'todas' || imagen.estado === estadoFiltro;
        return coincideBusqueda && coincideEstado;
    });

    mostrarImagenes(imagenesFiltradas);
}

// MOSTRAR IMÁGENES
function mostrarImagenes(imagenes) {
    const container = document.getElementById('imagenesContainer');
    
    if (imagenes.length === 0) {
        mostrarEmptyState();
        return;
    }

    let html = '';
    
    for (let i = 0; i < imagenes.length; i++) {
        const imagen = imagenes[i];
        const titulo = imagen.planta_id || 'Sin título';
        const descripcion = imagen.description || 'Sin descripción';
        const usuario = imagen.nombre_usuario || 'Anónimo';
        const fecha = new Date(imagen.fecha_subida).toLocaleDateString();
        const imagenUrl = imagen.url_imagen || 'https://via.placeholder.com/400x200/4a7c59/ffffff?text=Imagen';
        
        html += '<div class="col-md-6 col-lg-4">';
        html += '<div class="card">';
        
        // Badge estado
        html += '<span class="badge badge-estado ' + getEstadoClass(imagen.estado) + '">';
        html += getEstadoTexto(imagen.estado) + '</span>';
        
        // Imagen
        html += '<img src="' + imagenUrl + '" class="image-preview w-100" alt="' + titulo + '">';
        
        // Contenido
        html += '<div class="card-body">';
        html += '<h6 class="card-title">' + titulo + '</h6>';
        html += '<p class="card-text small">' + descripcion + '</p>';
        
        // Coordenadas
        if (imagen.lat && imagen.lng) {
            html += '<div class="coordenadas-info">';
            html += '<i class="fas fa-map-marker-alt"></i> Coordenadas: ' + imagen.lat + ', ' + imagen.lng;
            html += '</div>';
        }
        
        // Info usuario y fecha
        html += '<div class="small text-muted">';
        html += '<i class="fas fa-user"></i> ' + usuario + '<br>';
        html += '<i class="fas fa-calendar"></i> ' + fecha;
        html += '</div>';
        
        // Botones
        html += '<div class="mt-3">';
        html += '<div class="btn-group w-100" role="group">';
        
        if (imagen.estado !== 'publicada') {
            html += '<button class="btn btn-success btn-sm" onclick="cambiarEstado(' + imagen.id + ', \'publicada\')">';
            html += '<i class="fas fa-check"></i></button>';
        }
        
        if (imagen.estado !== 'pendiente') {
            html += '<button class="btn btn-warning btn-sm" onclick="cambiarEstado(' + imagen.id + ', \'pendiente\')">';
            html += '<i class="fas fa-clock"></i></button>';
        }
        
        if (imagen.estado !== 'rechazada') {
            html += '<button class="btn btn-danger btn-sm" onclick="cambiarEstado(' + imagen.id + ', \'rechazada\')">';
            html += '<i class="fas fa-times"></i></button>';
        }
        
        html += '<button class="btn btn-info btn-sm" onclick="editarImagen(' + imagen.id + ')">';
        html += '<i class="fas fa-edit"></i></button>';
        
        html += '<button class="btn btn-outline-danger btn-sm" onclick="eliminarImagen(' + imagen.id + ')">';
        html += '<i class="fas fa-trash"></i></button>';
        
        html += '</div>';
        
        if (imagen.lat && imagen.lng) {
            html += '<button class="btn btn-mapa btn-sm w-100 mt-2" onclick="verEnMapa(\'' + imagen.lat + '\', \'' + imagen.lng + '\')">';
            html += '<i class="fas fa-map-marked-alt me-1"></i> Ver en Mapa</button>';
        }
        
        html += '</div>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
    }

    container.innerHTML = html;
    document.getElementById('emptyState').style.display = 'none';
}

// CAMBIAR ESTADO
async function cambiarEstado(imageId, nuevoEstado) {
    if (!confirm('¿Cambiar estado a "' + getEstadoTexto(nuevoEstado) + '"?')) return;

    try {
        const response = await fetch(API_BASE + '/cambiar-estado/' + imageId + '?nuevo_estado=' + nuevoEstado, {
            method: 'PUT'
        });
        
        if (response.ok) {
            mostrarMensaje('Estado cambiado', 'success');
            cargarImagenes();
        }
    } catch (error) {
        mostrarMensaje('Error al cambiar estado', 'error');
    }
}

// EDITAR IMAGEN (SIMPLIFICADO)
function editarImagen(id) {
    const imagen = todasLasImagenes.find(function(img) { return img.id === id; });
    if (!imagen) return;
    
    document.getElementById('editImageId').value = id;
    document.getElementById('editTitulo').value = imagen.planta_id || '';
    document.getElementById('editDescripcion').value = imagen.description || '';
    document.getElementById('editLatitud').value = imagen.lat || '';
    document.getElementById('editLongitud').value = imagen.lng || '';
    
    new bootstrap.Modal(document.getElementById('editarModal')).show();
}

// GUARDAR EDICIÓN
async function guardarEdicion() {
    const id = document.getElementById('editImageId').value;
    const nuevoTitulo = document.getElementById('editTitulo').value;
    const nuevaDescripcion = document.getElementById('editDescripcion').value;

    if (!nuevoTitulo.trim()) {
        mostrarMensaje('El título es requerido', 'error');
        return;
    }

    try {
        const url = API_BASE + '/editar-imagen/' + id + '?nuevo_nombre=' + encodeURIComponent(nuevoTitulo) + 
                  '&nueva_descripcion=' + encodeURIComponent(nuevaDescripcion);

        const response = await fetch(url, { method: 'PUT' });
        
        if (response.ok) {
            mostrarMensaje('Imagen actualizada', 'success');
            bootstrap.Modal.getInstance(document.getElementById('editarModal')).hide();
            cargarImagenes();
        }
    } catch (error) {
        mostrarMensaje('Error al editar', 'error');
    }
}

// ELIMINAR IMAGEN
async function eliminarImagen(id) {
    if (!confirm('¿Eliminar esta imagen?')) return;

    try {
        const response = await fetch(API_BASE + '/delete-image/' + id, {method: 'DELETE'});
        
        if (response.ok) {
            mostrarMensaje('Imagen eliminada', 'success');
            cargarImagenes();
        }
    } catch (error) {
        mostrarMensaje('Error al eliminar', 'error');
    }
}

// VER EN MAPA
function verEnMapa(latitud, longitud) {
    const marcador = {
        lat: parseFloat(latitud),
        lng: parseFloat(longitud),
        fecha: new Date().toISOString()
    };
    
    localStorage.setItem('marcador_actual', JSON.stringify(marcador));
    window.open('Mapa.html', '_blank');
}

// FUNCIONES UTILIDAD
function getEstadoClass(estado) {
    if (estado === 'publicada') return 'bg-success';
    if (estado === 'pendiente') return 'bg-warning';
    if (estado === 'rechazada') return 'bg-danger';
    return 'bg-secondary';
}

function getEstadoTexto(estado) {
    if (estado === 'publicada') return 'Publicada';
    if (estado === 'pendiente') return 'Pendiente';
    if (estado === 'rechazada') return 'Rechazada';
    return estado;
}

function mostrarLoading(mostrar) {
    document.getElementById('loading').style.display = mostrar ? 'block' : 'none';
}

function mostrarEmptyState() {
    document.getElementById('imagenesContainer').innerHTML = '';
    document.getElementById('emptyState').style.display = 'block';
}

function mostrarMensaje(mensaje, tipo) {
    const alertClass = tipo === 'error' ? 'alert-danger' : 
                      tipo === 'warning' ? 'alert-warning' : 
                      tipo === 'info' ? 'alert-info' : 'alert-success';
    
    const toast = document.createElement('div');
    toast.className = 'alert ' + alertClass + ' alert-dismissible fade show position-fixed';
    toast.style.cssText = 'top: 20px; right: 20px; z-index: 1050; min-width: 300px;';
    toast.innerHTML = mensaje + '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>';
    
    document.body.appendChild(toast);
    
    setTimeout(function() {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 4000);
}
