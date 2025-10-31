// assets/js/suscripcion.js

// ========== CONFIGURACIÓN ==========
const API_BASE = 'http://localhost:8002';

// ========== INICIALIZACIÓN ==========

// Inicializa EmailJS con tu clave pública
(function() {
  emailjs.init("2KftwDvFRfdM9n8Si");
  console.log('✅ EmailJS inicializado correctamente');
})();

// ========== MANEJO DEL FORMULARIO ==========

document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('form');
  
  if (form) {
    form.addEventListener('submit', enviarNotificacion);
    console.log('✅ Formulario de suscripción listo');
  }
  
  // Agregar efectos de interacción a los inputs
  const inputs = document.querySelectorAll('.input-group input');
  inputs.forEach(input => {
    input.addEventListener('focus', function() {
      this.parentElement.classList.add('focused');
    });
    
    input.addEventListener('blur', function() {
      if (!this.value) {
        this.parentElement.classList.remove('focused');
      }
    });
  });
});

// ========== GUARDAR SUSCRIPTOR ==========

/**
 * Guarda un suscriptor en Supabase y como respaldo en localStorage
 */
async function guardarSuscriptor(nombre, email) {
  try {
    // Primero intentar guardar en Supabase
    const guardadoSupabase = await guardarEnSupabase(nombre, email);
    
    if (guardadoSupabase) {
      console.log('✅ Suscriptor guardado en Supabase:', { nombre, email });
      
      // También guardar en localStorage como respaldo
      guardarEnLocalStorage(nombre, email);
      return true;
    } else {
      // Si falla Supabase, guardar solo en localStorage
      console.log('⚠️  Guardando solo en localStorage (falló Supabase)');
      return guardarEnLocalStorage(nombre, email);
    }
    
  } catch (error) {
    console.error('❌ Error guardando suscriptor:', error);
    // Fallback a localStorage
    return guardarEnLocalStorage(nombre, email);
  }
}

/**
 * Guarda suscriptor en Supabase
 */
async function guardarEnSupabase(nombre, email) {
  try {
    const response = await fetch(`${API_BASE}/suscribir`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'nombre': nombre,
        'email': email
      })
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Suscriptor guardado exitosamente en Supabase');
      return true;
    } else {
      // Si el suscriptor ya existe, no es un error
      if (result.message && result.message.includes('ya está suscrito')) {
        console.log('ℹ️ Suscriptor ya existe en Supabase:', email);
        return true; // Consideramos éxito porque el usuario está suscrito
      }
      throw new Error(result.message || 'Error desconocido en Supabase');
    }
    
  } catch (error) {
    console.error('❌ Error guardando en Supabase:', error);
    return false;
  }
}

/**
 * Guarda suscriptor en localStorage como respaldo
 */
function guardarEnLocalStorage(nombre, email) {
  try {
    let suscriptores = JSON.parse(localStorage.getItem('suscriptores_cuenca_ubate')) || [];
    
    // Evitar duplicados
    const existe = suscriptores.find(s => s.email.toLowerCase() === email.toLowerCase());
    
    if (!existe) {
      const nuevoSuscriptor = {
        nombre: nombre.trim(),
        email: email.toLowerCase().trim(),
        fecha: new Date().toISOString(),
        activo: true,
        id: Date.now(), // ID único
        pendienteSincronizacion: true // Marcar para sincronizar después
      };
      
      suscriptores.push(nuevoSuscriptor);
      localStorage.setItem('suscriptores_cuenca_ubate', JSON.stringify(suscriptores));
      
      console.log('✅ Suscriptor guardado en localStorage:', nuevoSuscriptor);
      return true;
    } else {
      console.log('ℹ️ El suscriptor ya existe en localStorage:', email);
      return true; // Ya existe, no es un error
    }
  } catch (error) {
    console.error('❌ Error guardando en localStorage:', error);
    return false;
  }
}

// ========== ENVIAR NOTIFICACIÓN ==========

/**
 * Maneja el envío del formulario de suscripción
 */
async function enviarNotificacion(e) {
  e.preventDefault();
  
  const nombre = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const submitBtn = document.querySelector('.submit-btn');
  const originalText = submitBtn.innerHTML;

  // Validación básica
  if (!nombre || !email) {
    mostrarMensaje('Por favor completa todos los campos', 'error');
    return;
  }

  if (!validarEmail(email)) {
    mostrarMensaje('Por favor ingresa un correo electrónico válido', 'error');
    return;
  }

  // Mostrar estado de carga
  submitBtn.innerHTML = '<span class="btn-text">Suscribiendo...</span><span class="btn-icon">⏳</span>';
  submitBtn.disabled = true;

  try {
    // Guardar suscriptor (primero en Supabase, luego en localStorage)
    const guardadoExitoso = await guardarSuscriptor(nombre, email);

    if (!guardadoExitoso) {
      throw new Error('No se pudo guardar la suscripción');
    }

    // Enviar email de confirmación
    await enviarEmailConfirmacion(nombre, email);
    
    mostrarMensaje('🌱 ¡Suscripción exitosa! Te has registrado en nuestra base de datos.', 'success');
    
    // Limpiar formulario
    document.getElementById("form").reset();
    
  } catch (error) {
    console.error('❌ Error en suscripción:', error);
    
    if (error.message.includes('ya está suscrito')) {
      mostrarMensaje('📧 Ya estabas suscrito. ¡Gracias por tu interés!', 'info');
    } else {
      mostrarMensaje('❌ Error al procesar tu suscripción. Por favor intenta nuevamente.', 'error');
    }
  } finally {
    // Restaurar botón
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
}

/**
 * Envía email de confirmación al suscriptor
 */
async function enviarEmailConfirmacion(nombre, email) {
  const params = {
    to_name: nombre,
    to_email: email,
    from_name: "Cuenca Ubaté",
    email: "cuencaubate@gmail.com",
    message: "🌿 ¡Bienvenido/a a nuestra comunidad! Te has suscrito exitosamente para recibir notificaciones sobre nuevas publicaciones, descubrimientos de plantas y eventos en la Cuenca Alta del Río Ubaté. Estarás al tanto de todas nuestras actualizaciones y novedades.",
    date: new Date().toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  };

  try {
    const response = await emailjs.send("service_y08wpag", "template_oh29c2d", params);
    console.log('✅ Email de confirmación enviado:', response);
    return true;
  } catch (error) {
    console.error("❌ Error al enviar email de confirmación:", error);
    // No lanzamos error aquí porque la suscripción ya se guardó
    return false;
  }
}

// ========== FUNCIONES UTILITARIAS ==========

/**
 * Valida formato de email
 */
function validarEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * Muestra mensajes al usuario
 */
function mostrarMensaje(mensaje, tipo = 'info') {
  // Remover mensajes existentes
  const mensajesExistentes = document.querySelectorAll('.mensaje-alerta');
  mensajesExistentes.forEach(msg => msg.remove());
  
  // Crear elemento de mensaje
  const mensajeDiv = document.createElement('div');
  mensajeDiv.className = `mensaje-alerta mensaje-${tipo}`;
  mensajeDiv.innerHTML = `
    <span>${mensaje}</span>
    <button onclick="this.parentElement.remove()">×</button>
  `;
  
  // Estilos para el mensaje
  mensajeDiv.style.cssText = `
    position: fixed;
    top: 100px;
    right: 20px;
    background: ${tipo === 'success' ? '#d4edda' : 
                 tipo === 'error' ? '#f8d7da' : 
                 tipo === 'warning' ? '#fff3cd' : '#d1ecf1'};
    color: ${tipo === 'success' ? '#155724' : 
            tipo === 'error' ? '#721c24' : 
            tipo === 'warning' ? '#856404' : '#0c5460'};
    padding: 16px 20px;
    border-radius: 8px;
    border: 1px solid ${tipo === 'success' ? '#c3e6cb' : 
                      tipo === 'error' ? '#f5c6cb' : 
                      tipo === 'warning' ? '#ffeaa7' : '#bee5eb'};
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    max-width: 400px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    animation: slideIn 0.3s ease;
  `;
  
  // Estilo del botón de cerrar
  mensajeDiv.querySelector('button').style.cssText = `
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: inherit;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  document.body.appendChild(mensajeDiv);
  
  // Auto-eliminar después de 5 segundos
  setTimeout(() => {
    if (mensajeDiv.parentElement) {
      mensajeDiv.remove();
    }
  }, 5000);
}

// ========== SINCRONIZACIÓN ==========

/**
 * Sincroniza suscriptores pendientes de localStorage a Supabase
 */
async function sincronizarSuscriptoresPendientes() {
  try {
    const suscriptores = JSON.parse(localStorage.getItem('suscriptores_cuenca_ubate')) || [];
    const pendientes = suscriptores.filter(s => s.pendienteSincronizacion);
    
    if (pendientes.length === 0) {
      console.log('✅ No hay suscriptores pendientes de sincronizar');
      return;
    }
    
    console.log(`🔄 Sincronizando ${pendientes.length} suscriptores pendientes...`);
    
    let sincronizados = 0;
    let errores = 0;
    
    for (const suscriptor of pendientes) {
      try {
        const success = await guardarEnSupabase(suscriptor.nombre, suscriptor.email);
        
        if (success) {
          // Marcar como sincronizado
          suscriptor.pendienteSincronizacion = false;
          sincronizados++;
        } else {
          errores++;
        }
      } catch (error) {
        console.error(`Error sincronizando suscriptor ${suscriptor.email}:`, error);
        errores++;
      }
    }
    
    // Actualizar localStorage
    localStorage.setItem('suscriptores_cuenca_ubate', JSON.stringify(suscriptores));
    
    console.log(`✅ Sincronización completada: ${sincronizados} exitosos, ${errores} errores`);
    
    if (errores === 0) {
      mostrarMensaje(`✅ ${sincronizados} suscriptores sincronizados con la base de datos`, 'success');
    } else {
      mostrarMensaje(`⚠️ Sincronización: ${sincronizados} exitosos, ${errores} errores`, 'warning');
    }
    
  } catch (error) {
    console.error('❌ Error en sincronización:', error);
  }
}

// ========== INICIALIZACIÓN AVANZADA ==========

// Intentar sincronizar suscriptores pendientes al cargar la página
document.addEventListener('DOMContentLoaded', function() {
  // Pequeño delay para no interferir con la carga inicial
  setTimeout(() => {
    sincronizarSuscriptoresPendientes();
  }, 3000);
});

// Animación para los mensajes
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;
document.head.appendChild(style);

// ========== FUNCIONES GLOBALES ==========

/**
 * Obtiene la lista de suscriptores
 */
window.obtenerSuscriptores = function() {
  return JSON.parse(localStorage.getItem('suscriptores_cuenca_ubate')) || [];
};

/**
 * Exporta suscriptores como JSON
 */
window.exportarSuscriptores = function() {
  const suscriptores = obtenerSuscriptores();
  const dataStr = JSON.stringify(suscriptores, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `suscriptores_cuenca_ubate_${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  
  URL.revokeObjectURL(url);
};

/**
 * Función para desarrollo: Ver estado de suscriptores
 */
window.verEstadoSuscriptores = function() {
  const suscriptores = obtenerSuscriptores();
  const total = suscriptores.length;
  const pendientes = suscriptores.filter(s => s.pendienteSincronizacion).length;
  
  console.log('📊 Estado de suscriptores:');
  console.log(`- Total: ${total}`);
  console.log(`- Pendientes de sincronizar: ${pendientes}`);
  console.log(`- Sincronizados: ${total - pendientes}`);
  console.log('Lista completa:', suscriptores);
};