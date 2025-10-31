/**
 * =============================================
 * SCRIPT PARA PÁGINA DE LOGIN ADMINISTRATIVO
 * Cuenca Alta del Río Ubaté
 * 
 * Funcionalidades:
 * 1. Autenticación de administradores
 * 2. Cambio de contraseñas
 * 3. Manejo de modal para cambio de contraseña
 * 4. Notificaciones por EmailJS
 * =============================================
 */

// =============================================
// CONFIGURACIÓN DE SUPABASE
// =============================================
const SUPABASE_URL = 'https://arpartnlablfedsqxbsz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFycGFydG5sYWJsZmVkc3F4YnN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxODU5MzQsImV4cCI6MjA2OTc2MTkzNH0.Vg5bkYt0ON_-WAM2-Ftq4x_i67yizI39FkGxuBWxTWs';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// =============================================
// CONFIGURACIÓN DE EMAILJS - ACTUALIZADA
// =============================================
const EMAILJS_CONFIG = {
    PUBLIC_KEY: '2KftwDvFRfdM9n8Si',
    SERVICE_ID: 'service_y08wpag',
    TEMPLATE_ID: 'template_c9gj3gr' // ← NUEVO TEMPLATE ID
};

// Inicializar EmailJS
emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);
console.log('✅ EmailJS inicializado correctamente');
console.log('📧 Configuración:', EMAILJS_CONFIG);

// =============================================
// INICIALIZACIÓN - CUANDO EL DOM ESTÉ LISTO
// =============================================
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    console.log('🚀 Módulo de login inicializado correctamente');
});

/**
 * =============================================
 * INICIALIZACIÓN DE EVENT LISTENERS
 * =============================================
 * Configura todos los event listeners necesarios
 */
function initializeEventListeners() {
    // Botón de login
    document.getElementById('loginBtn').addEventListener('click', login);
    
    // Enter en campo de contraseña
    document.getElementById('password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            login();
        }
    });
    
    // Botón para abrir modal de cambio de contraseña
    document.getElementById('changePasswordBtn').addEventListener('click', openChangePassword);
    
    // Botón para cerrar modal
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    
    // Botón para enviar cambio de contraseña
    document.getElementById('changePasswordSubmitBtn').addEventListener('click', changePassword);
    
    // Cerrar modal al hacer clic fuera
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('passwordModal');
        if (event.target === modal) {
            closeModal();
        }
    });
}

/**
 * =============================================
 * FUNCIÓN DE LOGIN MEJORADA
 * =============================================
 * Autentica al usuario usando Supabase RPC
 */
async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('loginBtn');
    const messageDiv = document.getElementById('message');

    // Deshabilitar botón durante la verificación
    loginBtn.disabled = true;
    loginBtn.textContent = 'Verificando...';
    messageDiv.innerHTML = '';

    try {
        console.log('🔐 Intentando login para usuario:', username);
        
        // Llamar función RPC de Supabase para verificar credenciales
        const { data, error } = await supabaseClient.rpc('verify_password', {
            p_username: username,
            p_password: password
        });

        console.log('📨 Respuesta del servidor:', data, 'Error:', error);

        if (error) {
            console.error('❌ Error en RPC:', error);
            throw new Error('Error del servidor: ' + error.message);
        }

        if (data === true) {
            console.log('✅ Login exitoso! Redirigiendo...');
            messageDiv.innerHTML = '<div class="success">✓ Login exitoso</div>';
            
            // Redirigir después de 1 segundo
            setTimeout(() => {
                window.location.href = 'plantas_guardadas.html';
            }, 1000);
        } else {
            throw new Error('Usuario o contraseña incorrectos');
        }

    } catch (error) {
        console.error('❌ Error en proceso de login:', error);
        messageDiv.innerHTML = `<div class="error">✗ ${error.message}</div>`;
    } finally {
        // Reestablecer botón
        loginBtn.disabled = false;
        loginBtn.textContent = 'Ingresar';
    }
}

/**
 * =============================================
 * FUNCIÓN PARA ENVIAR NOTIFICACIÓN POR CORREO
 * =============================================
 * Envía notificación con la nueva contraseña
 */
async function sendPasswordChangeNotification(username, newPassword, userEmail) {
    try {
        console.log('📧 Enviando notificación de cambio de contraseña');
        console.log('🔑 Nueva contraseña a enviar:', newPassword);
        
        // Obtener IP aproximada
        let ipAddress = 'Desconocida';
        try {
            const ipResponse = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipResponse.json();
            ipAddress = ipData.ip;
            console.log('🌐 IP detectada:', ipAddress);
        } catch (ipError) {
            console.log('❌ No se pudo obtener la IP');
        }
        
        const templateParams = {
            to_email: userEmail,
            username: username,
            new_password: newPassword, // ← ESTA ES LA CONTRASEÑA QUE SE ENVIARÁ
            change_date: new Date().toLocaleString('es-CO', {
                timeZone: 'America/Bogota',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }),
            app_name: 'Cuenca Ubaté - Sistema Administrativo',
            support_contact: 'jcesarjuniorprada@ucundinamarca.edu.co',
            ip_address: ipAddress
        };

        console.log('📨 Parámetros que se enviarán:', templateParams);

        const response = await emailjs.send(
            EMAILJS_CONFIG.SERVICE_ID,
            EMAILJS_CONFIG.TEMPLATE_ID,
            templateParams
        );

        console.log('✅ Notificación enviada correctamente:', response);
        return { 
            success: true, 
            message: 'Notificación enviada correctamente'
        };
        
    } catch (error) {
        console.error('❌ Error enviando notificación:', error);
        console.error('🔍 Detalles del error:', {
            status: error.status,
            text: error.text,
            message: error.message
        });
        return { 
            success: false, 
            message: 'Error: ' + (error.text || error.message)
        };
    }
}

/**
 * =============================================
 * FUNCIÓN PARA OBTENER CORREOS DE ADMINISTRADORES
 * =============================================
 * Retorna el correo fijo del administrador
 */
async function getAdminEmailsToNotify() {
    // Retorna un array con tu correo fijo
    return [
        {
            email: 'jcesarjuniorprada@ucundinamarca.edu.co',
            nombre: 'Administrador Principal',
            usuario: 'admin'
        }
    ];
}

/**
 * =============================================
 * FUNCIÓN PARA CAMBIAR CONTRASEÑA MEJORADA
 * =============================================
 * Permite al usuario cambiar su contraseña
 * y envía notificaciones por correo
 */
async function changePassword() {
    const username = document.getElementById('changePasswordUsername').value;
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const modalMessage = document.getElementById('modalMessage');
    const changePasswordBtn = document.getElementById('changePasswordSubmitBtn');

    // Limpiar mensajes anteriores
    modalMessage.innerHTML = '';

    // =============================================
    // VALIDACIONES CLIENTE
    // =============================================
    if (!username || !currentPassword || !newPassword || !confirmPassword) {
        modalMessage.innerHTML = '<div class="error">Todos los campos son obligatorios</div>';
        return;
    }

    if (newPassword !== confirmPassword) {
        modalMessage.innerHTML = '<div class="error">Las contraseñas no coinciden</div>';
        return;
    }

    if (newPassword.length < 6) {
        modalMessage.innerHTML = '<div class="error">La contraseña debe tener al menos 6 caracteres</div>';
        return;
    }

    // Deshabilitar botón durante el proceso
    changePasswordBtn.disabled = true;
    changePasswordBtn.textContent = 'Procesando...';

    try {
        console.log('🔄 Solicitando cambio de contraseña para:', username);
        
        // Llamar función RPC de Supabase para cambiar contraseña
        const { data, error } = await supabaseClient.rpc('cambiar_password_admin', {
            p_username: username,
            p_current_password: currentPassword,
            p_new_password: newPassword
        });

        console.log('📨 Respuesta cambio de contraseña:', data, 'Error:', error);

        if (error) {
            throw new Error('Error del servidor: ' + error.message);
        }

        if (data && data.success) {
            let successMessage = `<div class="success">✓ ${data.message}</div>`;
            
            // =============================================
            // ENVIAR NOTIFICACIONES POR CORREO
            // =============================================
            try {
                console.log('📧 Iniciando envío de notificaciones...');
                modalMessage.innerHTML = successMessage + '<div class="success">Enviando notificación...</div>';
                
                // Enviar notificación con la nueva contraseña
                const notificationResult = await sendPasswordChangeNotification(
                    username, 
                    newPassword, // ← Pasamos la nueva contraseña
                    'jcesarjuniorprada@ucundinamarca.edu.co'
                );

                if (notificationResult.success) {
                    successMessage += '<div class="success">✓ Notificación enviada con la nueva contraseña</div>';
                    console.log('🎉 Todo funcionó correctamente!');
                } else {
                    successMessage += `<div class="error">⚠️ ${notificationResult.message}</div>`;
                    console.log('⚠️ Notificación falló pero cambio de contraseña fue exitoso');
                }
                
                modalMessage.innerHTML = successMessage;
                
            } catch (emailError) {
                console.error('⚠️ Error en notificación:', emailError);
                successMessage += '<div class="error">⚠️ Error enviando notificación</div>';
                modalMessage.innerHTML = successMessage;
            }
            
            // Limpiar campos del formulario
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
            
            // Cerrar modal después de 4 segundos
            setTimeout(() => {
                closeModal();
            }, 4000);
            
        } else {
            throw new Error(data.message || 'Error al cambiar contraseña');
        }

    } catch (error) {
        console.error('❌ Error en cambio de contraseña:', error);
        modalMessage.innerHTML = `<div class="error">✗ ${error.message}</div>`;
    } finally {
        // Reestablecer botón
        changePasswordBtn.disabled = false;
        changePasswordBtn.textContent = 'Cambiar Contraseña';
    }
}

/**
 * =============================================
 * FUNCIONES DE MANEJO DEL MODAL
 * =============================================
 */

/**
 * Abre el modal para cambiar contraseña
 * y pre-llena el campo de usuario si está disponible
 */
function openChangePassword() {
    const username = document.getElementById('username').value;
    document.getElementById('passwordModal').style.display = 'flex';
    
    // Pre-llenar usuario si existe
    if (username) {
        document.getElementById('changePasswordUsername').value = username;
    }
}

/**
 * Cierra el modal y limpia los campos
 */
function closeModal() {
    document.getElementById('passwordModal').style.display = 'none';
    
    // Limpiar campos del modal
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('modalMessage').innerHTML = '';
}