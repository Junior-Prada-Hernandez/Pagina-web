// assets/js/identificador-plantas.js

// Variables para las API keys (se obtendrán del backend)
let PLANT_ID_API_KEY = null;
let DEEPSEEK_API_KEY = null;

// Variables globales para almacenar datos de la planta identificada
let currentPlantData = null;
let currentPlantImage = null;

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
    
    // Obtener las API keys del backend antes de inicializar
    await obtenerApiKeysDelBackend();
    
    initializeEventListeners();
    console.log('🚀 Identificador de plantas inicializado');
});

// ========== OBTENER API KEYS DEL BACKEND ==========
async function obtenerApiKeysDelBackend() {
    try {
        const response = await fetch('https://pagina-web-2p69.onrender.com/api/keys');
        
        if (!response.ok) {
            throw new Error('Error al obtener API keys del backend');
        }
        
        const keys = await response.json();
        
        // Asignar las API keys obtenidas del backend
        PLANT_ID_API_KEY = keys.PLANT_ID_API_KEY;
        DEEPSEEK_API_KEY = keys.DEEPSEEK_API_KEY;
        
        console.log('✅ API keys cargadas correctamente desde el backend');
        
    } catch (error) {
        console.error('❌ Error cargando API keys:', error);
        showError('Error de configuración. Por favor, recarga la página.');
    }
}

// ========== EVENT LISTENERS ==========
function initializeEventListeners() {
    // Eventos para el área de subida
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);
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
    
    // Verificar que las API keys estén cargadas
    if (!PLANT_ID_API_KEY) {
        showError('Error de configuración. Las API keys no están disponibles.');
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
        // 1. Identificar la planta con Plant.id API
        const plantIdResponse = await fetch('https://my-api.plantnet.org/v2/identify/all?api-key=' + PLANT_ID_API_KEY, {
            method: 'POST',
            body: (() => {
                const formData = new FormData();
                formData.append('images', fileInput.files[0]);
                formData.append('organs', 'auto');
                return formData;
            })()
        });
        
        const plantIdData = await plantIdResponse.json();
        
        if (!plantIdResponse.ok) {
            throw new Error(plantIdData.error || 'Error al identificar la planta');
        }
        
        if (!plantIdData.results || plantIdData.results.length === 0) {
            throw new Error('No se pudo identificar la planta. Intenta con otra imagen más clara.');
        }
        
        const bestMatch = plantIdData.results[0];
        currentPlantData = bestMatch;
        const scientificName = bestMatch.species.scientificName || 'Planta desconocida';
        
        // 2. Obtener descripción de la planta
        const description = await getPlantDescription(scientificName);
        
        // 3. Mostrar resultados
        displayResults(bestMatch, description);
        
        // Mostrar botón para guardar la planta
        savePlantBtn.style.display = 'inline-flex';
        
    } catch (error) {
        showError(error.message);
    } finally {
        loading.style.display = 'none';
        identifyBtn.disabled = false;
        saveWithoutIdentifyBtn.disabled = false;
    }
}

// Función para obtener descripción de la planta
async function getPlantDescription(plantName) {
    try {
        return simulateDeepSeekResponse(plantName);
    } catch (error) {
        console.error('Error al obtener descripción:', error);
        return await getDescriptionFromAlternativeSources(plantName);
    }
}

// Base de conocimiento simulada
function simulateDeepSeekResponse(plantName) {
    const plantKnowledge = {
        "Quercus humboldtii": "El roble andino (Quercus humboldtii) es una especie endémica de los Andes, común en la Cuenca Ubaté. Árbol de hasta 25 m de altura, con hojas coriáceas y bordes aserrados. Especie clave en los bosques altoandinos de la región.",
        "Espeletia spp": "Conocidas como frailejones, son plantas emblemáticas de los páramos de la Cuenca Ubaté. Crecen lentamente (1-2 cm/año) y son fundamentales para la captación de agua en la región.",
        "Polylepis spp": "Conocidos como árboles de papel, forman bosques en alturas extremas en la Cuenca Ubaté. Especies importantes para la conservación del ecosistema paramuno.",
        "default": `Descripción de ${plantName} en la Cuenca Ubaté. Esta planta presenta características típicas de la flora regional, con adaptaciones específicas al clima y altitud de la zona. Su presencia contribuye a la biodiversidad local.`
    };
    
    return plantKnowledge[plantName] || plantKnowledge['default'];
}

// Función alternativa para obtener descripción
async function getDescriptionFromAlternativeSources(plantName) {
    return `Información recopilada de registros botánicos de la Cuenca Ubaté sobre ${plantName}. Los datos incluyen características observadas en especímenes de la región.`;
}

// ========== MOSTRAR RESULTADOS ==========
function displayResults(plantData, description) {
    const scientificName = plantData.species.scientificName || 'Planta desconocida';
    
    // Mostrar nombre y probabilidad
    plantName.textContent = scientificName;
    probability.textContent = `Confianza: ${(plantData.score * 100).toFixed(1)}%`;
    
    // Mostrar nombres comunes
    if (plantData.species.commonNames) {
        commonNamesText.textContent = plantData.species.commonNames.join(', ');
    } else {
        commonNamesText.textContent = 'No se encontraron nombres comunes';
    }
    
    // Mostrar descripción
    plantDetails.innerHTML = '';
    const descriptionElement = document.createElement('p');
    descriptionElement.textContent = description;
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
        
        // Guardar en Supabase usando el endpoint corregido
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('planta_id', 'planta-sin-identificar');
        formData.append('nombre_usuario', 'usuario_web');
        formData.append('description', 'Planta sin identificar - guardada desde la galería');
        
        const response = await fetch('http://localhost:8002/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Error al guardar en Supabase');
        }
        
        const result = await response.json();
        
        // Mostrar mensaje de éxito
        showSuccess('¡Imagen guardada correctamente en Supabase! La imagen se ha almacenado exitosamente.');
        
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
        
        // 2. Guardar en Supabase usando el endpoint corregido
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('planta_id', currentPlantData.species.scientificName || 'planta-desconocida');
        formData.append('nombre_usuario', 'usuario_web');
        formData.append('description', `Planta identificada: ${currentPlantData.species.scientificName}`);
        
        const response = await fetch('http://localhost:8002/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Error al guardar en Supabase');
        }
        
        const result = await response.json();
        
        // Mostrar mensaje de éxito
        showSuccess('¡Planta guardada correctamente en Supabase! La imagen y los datos se han almacenado exitosamente.');
        
        // Ocultar botón de guardado para evitar duplicados
        savePlantBtn.style.display = 'none';
        
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
// Convertir archivo a Base64
function toBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

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
    identifyBtn.disabled = true;
    saveWithoutIdentifyBtn.disabled = true;
    resultContainer.style.display = 'none';
    errorMessage.style.display = 'none';
    successMessage.style.display = 'none';
    loading.style.display = 'none';
    savePlantBtn.style.display = 'none';
    currentPlantData = null;
    currentPlantImage = null;

}
