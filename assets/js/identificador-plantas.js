// assets/js/identificador-plantas.js

const API_BASE = 'https://pagina-web-2p69.onrender.com';

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

// Variables globales
let currentPlantData = null;
let currentPlantImage = null;

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Identificador de plantas inicializado');
    initializeEventListeners();
});

// ========== EVENT LISTENERS ==========
function initializeEventListeners() {
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);
    
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
        
        // Validar tamaño (máximo 5MB)
        if (file.size > 5 * 1024 * 1024) {
            showError('La imagen es demasiado grande. Use imágenes menores a 5MB.');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImage.src = e.target.result;
            previewImage.style.display = 'block';
            currentPlantImage = e.target.result;
        };
        reader.readAsDataURL(file);
        
        identifyBtn.disabled = false;
        saveWithoutIdentifyBtn.disabled = false;
        
        resultContainer.style.display = 'none';
        errorMessage.style.display = 'none';
        successMessage.style.display = 'none';
        savePlantBtn.style.display = 'none';
    }
}

// ========== IDENTIFICACIÓN OPTIMIZADA ==========
async function identifyPlant() {
    if (!fileInput.files[0]) {
        showError('Por favor selecciona una imagen primero');
        return;
    }
    
    loading.style.display = 'flex';
    identifyBtn.disabled = true;
    saveWithoutIdentifyBtn.disabled = true;
    resultContainer.style.display = 'none';
    errorMessage.style.display = 'none';
    successMessage.style.display = 'none';
    savePlantBtn.style.display = 'none';
    
    try {
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        
        console.log('🔍 Enviando imagen para identificación...');
        
        const response = await fetch(`${API_BASE}/identify-plant`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Error al identificar la planta');
        }
        
        const plantIdData = await response.json();
        
        if (!plantIdData.results || plantIdData.results.length === 0) {
            throw new Error('No se pudo identificar la planta. Intenta con otra imagen más clara.');
        }
        
        const bestMatch = plantIdData.results[0];
        currentPlantData = bestMatch;
        const scientificName = bestMatch.species.scientificName || 'Planta desconocida';
        
        console.log('✅ Planta identificada:', scientificName);
        
        const description = await getPlantDescription(scientificName);
        displayResults(bestMatch, description);
        savePlantBtn.style.display = 'inline-flex';
        
    } catch (error) {
        console.error('❌ Error en identificación:', error);
        showError(error.message);
    } finally {
        loading.style.display = 'none';
        identifyBtn.disabled = false;
        saveWithoutIdentifyBtn.disabled = false;
    }
}

// Función para obtener descripción
async function getPlantDescription(plantName) {
    const plantKnowledge = {
        "Quercus humboldtii": "El roble andino (Quercus humboldtii) es una especie endémica de los Andes, común en la Cuenca Ubaté. Árbol de hasta 25 m de altura, con hojas coriáceas y bordes aserrados.",
        "Espeletia spp": "Conocidas como frailejones, son plantas emblemáticas de los páramos de la Cuenca Ubaté. Crecen lentamente y son fundamentales para la captación de agua.",
        "Polylepis spp": "Conocidos como árboles de papel, forman bosques en alturas extremas en la Cuenca Ubaté.",
        "default": `${plantName} - Especie vegetal presente en la Cuenca Alta del Río Ubaté. Contribuye a la biodiversidad local.`
    };
    
    for (const key in plantKnowledge) {
        if (plantName.toLowerCase().includes(key.toLowerCase())) {
            return plantKnowledge[key];
        }
    }
    
    return plantKnowledge['default'];
}

// ========== MOSTRAR RESULTADOS ==========
function displayResults(plantData, description) {
    const scientificName = plantData.species.scientificName || 'Planta desconocida';
    
    plantName.textContent = scientificName;
    probability.textContent = `Confianza: ${(plantData.score * 100).toFixed(1)}%`;
    
    if (plantData.species.commonNames && plantData.species.commonNames.length > 0) {
        commonNamesText.textContent = plantData.species.commonNames.join(', ');
    } else {
        commonNamesText.textContent = 'No se encontraron nombres comunes';
    }
    
    plantDetails.innerHTML = '';
    const descriptionElement = document.createElement('p');
    descriptionElement.textContent = description;
    descriptionElement.style.lineHeight = '1.6';
    plantDetails.appendChild(descriptionElement);
    
    displaySourceLinks(scientificName);
    resultContainer.style.display = 'block';
}

function displaySourceLinks(plantName) {
    sourceLinks.innerHTML = '';
    
    const sources = [
        {
            name: "Buscar en Google",
            url: `https://www.google.com/search?q=${encodeURIComponent(plantName + " planta")}`
        },
        {
            name: "iNaturalist", 
            url: `https://www.inaturalist.org/taxa/search?q=${encodeURIComponent(plantName)}`
        }
    ];
    
    sources.forEach(source => {
        const link = document.createElement('a');
        link.href = source.url;
        link.textContent = source.name;
        link.className = 'source-link';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        sourceLinks.appendChild(link);
    });
}

// ========== GUARDAR IMÁGENES ==========
async function saveWithoutIdentification() {
    if (!fileInput.files[0]) {
        showError('Por favor selecciona una imagen primero');
        return;
    }
    
    saveWithoutIdentifyBtn.disabled = true;
    saveWithoutIdentifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    
    try {
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('planta_id', 'planta-sin-identificar');
        formData.append('nombre_usuario', 'usuario_web');
        formData.append('description', 'Planta sin identificar - guardada desde la galería');
        
        console.log('💾 Guardando planta sin identificar...');
        
        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Error al guardar');
        }
        
        const result = await response.json();
        console.log('✅ Planta guardada:', result);
        
        showSuccess('¡Imagen guardada correctamente! Está pendiente de revisión.');
        
        setTimeout(() => {
            resetForm();
        }, 3000);
        
    } catch (error) {
        showError('Error al guardar la imagen: ' + error.message);
        console.error('Error al guardar:', error);
    } finally {
        saveWithoutIdentifyBtn.disabled = false;
        saveWithoutIdentifyBtn.innerHTML = '<i class="fas fa-save"></i> Guardar sin identificar';
    }
}

async function savePlant() {
    if (!currentPlantData || !currentPlantImage) {
        showError('No hay datos de planta para guardar');
        return;
    }
    
    savePlantBtn.disabled = true;
    savePlantBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    
    try {
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('planta_id', currentPlantData.species.scientificName || 'planta-desconocida');
        formData.append('nombre_usuario', 'usuario_web');
        formData.append('description', `Planta identificada: ${currentPlantData.species.scientificName}. Probabilidad: ${(currentPlantData.score * 100).toFixed(1)}%`);
        
        console.log('💾 Guardando planta identificada...');
        
        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Error al guardar');
        }
        
        const result = await response.json();
        console.log('✅ Planta identificada guardada:', result);
        
        showSuccess('¡Planta guardada correctamente! Está pendiente de revisión.');
        savePlantBtn.style.display = 'none';
        
        setTimeout(() => {
            resetForm();
        }, 3000);
        
    } catch (error) {
        showError('Error al guardar la planta: ' + error.message);
        console.error('Error al guardar:', error);
    } finally {
        savePlantBtn.disabled = false;
        savePlantBtn.innerHTML = '<i class="fas fa-save"></i> Guardar en Mis Plantas';
    }
}

// ========== FUNCIONES UTILITARIAS ==========
function showError(message) {
    errorText.textContent = message;
    errorMessage.style.display = 'flex';
    successMessage.style.display = 'none';
}

function showSuccess(message) {
    successText.textContent = message;
    successMessage.style.display = 'flex';
    errorMessage.style.display = 'none';
}

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
    
    identifyBtn.innerHTML = '<i class="fas fa-search"></i> Identificar Planta';
    saveWithoutIdentifyBtn.innerHTML = '<i class="fas fa-save"></i> Guardar sin identificar';
    savePlantBtn.innerHTML = '<i class="fas fa-save"></i> Guardar en Mis Plantas';
}
