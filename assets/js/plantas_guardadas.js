/**
 * =============================================
 * SCRIPT PARA PANEL DE ADMINISTRACIÓN
 * Plantas Guardadas - Cuenca Alta del Río Ubaté
 * 
 * Funcionalidades:
 * 1. Gestión completa de imágenes (CRUD)
 * 2. Sistema de notificaciones por email
 * 3. Gestión de suscriptores (CON SUPABASE)
 * 4. Filtros y búsqueda avanzada
 * 5. Estadísticas en tiempo real
 * 6. 🆕 Gestión de tipo de publicación (Galería/Noticias)
 * =============================================
 */

// =============================================
// CONFIGURACIÓN GLOBAL
// =============================================
const API_BASE = 'https://pagina-web-2p69.onrender.com';
let todasLasImagenes = [];
let todosLosSuscriptores = [];

// =============================================
// INICIALIZACIÓN - CUANDO EL DOM ESTÉ LISTO
// =============================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Inicializando Panel de Administración...');
    inicializarEventListeners();
    cargarImagenes();
    cargarSuscriptores();
});

/**
 * =============================================
 * INICIALIZACIÓN DE EVENT LISTENERS
 * =============================================
 * Configura todos los event listeners necesarios
 */
function inicializarEventListeners() {
    // Búsqueda y filtros
    document.getElementById('searchInput').addEventListener('input', filtrarImagenes);
    document.getElementById('filterEstado').addEventListener('change', filtrarImagenes);
    document.getElementById('sortSelect').addEventListener('change', filtrarImagenes);
    
    // Botones principales
    document.getElementById('recargarBtn').addEventListener('click', cargarImagenes);
    document.getElementById('notificarTodosBtn').addEventListener('click', enviarNotificacionATodos);
    document.getElementById('gestionarSuscriptoresBtn').addEventListener('click', gestionarSuscriptores);
    document.getElementById('guardarEdicionBtn').addEventListener('click', guardarEdicion);
    
    console.log('✅ Event listeners inicializados correctamente');
}

// =============================================
// GESTIÓN DE SUSCRIPTORES (ACTUALIZADO PARA SUPABASE)
// =============================================

/**
 * Carga los suscriptores desde Supabase
 */
async function cargarSuscriptores() {
    try {
        const response = await fetch(`${API_BASE}/suscriptores`);
        
        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            todosLosSuscriptores = data.suscriptores;
            console.log(`📧 Suscriptores cargados: ${todosLosSuscriptores.length}`);
            actualizarContadorSuscriptores();
        } else {
            console.error('Error cargando suscriptores:', data.message);
            // Fallback a localStorage si hay error
            const suscriptoresLocal = JSON.parse(localStorage.getItem('suscriptores_cuenca_ubate')) || [];
            todosLosSuscriptores = suscriptoresLocal;
            actualizarContadorSuscriptores();
        }
    } catch (error) {
        console.error('Error cargando suscriptores:', error);
        // Fallback a localStorage
        const suscriptoresLocal = JSON.parse(localStorage.getItem('suscriptores_cuenca_ubate')) || [];
        todosLosSuscriptores = suscriptoresLocal;
        actualizarContadorSuscriptores();
    }
}

/**
 * Actualiza el contador de suscriptores en el panel
 */
function actualizarContadorSuscriptores() {
    const contador = document.getElementById('contadorSuscriptores');
    const suscriptoresActivos = todosLosSuscriptores.filter(s => s.activo !== false);
    contador.innerHTML = `<strong>${suscriptoresActivos.length} suscriptores</strong> registrados en Supabase`;
}

/**
 * Muestra modal para gestionar suscriptores (ACTUALIZADO)
 */
function gestionarSuscriptores() {
    if (todosLosSuscriptores.length === 0) {
        mostrarMensaje('No hay suscriptores registrados', 'info');
        return;
    }

    const suscriptoresActivos = todosLosSuscriptores.filter(s => s.activo !== false);

    const modalHTML = `
        <div class="modal fade" id="suscriptoresModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-users me-2"></i>Gestionar Suscriptores (${suscriptoresActivos.length} activos)
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-info">
                            <i class="fas fa-database me-2"></i>
                            Los suscriptores se almacenan en Supabase y se pueden eliminar permanentemente.
                        </div>
                        <div class="table-responsive">
                            <table class="table table-striped table-hover">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Nombre</th>
                                        <th>Email</th>
                                        <th>Fecha Registro</th>
                                        <th>Estado</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${suscriptoresActivos.map((suscriptor) => `
                                        <tr>
                                            <td>${suscriptor.id}</td>
                                            <td>${suscriptor.nombre}</td>
                                            <td>${suscriptor.email}</td>
                                            <td>${new Date(suscriptor.fecha_registro).toLocaleDateString('es-ES')}</td>
                                            <td>
                                                <span class="badge ${suscriptor.activo ? 'bg-success' : 'bg-secondary'}">
                                                    ${suscriptor.activo ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </td>
                                            <td>
                                                <button class="btn btn-outline-danger btn-sm" onclick="eliminarSuscriptor(${suscriptor.id}, '${suscriptor.nombre}')">
                                                    <i class="fas fa-trash"></i> Eliminar
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                        <button type="button" class="btn btn-danger" onclick="eliminarTodosSuscriptores()">
                            <i class="fas fa-trash-alt me-2"></i>Eliminar Todos
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remover modal existente si hay
    const modalExistente = document.getElementById('suscriptoresModal');
    if (modalExistente) {
        modalExistente.remove();
    }

    // Agregar y mostrar modal
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = new bootstrap.Modal(document.getElementById('suscriptoresModal'));
    modal.show();
}

/**
 * Elimina un suscriptor específico de Supabase
 * @param {number} suscriptorId - ID del suscriptor a eliminar
 * @param {string} nombre - Nombre del suscriptor
 */
async function eliminarSuscriptor(suscriptorId, nombre) {
    if (!confirm(`¿Eliminar permanentemente a ${nombre} de la base de datos?`)) return;

    try {
        const response = await fetch(`${API_BASE}/eliminar-suscriptor/${suscriptorId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            mostrarMensaje(`Suscriptor ${nombre} eliminado de Supabase`, 'success');
            // Recargar la lista de suscriptores
            await cargarSuscriptores();
            
            // Recargar el modal
            setTimeout(() => {
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

/**
 * Elimina todos los suscriptores (CONFIRMACIÓN MÚLTIPLE)
 */
async function eliminarTodosSuscriptores() {
    const suscriptoresActivos = todosLosSuscriptores.filter(s => s.activo !== false);
    
    if (suscriptoresActivos.length === 0) {
        mostrarMensaje('No hay suscriptores activos para eliminar', 'info');
        return;
    }

    if (!confirm(`¿ELIMINAR TODOS los ${suscriptoresActivos.length} suscriptores activos? Esta acción no se puede deshacer.`)) return;
    
    // Confirmación adicional por seguridad
    if (!confirm(`⚠️ ADVERTENCIA: Esto eliminará permanentemente ${suscriptoresActivos.length} suscriptores de la base de datos. ¿Continuar?`)) return;

    try {
        let eliminados = 0;
        let errores = 0;
        
        for (const suscriptor of suscriptoresActivos) {
            try {
                const response = await fetch(`${API_BASE}/eliminar-suscriptor/${suscriptor.id}`, {
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
                console.error(`Error eliminando suscriptor ${suscriptor.id}:`, error);
                errores++;
            }
        }
        
        if (errores === 0) {
            mostrarMensaje(`Todos los suscriptores (${eliminados}) han sido eliminados de Supabase`, 'success');
        } else {
            mostrarMensaje(`Eliminados: ${eliminados}, Errores: ${errores}`, 'warning');
        }
        
        // Recargar la lista
        await cargarSuscriptores();
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('suscriptoresModal'));
        if (modal) modal.hide();
        
    } catch (error) {
        console.error('Error eliminando todos los suscriptores:', error);
        mostrarMensaje('Error al eliminar suscriptores: ' + error.message, 'error');
    }
}

// =============================================
// SISTEMA DE NOTIFICACIONES (ACTUALIZADO)
// =============================================

/**
 * Envía notificaciones por email a todos los suscriptores
 */
async function enviarNotificacionATodos() {
    const suscriptoresActivos = todosLosSuscriptores.filter(s => s.activo !== false);
    
    if (suscriptoresActivos.length === 0) {
        mostrarMensaje('No hay suscriptores activos para notificar', 'warning');
        return;
    }

    console.log("📧 Enviando notificaciones a suscriptores:", suscriptoresActivos);

    if (!confirm(`¿Enviar notificación a ${suscriptoresActivos.length} suscriptores activos?`)) return;

    let exitosos = 0;
    let fallidos = 0;
    const progressToast = mostrarProgresoNotificacion(suscriptoresActivos.length);

    for (const [index, suscriptor] of suscriptoresActivos.entries()) {
        try {
            console.log(`📧 Enviando a: ${suscriptor.email}`);
            
            const params = {
                to_name: suscriptor.nombre,
                to_email: suscriptor.email,
                from_name: "Cuenca Ubaté",
                email: "cuencaubate@gmail.com",
                message: "🌿 ¡Nueva publicación! Se ha agregado nuevo contenido a la App Web de la Cuenca Alta del Río Ubaté. Visita nuestra galería para descubrir las últimas plantas identificadas y actualizaciones sobre nuestra biodiversidad.",
                date: new Date().toLocaleDateString('es-ES')
            };

            const result = await emailjs.send("service_y08wpag", "template_oh29c2d", params);
            console.log(`✅ Éxito enviando a ${suscriptor.email}`);
            exitosos++;
            
            actualizarProgresoNotificacion(progressToast, index + 1, suscriptoresActivos.length);
            await new Promise(resolve => setTimeout(resolve, 800));
            
        } catch (error) {
            console.error(`❌ Error enviando a ${suscriptor.email}:`, error);
            fallidos++;
        }
    }

    cerrarProgresoNotificacion(progressToast);
    
    mostrarMensaje(
        `Notificaciones enviadas: ${exitosos} exitosas, ${fallidos} fallidas`,
        exitosos > 0 ? 'success' : 'error'
    );
}

// =============================================
// GESTIÓN DE IMÁGENES - CORREGIDO
// =============================================

/**
 * Carga todas las imágenes desde la API
 */
async function cargarImagenes() {
    mostrarLoading(true);
    
    try {
        console.log('🔄 Cargando imágenes desde:', `${API_BASE}/list-images`);
        const response = await fetch(`${API_BASE}/list-images`);
        
        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📦 Datos recibidos:', data);
        
        if (data.images && Array.isArray(data.images) && data.images.length > 0) {
            todasLasImagenes = data.images.map(imagen => ({
                ...imagen,
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
            }));
            
            console.log("🖼️ Imágenes procesadas:", todasLasImagenes.length);
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

/**
 * Genera URL de placeholder para imágenes faltantes
 * @param {Object} imagen - Objeto de imagen
 * @returns {string} URL de placeholder
 */
function generarUrlPlaceholder(imagen) {
    const nombrePlanta = imagen.planta_id || 'Planta';
    const color = '4a7c59';
    return `https://via.placeholder.com/400x200/${color}/ffffff?text=${encodeURIComponent(nombrePlanta)}`;
}

/**
 * Actualiza las estadísticas en el dashboard
 */
function actualizarEstadisticas() {
    const total = todasLasImagenes.length;
    const publicadas = todasLasImagenes.filter(img => img.estado === 'publicada').length;
    const pendientes = todasLasImagenes.filter(img => img.estado === 'pendiente').length;
    const rechazadas = todasLasImagenes.filter(img => img.estado === 'rechazada').length;

    document.getElementById('totalImagenes').textContent = total;
    document.getElementById('publicadasCount').textContent = publicadas;
    document.getElementById('pendientesCount').textContent = pendientes;
    document.getElementById('rechazadasCount').textContent = rechazadas;
}

/**
 * Filtra y ordena las imágenes según los criterios seleccionados
 */
function filtrarImagenes() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const estadoFiltro = document.getElementById('filterEstado').value;
    const sortOption = document.getElementById('sortSelect').value;

    let imagenesFiltradas = todasLasImagenes.filter(imagen => {
        const coincideBusqueda = imagen.planta_id?.toLowerCase().includes(searchTerm) || 
                               imagen.description?.toLowerCase().includes(searchTerm);
        const coincideEstado = estadoFiltro === 'todas' || imagen.estado === estadoFiltro;
        return coincideBusqueda && coincideEstado;
    });

    // Ordenar imágenes
    imagenesFiltradas.sort((a, b) => {
        return sortOption === 'nuevas' ? 
            new Date(b.fecha_subida) - new Date(a.fecha_subida) : 
            new Date(a.fecha_subida) - new Date(b.fecha_subida);
    });

    mostrarImagenes(imagenesFiltradas);
}

/**
 * Muestra las imágenes en el contenedor
 * @param {Array} imagenes - Array de imágenes a mostrar
 */
function mostrarImagenes(imagenes) {
    const container = document.getElementById('imagenesContainer');
    
    if (imagenes.length === 0) {
        mostrarEmptyState();
        return;
    }

    container.innerHTML = imagenes.map(imagen => `
        <div class="col-md-6 col-lg-4">
            <div class="card">
                <span class="badge badge-estado ${getEstadoClass(imagen.estado)}">
                    ${getEstadoTexto(imagen.estado)}
                </span>
                
                <!-- 🆕 Badge de tipo de publicación -->
                <span class="badge badge-estado ${getTipoPublicacionClass(imagen.tipo_publicacion)}" style="top: 45px;">
                    ${getTipoPublicacionTexto(imagen.tipo_publicacion)}
                </span>
                
                <img src="${imagen.url_imagen}" class="image-preview w-100" 
                     alt="${imagen.planta_id || 'Imagen de planta'}"
                     onerror="this.src='https://via.placeholder.com/400x200/4a7c59/ffffff?text=Imagen+no+disponible'">
                <div class="card-body">
                    <h6 class="card-title">${imagen.planta_id || 'Sin título'}</h6>
                    <p class="card-text small">${imagen.description || 'Sin descripción'}</p>
                    
                    <!-- Información de coordenadas -->
                    <div class="coordenadas-info">
                        <i class="fas fa-map-marker-alt"></i> 
                        ${imagen.lat && imagen.lng ? 
                            `Coordenadas: ${imagen.lat}, ${imagen.lng}` : 
                            'Sin coordenadas'}
                    </div>
                    
                    <div class="small text-muted">
                        <i class="fas fa-user"></i> ${imagen.nombre_usuario}<br>
                        <i class="fas fa-calendar"></i> ${new Date(imagen.fecha_subida).toLocaleDateString()}
                    </div>
                    <div class="mt-3">
                        <div class="btn-group w-100" role="group">
                            ${imagen.estado !== 'publicada' ? 
                                `<button class="btn btn-success btn-sm" onclick="cambiarEstado(${imagen.id}, 'publicada')">
                                    <i class="fas fa-check"></i>
                                </button>` : ''
                            }
                            ${imagen.estado !== 'pendiente' ? 
                                `<button class="btn btn-warning btn-sm" onclick="cambiarEstado(${imagen.id}, 'pendiente')">
                                    <i class="fas fa-clock"></i>
                                </button>` : ''
                            }
                            ${imagen.estado !== 'rechazada' ? 
                                `<button class="btn btn-danger btn-sm" onclick="cambiarEstado(${imagen.id}, 'rechazada')">
                                    <i class="fas fa-times"></i>
                                </button>` : ''
                            }
                            <button class="btn btn-info btn-sm" onclick="editarImagen(
                                ${imagen.id}, 
                                '${(imagen.planta_id || '').replace(/'/g, "\\'")}', 
                                '${(imagen.description || '').replace(/'/g, "\\'")}',
                                '${imagen.lat || ''}',
                                '${imagen.lng || ''}',
                                '${imagen.tipo_publicacion || 'galeria'}'
                            )">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-outline-danger btn-sm" onclick="eliminarImagen(${imagen.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                        ${imagen.lat && imagen.lng ? 
                            `<button class="btn btn-mapa btn-sm w-100 mt-2" onclick="verEnMapa('${imagen.lat}', '${imagen.lng}', '${imagen.planta_id}')">
                                <i class="fas fa-map-marked-alt me-1"></i> Ver en Mapa
                            </button>` : ''
                        }
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    document.getElementById('emptyState').style.display = 'none';
}

// =============================================
// FUNCIONES DE MAPA
// =============================================

/**
 * Abre el mapa con las coordenadas de la imagen
 * @param {string} latitud - Latitud de la ubicación
 * @param {string} longitud - Longitud de la ubicación
 * @param {string} titulo - Título de la imagen
 */
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

/**
 * Cambia el estado de una imagen
 * @param {number} imageId - ID de la imagen
 * @param {string} nuevoEstado - Nuevo estado a asignar
 */
async function cambiarEstado(imageId, nuevoEstado) {
    if (!confirm(`¿Cambiar estado a "${getEstadoTexto(nuevoEstado)}"?`)) return;

    try {
        const response = await fetch(`${API_BASE}/cambiar-estado/${imageId}?nuevo_estado=${nuevoEstado}`, {
            method: 'PUT'
        });
        
        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            mostrarMensaje(`Estado cambiado a ${getEstadoTexto(nuevoEstado)}`, 'success');
            cargarImagenes();
            
            // Ofrecer enviar notificación si se publica
            if (nuevoEstado === 'publicada') {
                setTimeout(() => {
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

/**
 * Abre el modal para editar una imagen
 * @param {number} id - ID de la imagen
 * @param {string} titulo - Título actual
 * @param {string} descripcion - Descripción actual
 * @param {string} latitud - Latitud actual
 * @param {string} longitud - Longitud actual
 * @param {string} tipoPublicacion - Tipo de publicación actual
 */
function editarImagen(id, titulo, descripcion, latitud, longitud, tipoPublicacion = 'galeria') {
    document.getElementById('editImageId').value = id;
    document.getElementById('editTitulo').value = titulo || '';
    document.getElementById('editDescripcion').value = descripcion || '';
    document.getElementById('editLatitud').value = latitud || '';
    document.getElementById('editLongitud').value = longitud || '';
    document.getElementById('editTipoPublicacion').value = tipoPublicacion || 'galeria';
    
    new bootstrap.Modal(document.getElementById('editarModal')).show();
}

/**
 * Guarda los cambios de edición de una imagen
 */
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
        // Construir la URL con todos los parámetros
        let url = `${API_BASE}/editar-imagen/${id}?nuevo_nombre=${encodeURIComponent(nuevoTitulo)}&nueva_descripcion=${encodeURIComponent(nuevaDescripcion)}&tipo_publicacion=${encodeURIComponent(tipoPublicacion)}`;
        
        // Validar y agregar coordenadas si existen
        if (nuevaLatitud) {
            const latNum = parseFloat(nuevaLatitud);
            if (isNaN(latNum)) {
                mostrarMensaje('La latitud debe ser un número válido', 'error');
                return;
            }
            url += `&nueva_lat=${latNum}`;
        }
        
        if (nuevaLongitud) {
            const lngNum = parseFloat(nuevaLongitud);
            if (isNaN(lngNum)) {
                mostrarMensaje('La longitud debe ser un número válido', 'error');
                return;
            }
            url += `&nueva_lng=${lngNum}`;
        }

        console.log('🔧 URL de edición:', url);

        const response = await fetch(url, { method: 'PUT' });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error ${response.status}: ${errorText}`);
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

/**
 * Elimina una imagen permanentemente
 * @param {number} id - ID de la imagen a eliminar
 */
async function eliminarImagen(id) {
    if (!confirm('¿Eliminar esta imagen permanentemente?')) return;

    try {
        const response = await fetch(`${API_BASE}/delete-image/${id}`, {method: 'DELETE'});
        
        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
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
// FUNCIONES DE UTILIDAD - NUEVAS
// =============================================

/**
 * Obtiene la clase CSS para el tipo de publicación
 * @param {string} tipo - Tipo de publicación
 * @returns {string} Clase CSS correspondiente
 */
function getTipoPublicacionClass(tipo) {
    const clases = {
        'galeria': 'bg-primary',
        'noticias': 'bg-info'
    };
    return clases[tipo] || 'bg-secondary';
}

/**
 * Obtiene el texto legible para el tipo de publicación
 * @param {string} tipo - Tipo de publicación
 * @returns {string} Texto legible del tipo
 */
function getTipoPublicacionTexto(tipo) {
    const textos = {
        'galeria': '📷 Galería',
        'noticias': '📰 Noticias'
    };
    return textos[tipo] || tipo;
}

// =============================================
// FUNCIONES DE UTILIDAD EXISTENTES
// =============================================

/**
 * Muestra/oculta el indicador de carga
 * @param {boolean} mostrar - True para mostrar, false para ocultar
 */
function mostrarLoading(mostrar) {
    document.getElementById('loading').style.display = mostrar ? 'block' : 'none';
}

/**
 * Muestra el estado vacío cuando no hay imágenes
 */
function mostrarEmptyState() {
    document.getElementById('imagenesContainer').innerHTML = '';
    document.getElementById('emptyState').style.display = 'block';
}

/**
 * Obtiene la clase CSS para el estado
 * @param {string} estado - Estado de la imagen
 * @returns {string} Clase CSS correspondiente
 */
function getEstadoClass(estado) {
    const clases = {
        'publicada': 'bg-success',
        'pendiente': 'bg-warning',
        'rechazada': 'bg-danger',
        'activo': 'bg-info'
    };
    return clases[estado] || 'bg-secondary';
}

/**
 * Obtiene el texto legible para el estado
 * @param {string} estado - Estado de la imagen
 * @returns {string} Texto legible del estado
 */
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

/**
 * Muestra un mensaje toast al usuario
 * @param {string} mensaje - Mensaje a mostrar
 * @param {string} tipo - Tipo de mensaje (success, error, warning, info)
 */
function mostrarMensaje(mensaje, tipo) {
    const toast = document.createElement('div');
    toast.className = `alert alert-${tipo === 'error' ? 'danger' : tipo === 'warning' ? 'warning' : 'success'} alert-dismissible fade show position-fixed`;
    toast.style.cssText = 'top: 20px; right: 20px; z-index: 1050; min-width: 300px;';
    toast.innerHTML = `
        ${mensaje}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 5000);
}

/**
 * Muestra la barra de progreso para notificaciones
 * @param {number} total - Total de notificaciones a enviar
 * @returns {HTMLElement} Elemento toast del progreso
 */
function mostrarProgresoNotificacion(total) {
    const toast = document.createElement('div');
    toast.className = 'alert alert-info alert-dismissible fade show position-fixed';
    toast.style.cssText = 'top: 20px; right: 20px; z-index: 1050; min-width: 350px;';
    toast.innerHTML = `
        <h6><i class="fas fa-paper-plane me-2"></i>Enviando Notificaciones</h6>
        <div class="progress mt-2" style="height: 10px;">
            <div class="progress-bar progress-bar-striped progress-bar-animated" id="notificacionProgress" style="width: 0%"></div>
        </div>
        <div class="mt-2 small" id="notificacionContador">0/${total} enviados</div>
    `;
    
    document.body.appendChild(toast);
    return toast;
}

/**
 * Actualiza la barra de progreso de notificaciones
 * @param {HTMLElement} toast - Elemento toast del progreso
 * @param {number} actual - Número actual de notificaciones enviadas
 * @param {number} total - Total de notificaciones a enviar
 */
function actualizarProgresoNotificacion(toast, actual, total) {
    const progressBar = toast.querySelector('#notificacionProgress');
    const contador = toast.querySelector('#notificacionContador');
    const porcentaje = (actual / total) * 100;
    
    progressBar.style.width = `${porcentaje}%`;
    contador.textContent = `${actual}/${total} enviados`;
}

/**
 * Cierra la barra de progreso de notificaciones
 * @param {HTMLElement} toast - Elemento toast del progreso
 */
function cerrarProgresoNotificacion(toast) {
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 2000);
}
