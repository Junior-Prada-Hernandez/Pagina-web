/**
 * =============================================
 * SCRIPT PARA PANEL DE ADMINISTRACIÓN
 * Plantas Guardadas - Cuenca Alta del Río Ubaté
 * =============================================
 */

// =============================================
// CONFIGURACIÓN GLOBAL
// =============================================
const API_BASE = 'https://pagina-web-2p69.onrender.com';
let todasLasImagenes = [];
let todosLosSuscriptores = [];

// =============================================
// INICIALIZACIÓN
// =============================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Inicializando Panel de Administración...');
    inicializarEventListeners();
    cargarImagenes();
    cargarSuscriptores();
});

// =============================================
// EVENT LISTENERS
// =============================================
function inicializarEventListeners() {
    document.getElementById('searchInput').addEventListener('input', filtrarImagenes);
    document.getElementById('filterEstado').addEventListener('change', filtrarImagenes);
    document.getElementById('sortSelect').addEventListener('change', filtrarImagenes);
    
    document.getElementById('recargarBtn').addEventListener('click', cargarImagenes);
    document.getElementById('notificarTodosBtn').addEventListener('click', enviarNotificacionATodos);
    document.getElementById('gestionarSuscriptoresBtn').addEventListener('click', gestionarSuscriptores);
    document.getElementById('guardarEdicionBtn').addEventListener('click', guardarEdicion);
}

// =============================================
// GESTIÓN DE SUSCRIPTORES
// =============================================
async function cargarSuscriptores() {
    try {
        const response = await fetch(API_BASE + '/suscriptores');
        
        if (!response.ok) {
            throw new Error('Error ' + response.status + ': ' + response.statusText);
        }
        
        const data = await response.json();
        
        if (data.success) {
            todosLosSuscriptores = data.suscriptores;
            console.log('📧 Suscriptores cargados: ' + todosLosSuscriptores.length);
            actualizarContadorSuscriptores();
        } else {
            console.error('Error cargando suscriptores:', data.message);
            const suscriptoresLocal = JSON.parse(localStorage.getItem('suscriptores_cuenca_ubate')) || [];
            todosLosSuscriptores = suscriptoresLocal;
            actualizarContadorSuscriptores();
        }
    } catch (error) {
        console.error('Error cargando suscriptores:', error);
        const suscriptoresLocal = JSON.parse(localStorage.getItem('suscriptores_cuenca_ubate')) || [];
        todosLosSuscriptores = suscriptoresLocal;
        actualizarContadorSuscriptores();
    }
}

function actualizarContadorSuscriptores() {
    const contador = document.getElementById('contadorSuscriptores');
    const suscriptoresActivos = todosLosSuscriptores.filter(function(s) { 
        return s.activo !== false; 
    });
    contador.innerHTML = '<strong>' + suscriptoresActivos.length + ' suscriptores</strong> registrados en Supabase';
}

function gestionarSuscriptores() {
    if (todosLosSuscriptores.length === 0) {
        mostrarMensaje('No hay suscriptores registrados', 'info');
        return;
    }

    const suscriptoresActivos = todosLosSuscriptores.filter(function(s) { 
        return s.activo !== false; 
    });

    let modalHTML = '';
    modalHTML += '<div class="modal fade" id="suscriptoresModal" tabindex="-1">';
    modalHTML += '<div class="modal-dialog modal-lg">';
    modalHTML += '<div class="modal-content">';
    modalHTML += '<div class="modal-header bg-primary text-white">';
    modalHTML += '<h5 class="modal-title">';
    modalHTML += '<i class="fas fa-users me-2"></i>Gestionar Suscriptores (' + suscriptoresActivos.length + ' activos)';
    modalHTML += '</h5>';
    modalHTML += '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>';
    modalHTML += '</div>';
    modalHTML += '<div class="modal-body">';
    modalHTML += '<div class="alert alert-info">';
    modalHTML += '<i class="fas fa-database me-2"></i>';
    modalHTML += 'Los suscriptores se almacenan en Supabase y se pueden eliminar permanentemente.';
    modalHTML += '</div>';
    modalHTML += '<div class="table-responsive">';
    modalHTML += '<table class="table table-striped table-hover">';
    modalHTML += '<thead><tr><th>ID</th><th>Nombre</th><th>Email</th><th>Fecha Registro</th><th>Estado</th><th>Acciones</th></tr></thead>';
    modalHTML += '<tbody>';

    suscriptoresActivos.forEach(function(suscriptor) {
        modalHTML += '<tr>';
        modalHTML += '<td>' + suscriptor.id + '</td>';
        modalHTML += '<td>' + suscriptor.nombre + '</td>';
        modalHTML += '<td>' + suscriptor.email + '</td>';
        modalHTML += '<td>' + new Date(suscriptor.fecha_registro).toLocaleDateString('es-ES') + '</td>';
        modalHTML += '<td><span class="badge ' + (suscriptor.activo ? 'bg-success' : 'bg-secondary') + '">';
        modalHTML += (suscriptor.activo ? 'Activo' : 'Inactivo') + '</span></td>';
        modalHTML += '<td><button class="btn btn-outline-danger btn-sm" onclick="eliminarSuscriptor(' + suscriptor.id + ', \'' + suscriptor.nombre + '\')">';
        modalHTML += '<i class="fas fa-trash"></i> Eliminar</button></td>';
        modalHTML += '</tr>';
    });

    modalHTML += '</tbody></table></div></div>';
    modalHTML += '<div class="modal-footer">';
    modalHTML += '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>';
    modalHTML += '<button type="button" class="btn btn-danger" onclick="eliminarTodosSuscriptores()">';
    modalHTML += '<i class="fas fa-trash-alt me-2"></i>Eliminar Todos</button>';
    modalHTML += '</div></div></div></div>';

    const modalExistente = document.getElementById('suscriptoresModal');
    if (modalExistente) {
        modalExistente.remove();
    }

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = new bootstrap.Modal(document.getElementById('suscriptoresModal'));
    modal.show();
}

async function eliminarSuscriptor(suscriptorId, nombre) {
    if (!confirm('¿Eliminar permanentemente a ' + nombre + ' de la base de datos?')) return;

    try {
        const response = await fetch(API_BASE + '/eliminar-suscriptor/' + suscriptorId, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Error ' + response.status + ': ' + response.statusText);
        }
        
        const result = await response.json();
        
        if (result.success) {
            mostrarMensaje('Suscriptor ' + nombre + ' eliminado de Supabase', 'success');
            await cargarSuscriptores();
            
            setTimeout(function() {
                const modal = bootstrap.Modal.getInstance(document.getElementById('suscriptoresModal'));
                if (modal) modal.hide();
                gestionarSuscriptores();
            }, 1000);
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Error eliminando suscriptor:', error);
        mostrarMensaje('Error al eliminar suscriptor: ' + error.message, 'error');
    }
}

async function eliminarTodosSuscriptores() {
    const suscriptoresActivos = todosLosSuscriptores.filter(function(s) { 
        return s.activo !== false; 
    });
    
    if (suscriptoresActivos.length === 0) {
        mostrarMensaje('No hay suscriptores activos para eliminar', 'info');
        return;
    }

    if (!confirm('¿ELIMINAR TODOS los ' + suscriptoresActivos.length + ' suscriptores activos? Esta acción no se puede deshacer.')) return;
    
    if (!confirm('⚠️ ADVERTENCIA: Esto eliminará permanentemente ' + suscriptoresActivos.length + ' suscriptores de la base de datos. ¿Continuar?')) return;

    try {
        let eliminados = 0;
        let errores = 0;
        
        for (let i = 0; i < suscriptoresActivos.length; i++) {
            const suscriptor = suscriptoresActivos[i];
            try {
                const response = await fetch(API_BASE + '/eliminar-suscriptor/' + suscriptor.id, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    const result = await response.json();
                    if (result.success) {
                        eliminados++;
                    } else {
                        errores++;
                    }
                } else {
                    errores++;
                }
            } catch (error) {
                console.error('Error eliminando suscriptor ' + suscriptor.id + ':', error);
                errores++;
            }
        }
        
        if (errores === 0) {
            mostrarMensaje('Todos los suscriptores (' + eliminados + ') han sido eliminados de Supabase', 'success');
        } else {
            mostrarMensaje('Eliminados: ' + eliminados + ', Errores: ' + errores, 'warning');
        }
        
        await cargarSuscriptores();
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('suscriptoresModal'));
        if (modal) modal.hide();
        
    } catch (error) {
        console.error('Error eliminando todos los suscriptores:', error);
        mostrarMensaje('Error al eliminar suscriptores: ' + error.message, 'error');
    }
}

// =============================================
// NOTIFICACIONES
// =============================================
async function enviarNotificacionATodos() {
    const suscriptoresActivos = todosLosSuscriptores.filter(function(s) { 
        return s.activo !== false; 
    });
    
    if (suscriptoresActivos.length === 0) {
        mostrarMensaje('No hay suscriptores activos para notificar', 'warning');
        return;
    }

    console.log('📧 Enviando notificaciones a suscriptores:', suscriptoresActivos);

    if (!confirm('¿Enviar notificación a ' + suscriptoresActivos.length + ' suscriptores activos?')) return;

    let exitosos = 0;
    let fallidos = 0;
    const progressToast = mostrarProgresoNotificacion(suscriptoresActivos.length);

    for (let i = 0; i < suscriptoresActivos.length; i++) {
        const suscriptor = suscriptoresActivos[i];
        try {
            console.log('📧 Enviando a: ' + suscriptor.email);
            
            const params = {
                to_name: suscriptor.nombre,
                to_email: suscriptor.email,
                from_name: "Cuenca Ubaté",
                email: "cuencaubate@gmail.com",
                message: "🌿 ¡Nueva publicación! Se ha agregado nuevo contenido a la App Web de la Cuenca Alta del Río Ubaté. Visita nuestra galería para descubrir las últimas plantas identificadas y actualizaciones sobre nuestra biodiversidad.",
                date: new Date().toLocaleDateString('es-ES')
            };

            const result = await emailjs.send("service_y08wpag", "template_oh29c2d", params);
            console.log('✅ Éxito enviando a ' + suscriptor.email);
            exitosos++;
            
            actualizarProgresoNotificacion(progressToast, i + 1, suscriptoresActivos.length);
            await new Promise(function(resolve) { return setTimeout(resolve, 800); });
            
        } catch (error) {
            console.error('❌ Error enviando a ' + suscriptor.email + ':', error);
            fallidos++;
        }
    }

    cerrarProgresoNotificacion(progressToast);
    
    mostrarMensaje(
        'Notificaciones enviadas: ' + exitosos + ' exitosas, ' + fallidos + ' fallidas',
        exitosos > 0 ? 'success' : 'error'
    );
}

// =============================================
// GESTIÓN DE IMÁGENES
// =============================================
async function cargarImagenes() {
    mostrarLoading(true);
    
    try {
        console.log('🔄 Cargando imágenes desde:', API_BASE + '/list-images');
        const response = await fetch(API_BASE + '/list-images');
        
        if (!response.ok) {
            throw new Error('Error ' + response.status + ': ' + response.statusText);
        }
        
        const data = await response.json();
        console.log('📦 Datos recibidos:', data);
        
        if (data.images && Array.isArray(data.images) && data.images.length > 0) {
            todasLasImagenes = data.images.map(function(imagen) {
                return {
                    id: imagen.id,
                    planta_id: imagen.planta_id || 'Sin nombre',
                    description: imagen.description || 'Sin descripción',
                    nombre_usuario: imagen.nombre_usuario || 'Anónimo',
                    fecha_subida: imagen.fecha_subida || new Date().toISOString(),
                    estado: imagen.estado || 'pendiente',
                    url_imagen: imagen.url_imagen || generarUrlPlaceholder(imagen),
                    lat: imagen.lat || null,
                    lng: imagen.lng || null,
                    tipo_publicacion: imagen.tipo_publicacion || 'galeria'
                };
            });
            
            console.log('🖼️ Imágenes procesadas:', todasLasImagenes.length);
            actualizarEstadisticas();
            filtrarImagenes();
        } else {
            console.log('📭 No hay imágenes o array vacío');
            mostrarEmptyState();
        }
    } catch (error) {
        console.error('❌ Error cargando imágenes:', error);
        mostrarMensaje('Error al cargar imágenes: ' + error.message, 'error');
        mostrarEmptyState();
    } finally {
        mostrarLoading(false);
    }
}

function generarUrlPlaceholder(imagen) {
    const nombrePlanta = imagen.planta_id || 'Planta';
    const color = '4a7c59';
    return 'https://via.placeholder.com/400x200/' + color + '/ffffff?text=' + encodeURIComponent(nombrePlanta);
}

function actualizarEstadisticas() {
    const total = todasLasImagenes.length;
    const publicadas = todasLasImagenes.filter(function(img) { return img.estado === 'publicada'; }).length;
    const pendientes = todasLasImagenes.filter(function(img) { return img.estado === 'pendiente'; }).length;
    const rechazadas = todasLasImagenes.filter(function(img) { return img.estado === 'rechazada'; }).length;

    document.getElementById('totalImagenes').textContent = total;
    document.getElementById('publicadasCount').textContent = publicadas;
    document.getElementById('pendientesCount').textContent = pendientes;
    document.getElementById('rechazadasCount').textContent = rechazadas;
}

function filtrarImagenes() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const estadoFiltro = document.getElementById('filterEstado').value;
    const sortOption = document.getElementById('sortSelect').value;

    let imagenesFiltradas = todasLasImagenes.filter(function(imagen) {
        const coincideBusqueda = (imagen.planta_id && imagen.planta_id.toLowerCase().includes(searchTerm)) || 
                               (imagen.description && imagen.description.toLowerCase().includes(searchTerm));
        const coincideEstado = estadoFiltro === 'todas' || imagen.estado === estadoFiltro;
        return coincideBusqueda && coincideEstado;
    });

    imagenesFiltradas.sort(function(a, b) {
        return sortOption === 'nuevas' ? 
            new Date(b.fecha_subida) - new Date(a.fecha_subida) : 
            new Date(a.fecha_subida) - new Date(b.fecha_subida);
    });

    mostrarImagenes(imagenesFiltradas);
}

function mostrarImagenes(imagenes) {
    const container = document.getElementById('imagenesContainer');
    
    if (imagenes.length === 0) {
        mostrarEmptyState();
        return;
    }

    let html = '';
    imagenes.forEach(function(imagen) {
        const titulo = imagen.planta_id || 'Sin título';
        const descripcion = imagen.description || 'Sin descripción';
        const usuario = imagen.nombre_usuario || 'Anónimo';
        const fecha = new Date(imagen.fecha_subida).toLocaleDateString();
        
        html += '<div class="col-md-6 col-lg-4">';
        html += '<div class="card">';
        html += '<span class="badge badge-estado ' + getEstadoClass(imagen.estado) + '">';
        html += getEstadoTexto(imagen.estado) + '</span>';
        
        html += '<span class="badge badge-estado ' + getTipoPublicacionClass(imagen.tipo_publicacion) + '" style="top: 45px;">';
        html += getTipoPublicacionTexto(imagen.tipo_publicacion) + '</span>';
        
        html += '<img src="' + imagen.url_imagen + '" class="image-preview w-100" ';
        html += 'alt="' + titulo + '" ';
        html += 'onerror="this.src=\'https://via.placeholder.com/400x200/4a7c59/ffffff?text=Imagen+no+disponible\'">';
        html += '<div class="card-body">';
        html += '<h6 class="card-title">' + titulo + '</h6>';
        html += '<p class="card-text small">' + descripcion + '</p>';
        
        html += '<div class="coordenadas-info">';
        html += '<i class="fas fa-map-marker-alt"></i> ';
        html += (imagen.lat && imagen.lng) ? 
            'Coordenadas: ' + imagen.lat + ', ' + imagen.lng : 
            'Sin coordenadas';
        html += '</div>';
        
        html += '<div class="small text-muted">';
        html += '<i class="fas fa-user"></i> ' + usuario + '<br>';
        html += '<i class="fas fa-calendar"></i> ' + fecha;
        html += '</div>';
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
        
        html += '<button class="btn btn-info btn-sm" onclick="editarImagen(' + imagen.id + ', \'' + 
                titulo.replace(/'/g, "\\'") + '\', \'' + 
                descripcion.replace(/'/g, "\\'") + '\', \'' + 
                (imagen.lat || '') + '\', \'' + 
                (imagen.lng || '') + '\', \'' + 
                (imagen.tipo_publicacion || 'galeria') + '\')">';
        html += '<i class="fas fa-edit"></i></button>';
        
        html += '<button class="btn btn-outline-danger btn-sm" onclick="eliminarImagen(' + imagen.id + ')">';
        html += '<i class="fas fa-trash"></i></button>';
        html += '</div>';
        
        if (imagen.lat && imagen.lng) {
            html += '<button class="btn btn-mapa btn-sm w-100 mt-2" onclick="verEnMapa(\'' + imagen.lat + '\', \'' + imagen.lng + '\', \'' + titulo + '\')">';
            html += '<i class="fas fa-map-marked-alt me-1"></i> Ver en Mapa</button>';
        }
        
        html += '</div></div></div></div>';
    });

    container.innerHTML = html;
    document.getElementById('emptyState').style.display = 'none';
}

// =============================================
// FUNCIONES DE MAPA
// =============================================
function verEnMapa(latitud, longitud, titulo) {
    const marcador = {
        lat: parseFloat(latitud),
        lng: parseFloat(longitud),
        titulo: titulo,
        fecha: new Date().toISOString()
    };
    
    localStorage.setItem('marcador_actual', JSON.stringify(marcador));
    window.open('Mapa.html', '_blank');
}

// =============================================
// OPERACIONES CRUD DE IMÁGENES
// =============================================
async function cambiarEstado(imageId, nuevoEstado) {
    if (!confirm('¿Cambiar estado a "' + getEstadoTexto(nuevoEstado) + '"?')) return;

    try {
        const response = await fetch(API_BASE + '/cambiar-estado/' + imageId + '?nuevo_estado=' + nuevoEstado, {
            method: 'PUT'
        });
        
        if (!response.ok) {
            throw new Error('Error ' + response.status + ': ' + response.statusText);
        }
        
        const result = await response.json();
        
        if (result.success) {
            mostrarMensaje('Estado cambiado a ' + getEstadoTexto(nuevoEstado), 'success');
            cargarImagenes();
            
            if (nuevoEstado === 'publicada') {
                setTimeout(function() {
                    if (confirm('¿Quieres enviar una notificación a todos los suscriptores sobre esta nueva publicación?')) {
                        enviarNotificacionATodos();
                    }
                }, 1000);
            }
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        mostrarMensaje('Error al cambiar estado: ' + error.message, 'error');
    }
}

function editarImagen(id, titulo, descripcion, latitud, longitud, tipoPublicacion) {
    document.getElementById('editImageId').value = id;
    document.getElementById('editTitulo').value = titulo || '';
    document.getElementById('editDescripcion').value = descripcion || '';
    document.getElementById('editLatitud').value = latitud || '';
    document.getElementById('editLongitud').value = longitud || '';
    document.getElementById('editTipoPublicacion').value = tipoPublicacion || 'galeria';
    
    new bootstrap.Modal(document.getElementById('editarModal')).show();
}

async function guardarEdicion() {
    const id = document.getElementById('editImageId').value;
    const nuevoTitulo = document.getElementById('editTitulo').value;
    const nuevaDescripcion = document.getElementById('editDescripcion').value;
    const nuevaLatitud = document.getElementById('editLatitud').value.trim();
    const nuevaLongitud = document.getElementById('editLongitud').value.trim();
    const tipoPublicacion = document.getElementById('editTipoPublicacion').value;

    if (!nuevoTitulo.trim()) {
        mostrarMensaje('El título es requerido', 'error');
        return;
    }

    try {
        let url = API_BASE + '/editar-imagen/' + id + '?nuevo_nombre=' + encodeURIComponent(nuevoTitulo) + 
                  '&nueva_descripcion=' + encodeURIComponent(nuevaDescripcion) + 
                  '&tipo_publicacion=' + encodeURIComponent(tipoPublicacion);
        
        if (nuevaLatitud) {
            const latNum = parseFloat(nuevaLatitud);
            if (isNaN(latNum)) {
                mostrarMensaje('La latitud debe ser un número válido', 'error');
                return;
            }
            url += '&nueva_lat=' + latNum;
        }
        
        if (nuevaLongitud) {
            const lngNum = parseFloat(nuevaLongitud);
            if (isNaN(lngNum)) {
                mostrarMensaje('La longitud debe ser un número válido', 'error');
                return;
            }
            url += '&nueva_lng=' + lngNum;
        }

        console.log('🔧 URL de edición:', url);

        const response = await fetch(url, { method: 'PUT' });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error('Error ' + response.status + ': ' + errorText);
        }
        
        const result = await response.json();
        
        if (result.success) {
            mostrarMensaje('Imagen actualizada correctamente', 'success');
            bootstrap.Modal.getInstance(document.getElementById('editarModal')).hide();
            cargarImagenes();
        } else {
            throw new Error(result.message || 'Error desconocido');
        }
    } catch (error) {
        console.error('❌ Error al editar:', error);
        mostrarMensaje('Error al editar la imagen: ' + error.message, 'error');
    }
}

async function eliminarImagen(id) {
    if (!confirm('¿Eliminar esta imagen permanentemente?')) return;

    try {
        const response = await fetch(API_BASE + '/delete-image/' + id, {method: 'DELETE'});
        
        if (!response.ok) {
            throw new Error('Error ' + response.status + ': ' + response.statusText);
        }
        
        const result = await response.json();
        
        if (result.success) {
            mostrarMensaje('Imagen eliminada', 'success');
            cargarImagenes();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        mostrarMensaje('Error al eliminar: ' + error.message, 'error');
    }
}

// =============================================
// FUNCIONES DE UTILIDAD
// =============================================
function getTipoPublicacionClass(tipo) {
    const clases = {
        'galeria': 'bg-primary',
        'noticias': 'bg-info'
    };
    return clases[tipo] || 'bg-secondary';
}

function getTipoPublicacionTexto(tipo) {
    const textos = {
        'galeria': '📷 Galería',
        'noticias': '📰 Noticias'
    };
    return textos[tipo] || tipo;
}

function mostrarLoading(mostrar) {
    document.getElementById('loading').style.display = mostrar ? 'block' : 'none';
}

function mostrarEmptyState() {
    document.getElementById('imagenesContainer').innerHTML = '';
    document.getElementById('emptyState').style.display = 'block';
}

function getEstadoClass(estado) {
    const clases = {
        'publicada': 'bg-success',
        'pendiente': 'bg-warning',
        'rechazada': 'bg-danger',
        'activo': 'bg-info'
    };
    return clases[estado] || 'bg-secondary';
}

function getEstadoTexto(estado) {
    const textos = {
        'publicada': 'Publicada',
        'pendiente': 'Pendiente',
        'rechazada': 'Rechazada',
        'activo': 'Activo'
    };
    return textos[estado] || estado;
}

// =============================================
// SISTEMA DE NOTIFICACIONES VISUALES
// =============================================
function mostrarMensaje(mensaje, tipo) {
    const toast = document.createElement('div');
    let alertClass = 'alert-success';
    if (tipo === 'error') alertClass = 'alert-danger';
    else if (tipo === 'warning') alertClass = 'alert-warning';
    else if (tipo === 'info') alertClass = 'alert-info';
    
    toast.className = 'alert ' + alertClass + ' alert-dismissible fade show position-fixed';
    toast.style.cssText = 'top: 20px; right: 20px; z-index: 1050; min-width: 300px;';
    toast.innerHTML = mensaje + '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>';
    
    document.body.appendChild(toast);
    
    setTimeout(function() {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 5000);
}

function mostrarProgresoNotificacion(total) {
    const toast = document.createElement('div');
    toast.className = 'alert alert-info alert-dismissible fade show position-fixed';
    toast.style.cssText = 'top: 20px; right: 20px; z-index: 1050; min-width: 350px;';
    toast.innerHTML = '<h6><i class="fas fa-paper-plane me-2"></i>Enviando Notificaciones</h6>' +
                     '<div class="progress mt-2" style="height: 10px;">' +
                     '<div class="progress-bar progress-bar-striped progress-bar-animated" id="notificacionProgress" style="width: 0%"></div>' +
                     '</div>' +
                     '<div class="mt-2 small" id="notificacionContador">0/' + total + ' enviados</div>';
    
    document.body.appendChild(toast);
    return toast;
}

function actualizarProgresoNotificacion(toast, actual, total) {
    const progressBar = toast.querySelector('#notificacionProgress');
    const contador = toast.querySelector('#notificacionContador');
    const porcentaje = (actual / total) * 100;
    
    progressBar.style.width = porcentaje + '%';
    contador.textContent = actual + '/' + total + ' enviados';
}

function cerrarProgresoNotificacion(toast) {
    setTimeout(function() {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 2000);
}
