// assets/js/identificador-plantas.js

const API_BASE = 'https://pagina-web-2p69.onrender.com';

// 🔥 API KEYS DIRECTAS PARA RENDER
const PLANT_ID_API_KEY = '2b10aLv6ZUTN4hwDcJ4I3dmu';
const DEEPSEEK_API_KEY = 'sk-93a2f73354c14faf8121c0bab5935598';

// Variables globales para almacenar datos de la planta identificada
let currentPlantData = null;
let currentPlantImage = null;

// Configuración de timeouts
const BACKEND_TIMEOUT = 10000; // 10 segundos para tu backend
const PLANTNET_TIMEOUT = 15000; // 15 segundos para PlantNet directo

// Fuentes confiables para consultar información
const TRUSTED_SOURCES = [
    {
        name: "Buscar en navegador",
        url: (plantName) => `https://www.google.com/search?q=${encodeURIComponent(plantName + " planta")}&tbm=isch`
    },
    {
        name: "iNaturalist",
        url: (plantName) => `https://www.inaturalist.org/taxa/search?q=${encodeURIComponent(plantName)}`
    },
    {
        name: "GBIF",
        url: (plantName) => `https://www.gbif.org/species/search?q=${encodeURIComponent(plantName)}`
    }
];

// Elementos del DOM
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const previewImage = document.getElementById('previewImage');
const identifyBtn = document.getElementById('identifyBtn');
const saveWithoutIdentifyBtn = document.getElementById('saveWithoutIdentifyBtn');
const loading = document.getElementById('loading');
const resultContainer = document.getElementById('resultContainer');
const plantName = document.getElementById('plantName');
const probability = document.getElementById('probability');
const commonNamesText = document.getElementById('commonNamesText');
const plantDetails = document.getElementById('plantDetails');
const sourceLinks = document.getElementById('sourceLinks');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');
const successMessage = document.getElementById('successMessage');
const successText = document.getElementById('successText');
const savePlantBtn = document.getElementById('savePlantBtn');

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', async function() {
    localStorage.clear();
    
    console.log('🚀 Identificador de plantas inicializado para Render');
    console.log('🔑 PlantNet API Key configurada:', PLANT_ID_API_KEY ? '✅' : '❌');
    console.log('🤖 DeepSeek API Key configurada:', DEEPSEEK_API_KEY ? '✅' : '❌');
    
    initializeEventListeners();
});

// ========== EVENT LISTENERS ==========
function initializeEventListeners() {
    // Eventos para el área de subida
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);
    
    // Eventos para botones
    identifyBtn.addEventListener('click', identifyPlant);
    saveWithoutIdentifyBtn.addEventListener('click', saveWithoutIdentification);
    savePlantBtn.addEventListener('click', savePlant);
}

function handleDragOver(e) {
    e.preventDefault();
    uploadArea.style.backgroundColor = 'rgba(56, 161, 105, 0.1)';
}

function handleDragLeave() {
    uploadArea.style.backgroundColor = 'white';
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.style.backgroundColor = 'white';
    
    if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        handleFileSelect();
    }
}

function handleFileSelect() {
    if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        
        // Mostrar vista previa
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImage.src = e.target.result;
            previewImage.style.display = 'block';
            currentPlantImage = e.target.result;
        };
        reader.readAsDataURL(file);
        
        // Habilitar botones de identificación y guardado
        identifyBtn.disabled = false;
        saveWithoutIdentifyBtn.disabled = false;
        
        // Ocultar resultados anteriores
        resultContainer.style.display = 'none';
        errorMessage.style.display = 'none';
        successMessage.style.display = 'none';
        savePlantBtn.style.display = 'none';
    }
}

// ========== FUNCIÓN PRINCIPAL DE IDENTIFICACIÓN ==========
async function identifyPlant() {
    if (!fileInput.files[0]) {
        showError('Por favor selecciona una imagen primero');
        return;
    }
    
    // Mostrar indicador de carga
    loading.style.display = 'flex';
    identifyBtn.disabled = true;
    saveWithoutIdentifyBtn.disabled = true;
    resultContainer.style.display = 'none';
    errorMessage.style.display = 'none';
    successMessage.style.display = 'none';
    savePlantBtn.style.display = 'none';
    
    try {
        console.log('🔍 Iniciando proceso de identificación...');
        
        // ✅ PRIMERO: Intentar con tu backend en Render (con timeout)
        try {
            await identifyWithBackend();
        } catch (backendError) {
            console.log('❌ Backend falló, intentando con PlantNet directo...');
            
            // ✅ SEGUNDO: Fallback a PlantNet API directa
            await identifyWithPlantNetDirect();
        }
        
    } catch (finalError) {
        console.error('❌ Error final en identificación:', finalError);
        showError('No se pudo identificar la planta. Error: ' + finalError.message);
    } finally {
        loading.style.display = 'none';
        identifyBtn.disabled = false;
        saveWithoutIdentifyBtn.disabled = false;
    }
}

// ✅ ESTRATEGIA 1: Usar tu backend en Render (con timeout)
async function identifyWithBackend() {
    return new Promise(async (resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Timeout: El backend tardó demasiado en responder'));
        }, BACKEND_TIMEOUT);
        
        try {
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            
            console.log('🔄 Intentando identificación con backend...');
            
            const response = await fetch(`${API_BASE}/identify-plant`, {
                method: 'POST',
                body: formData
            });
            
            clearTimeout(timeout);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Error del backend');
            }
            
            const plantIdData = await response.json();
            
            if (!plantIdData.results || plantIdData.results.length === 0) {
                throw new Error('No se pudo identificar la planta con el backend');
            }
            
            const bestMatch = plantIdData.results[0];
            currentPlantData = bestMatch;
            const scientificName = bestMatch.species.scientificName || 'Planta desconocida';
            
            console.log('✅ Backend exitoso. Planta identificada:', scientificName);
            
            // Obtener descripción y mostrar resultados
            const description = await getPlantDescription(scientificName);
            displayResults(bestMatch, description);
            savePlantBtn.style.display = 'inline-flex';
            
            resolve();
            
        } catch (error) {
            clearTimeout(timeout);
            reject(error);
        }
    });
}

// ✅ ESTRATEGIA 2: Identificación directa con PlantNet API
async function identifyWithPlantNetDirect() {
    return new Promise(async (resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Timeout: PlantNet API tardó demasiado en responder'));
        }, PLANTNET_TIMEOUT);
        
        try {
            const file = fileInput.files[0];
            const formData = new FormData();
            formData.append('images', file);
            formData.append('organs', 'auto');
            
            console.log('🔄 Identificación directa con PlantNet API...');
            
            const response = await fetch(`https://my-api.plantnet.org/v2/identify/all?api-key=${PLANT_ID_API_KEY}`, {
                method: 'POST',
                body: formData
            });
            
            clearTimeout(timeout);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error en PlantNet API');
            }
            
            const plantIdData = await response.json();
            
            if (!plantIdData.results || plantIdData.results.length === 0) {
                throw new Error('No se pudo identificar la planta con PlantNet API');
            }
            
            const bestMatch = plantIdData.results[0];
            currentPlantData = bestMatch;
            const scientificName = bestMatch.species.scientificName || 'Planta desconocida';
            
            console.log('✅ PlantNet directo exitoso. Planta identificada:', scientificName);
            
            // Obtener descripción y mostrar resultados
            const description = await getPlantDescription(scientificName);
            displayResults(bestMatch, description);
            savePlantBtn.style.display = 'inline-flex';
            
            resolve();
            
        } catch (error) {
            clearTimeout(timeout);
            reject(error);
        }
    });
}

// Función para obtener descripción de la planta
async function getPlantDescription(plantName) {
    try {
        // Intentar con DeepSeek API primero
        if (DEEPSEEK_API_KEY && plantName !== 'Planta desconocida') {
            console.log('🤖 Obteniendo descripción con DeepSeek...');
            return await getDescriptionFromDeepSeek(plantName);
        } else {
            console.log('📚 Usando base de conocimiento local...');
            return simulateDeepSeekResponse(plantName);
        }
    } catch (error) {
        console.error('Error al obtener descripción:', error);
        return simulateDeepSeekResponse(plantName);
    }
}

// Obtener descripción de DeepSeek API (con timeout)
async function getDescriptionFromDeepSeek(plantName) {
    return new Promise(async (resolve, reject) => {
        const timeout = setTimeout(() => {
            console.log('⏰ Timeout en DeepSeek, usando descripción local');
            resolve(simulateDeepSeekResponse(plantName));
        }, 8000);
        
        try {
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        {
                            role: 'system',
                            content: 'Eres un botánico experto especializado en la flora de la Cuenca Alta del Río Ubaté en Colombia. Proporciona descripciones concisas (150-200 palabras) con información relevante sobre plantas de esta región.'
                        },
                        {
                            role: 'user',
                            content: `Proporciona una descripción concisa (150-200 palabras) sobre la planta "${plantName}" enfocándote en su presencia en la Cuenca Alta del Río Ubaté, Colombia. Incluye características morfológicas, hábitat, importancia ecológica y cualquier dato específico de la región.`
                        }
                    ],
                    max_tokens: 500,
                    temperature: 0.7
                })
            });

            clearTimeout(timeout);
            
            if (!response.ok) {
                throw new Error('Error en DeepSeek API');
            }

            const data = await response.json();
            resolve(data.choices[0].message.content);
            
        } catch (error) {
            clearTimeout(timeout);
            console.error('Error con DeepSeek API:', error);
            resolve(simulateDeepSeekResponse(plantName));
        }
    });
}

// Base de conocimiento simulada (fallback)
function simulateDeepSeekResponse(plantName) {
    const plantKnowledge = {
        "Quercus humboldtii": "El roble andino (Quercus humboldtii) es una especie endémica de los Andes, común en la Cuenca Ubaté. Árbol de hasta 25 m de altura, con hojas coriáceas y bordes aserrados. Especie clave en los bosques altoandinos de la región, proporciona hábitat para fauna local y contribuye a la regulación hídrica.",
        "Espeletia spp": "Conocidas como frailejones, son plantas emblemáticas de los páramos de la Cuenca Ubaté. Crecen lentamente (1-2 cm/año) y son fundamentales para la captación de agua en la región. Sus hojas lanosas las protegen de las bajas temperaturas nocturnas.",
        "Polylepis spp": "Conocidos como árboles de papel, forman bosques en alturas extremas en la Cuenca Ubaté. Su corteza se desprende en láminas delgadas. Especies importantes para la conservación del ecosistema paramuno y refugio de aves endémicas.",
        "Weinmannia spp": "Arbustos o árboles pequeños comunes en los bosques de la Cuenca Ubaté. Hojas compuestas con bordes aserrados, importantes en la sucesión ecológica de la región.",
        "Baccharis spp": "Arbustos comunes en zonas perturbadas de la Cuenca Ubaté. Especies pioneras que ayudan en la recuperación de suelos degradados.",
        "Miconia spp": "Arbustos con hojas grandes y aterciopeladas, comunes en el sotobosque de la Cuenca Ubaté. Importantes para la fauna polinizadora local.",
        "default": `${plantName} - Especie vegetal presente en la Cuenca Alta del Río Ubaté. Esta planta presenta adaptaciones específicas al clima montañoso de la región, contribuyendo a la biodiversidad local y a los servicios ecosistémicos del área. Su conservación es importante para el equilibrio ecológico de la cuenca.`
    };
    
    // Buscar coincidencia parcial para nombres científicos similares
    for (const key in plantKnowledge) {
        if (plantName.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(plantName.toLowerCase())) {
            return plantKnowledge[key];
        }
    }
    
    return plantKnowledge['default'];
}

// ========== MOSTRAR RESULTADOS ==========
function displayResults(plantData, description) {
    const scientificName = plantData.species.scientificName || 'Planta desconocida';
    
    // Mostrar nombre y probabilidad
    plantName.textContent = scientificName;
    probability.textContent = `Confianza: ${(plantData.score * 100).toFixed(1)}%`;
    
    // Mostrar nombres comunes
    if (plantData.species.commonNames && plantData.species.commonNames.length > 0) {
        commonNamesText.textContent = plantData.species.commonNames.join(', ');
    } else {
        commonNamesText.textContent = 'No se encontraron nombres comunes';
    }
    
    // Mostrar descripción
    plantDetails.innerHTML = '';
    const descriptionElement = document.createElement('p');
    descriptionElement.textContent = description;
    descriptionElement.style.lineHeight = '1.6';
    plantDetails.appendChild(descriptionElement);
    
    // Mostrar fuentes confiables
    displaySourceLinks(scientificName);
    
    // Mostrar resultados
    resultContainer.style.display = 'block';
}

// Mostrar enlaces a fuentes de información
function displaySourceLinks(plantName) {
    sourceLinks.innerHTML = '';
    
    TRUSTED_SOURCES.forEach(source => {
        const link = document.createElement('a');
        link.href = source.url(plantName);
        link.textContent = source.name;
        link.className = 'source-link';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        sourceLinks.appendChild(link);
    });
}

// ========== FUNCIÓN PARA GUARDAR PLANTA SIN IDENTIFICAR ==========
async function saveWithoutIdentification() {
    if (!fileInput.files[0]) {
        showError('Por favor selecciona una imagen primero');
        return;
    }
    
    // Deshabilitar botón mientras se guarda
    saveWithoutIdentifyBtn.disabled = true;
    saveWithoutIdentifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    
    try {
        // Guardar en localStorage para acceso inmediato
        const savedPlants = JSON.parse(localStorage.getItem('savedPlants')) || [];
        
        const plantToSave = {
            id: Date.now(),
            name: 'Planta sin identificar',
            commonName: 'Sin identificar',
            image: currentPlantImage,
            dateSaved: new Date().toISOString(),
            probability: 0,
            sources: [],
            status: 'pending'
        };
        
        savedPlants.unshift(plantToSave);
        localStorage.setItem('savedPlants', JSON.stringify(savedPlants));
        
        // ✅ Guardar en Supabase usando tu backend en Render
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('planta_id', 'planta-sin-identificar');
        formData.append('nombre_usuario', 'usuario_web');
        formData.append('description', 'Planta sin identificar - guardada desde la galería');
        
        console.log('💾 Guardando planta sin identificar en Supabase...');
        
        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Error al guardar en Supabase');
        }
        
        const result = await response.json();
        console.log('✅ Planta guardada en Supabase:', result);
        
        // Mostrar mensaje de éxito
        showSuccess('¡Imagen guardada correctamente en Supabase! La imagen se ha almacenado exitosamente y está pendiente de revisión.');
        
        // Limpiar formulario después de guardar
        setTimeout(() => {
            resetForm();
        }, 3000);
        
    } catch (error) {
        showError('Error al guardar la imagen: ' + error.message);
        console.error('Error al guardar:', error);
    } finally {
        // Restaurar estado del botón
        saveWithoutIdentifyBtn.disabled = false;
        saveWithoutIdentifyBtn.innerHTML = '<i class="fas fa-save"></i> Guardar sin identificar';
    }
}

// ========== FUNCIÓN PARA GUARDAR PLANTA EN MIS PLANTAS ==========
async function savePlant() {
    if (!currentPlantData || !currentPlantImage) {
        showError('No hay datos de planta para guardar');
        return;
    }
    
    // Deshabilitar botón mientras se guarda
    savePlantBtn.disabled = true;
    savePlantBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    
    try {
        // 1. Guardar en localStorage para acceso inmediato
        const savedPlants = JSON.parse(localStorage.getItem('savedPlants')) || [];
        
        const plantToSave = {
            id: Date.now(),
            name: currentPlantData.species.scientificName,
            commonName: currentPlantData.species.commonNames?.[0] || 'Sin nombre común',
            image: currentPlantImage,
            dateSaved: new Date().toISOString(),
            probability: currentPlantData.score,
            sources: TRUSTED_SOURCES.map(source => ({
                name: source.name,
                url: source.url(currentPlantData.species.scientificName)
            })),
            status: 'pending'
        };
        
        savedPlants.unshift(plantToSave);
        localStorage.setItem('savedPlants', JSON.stringify(savedPlants));
        
        // ✅ Guardar en Supabase usando tu backend en Render
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('planta_id', currentPlantData.species.scientificName || 'planta-desconocida');
        formData.append('nombre_usuario', 'usuario_web');
        formData.append('description', `Planta identificada: ${currentPlantData.species.scientificName}. Probabilidad: ${(currentPlantData.score * 100).toFixed(1)}%`);
        
        console.log('💾 Guardando planta identificada en Supabase...');
        
        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Error al guardar en Supabase');
        }
        
        const result = await response.json();
        console.log('✅ Planta identificada guardada en Supabase:', result);
        
        // Mostrar mensaje de éxito
        showSuccess('¡Planta guardada correctamente en Supabase! La imagen y los datos se han almacenado exitosamente y están pendientes de revisión.');
        
        // Ocultar botón de guardado para evitar duplicados
        savePlantBtn.style.display = 'none';
        
        // Limpiar formulario después de guardar
        setTimeout(() => {
            resetForm();
        }, 3000);
        
    } catch (error) {
        showError('Error al guardar la planta: ' + error.message);
        console.error('Error al guardar:', error);
    } finally {
        // Restaurar estado del botón
        savePlantBtn.disabled = false;
        savePlantBtn.innerHTML = '<i class="fas fa-save"></i> Guardar en Mis Plantas';
    }
}

// ========== FUNCIONES UTILITARIAS ==========
// Mostrar mensaje de error
function showError(message) {
    errorText.textContent = message;
    errorMessage.style.display = 'flex';
    successMessage.style.display = 'none';
}

// Mostrar mensaje de éxito
function showSuccess(message) {
    successText.textContent = message;
    successMessage.style.display = 'flex';
    errorMessage.style.display = 'none';
}

// Reiniciar el formulario
function resetForm() {
    fileInput.value = '';
    previewImage.style.display = 'none';
    previewImage.src = '';
    identifyBtn.disabled = true;
    saveWithoutIdentifyBtn.disabled = true;
    resultContainer.style.display = 'none';
    errorMessage.style.display = 'none';
    successMessage.style.display = 'none';
    loading.style.display = 'none';
    savePlantBtn.style.display = 'none';
    currentPlantData = null;
    currentPlantImage = null;
    
    // Restaurar texto original de botones
    identifyBtn.innerHTML = '<i class="fas fa-search"></i> Identificar Planta';
    saveWithoutIdentifyBtn.innerHTML = '<i class="fas fa-save"></i> Guardar sin identificar';
    savePlantBtn.innerHTML = '<i class="fas fa-save"></i> Guardar en Mis Plantas';
}
