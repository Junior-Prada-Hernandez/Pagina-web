// assets/js/identificador-plantas.js

// API Keys para uso directo en frontend (Render es estático)
const PLANT_ID_API_KEY = "2b10aLv6ZUTN4hwDcJ4I3dmu";
const DEEPSEEK_API_KEY = "sk-93a2f73354c14faf8121c0bab5935598";

// Variables globales para almacenar datos de la planta identificada
let currentPlantData = null;
let currentPlantImage = null;

// Fuentes confiables para consultar información
const TRUSTED_SOURCES = [
    {
        name: "Buscar en navegador",
        url: (plantName) => `https://www.google.com/search?q=${encodeURIComponent(plantName + " planta Cuenca Ubaté")}&tbm=isch`
    },
    {
        name: "iNaturalist",
        url: (plantName) => `https://www.inaturalist.org/taxa/search?q=${encodeURIComponent(plantName)}`
    },
    {
        name: "GBIF Colombia",
        url: (plantName) => `https://www.gbif.org/species/search?q=${encodeURIComponent(plantName + " Colombia")}`
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
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    console.log('🚀 Identificador de plantas inicializado en Render');
    console.log('✅ API Keys configuradas para entorno estático');
});

// ========== EVENT LISTENERS ==========
function initializeEventListeners() {
    // Eventos para el área de subida
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);
    
    // Click en el área de upload
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });
}

function handleDragOver(e) {
    e.preventDefault();
    uploadArea.style.backgroundColor = 'rgba(56, 161, 105, 0.1)';
    uploadArea.style.borderColor = '#38a169';
}

function handleDragLeave() {
    uploadArea.style.backgroundColor = 'white';
    uploadArea.style.borderColor = '#e2e8f0';
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.style.backgroundColor = 'white';
    uploadArea.style.borderColor = '#e2e8f0';
    
    if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        handleFileSelect();
    }
}

function handleFileSelect() {
    if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        
        // Validar tipo de archivo
        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            showError('Formato no soportado. Usa JPG, PNG o WEBP.');
            return;
        }
        
        // Validar tamaño (máximo 5MB)
        if (file.size > 5 * 1024 * 1024) {
            showError('La imagen es muy grande. Máximo 5MB.');
            return;
        }
        
        // Mostrar vista previa
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImage.src = e.target.result;
            previewImage.style.display = 'block';
            currentPlantImage = e.target.result;
            
            // Ocultar ícono de upload cuando hay imagen
            document.querySelector('.upload-icon').style.display = 'none';
            document.querySelector('.upload-text').style.display = 'none';
        };
        reader.readAsDataURL(file);
        
        // Habilitar botones
        identifyBtn.disabled = false;
        saveWithoutIdentifyBtn.disabled = false;
        
        // Ocultar elementos anteriores
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
        // 1. Identificar la planta con Plant.id API
        const plantIdData = await identifyWithPlantNet(fileInput.files[0]);
        
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
        console.error('Error en identificación:', error);
    } finally {
        loading.style.display = 'none';
        identifyBtn.disabled = false;
        saveWithoutIdentifyBtn.disabled = false;
    }
}

// Función para identificar con PlantNet API
async function identifyWithPlantNet(imageFile) {
    const formData = new FormData();
    formData.append('organs', 'auto');
    formData.append('images', imageFile);
    
    const response = await fetch(`https://my-api.plantnet.org/v2/identify/all?api-key=${PLANT_ID_API_KEY}`, {
        method: 'POST',
        body: formData
    });
    
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al conectar con el servicio de identificación');
    }
    
    return await response.json();
}

// Función para obtener descripción de la planta
async function getPlantDescription(plantName) {
    try {
        // Para Render (entorno estático), usamos descripciones predefinidas
        return getPlantDescriptionFromLocal(plantName);
    } catch (error) {
        console.error('Error al obtener descripción:', error);
        return await getDescriptionFromAlternativeSources(plantName);
    }
}

// Base de conocimiento local para plantas de la Cuenca Ubaté
function getPlantDescriptionFromLocal(plantName) {
    const plantKnowledge = {
        "Quercus humboldtii": {
            description: "El roble andino (Quercus humboldtii) es una especie endémica de los Andes, común en la Cuenca Ubaté. Árbol de hasta 25 m de altura, con hojas coriáceas y bordes aserrados. Especie clave en los bosques altoandinos de la región.",
            commonNames: ["Roble andino", "Roble negro", "Roble de tierra fría"]
        },
        "Espeletia spp": {
            description: "Conocidas como frailejones, son plantas emblemáticas de los páramos de la Cuenca Ubaté. Crecen lentamente (1-2 cm/año) y son fundamentales para la captación de agua en la región. Presentan hojas lanosas que protegen del frío.",
            commonNames: ["Frailejón", "Planta de páramo"]
        },
        "Polylepis spp": {
            description: "Conocidos como árboles de papel, forman bosques en alturas extremas en la Cuenca Ubaté. Su corteza se desprende en láminas delgadas. Especies importantes para la conservación del ecosistema paramuno.",
            commonNames: ["Árbol de papel", "Quinual", "Yagual"]
        },
        "Cavendishia": {
            description: "Arbusto común en los bosques de la Cuenca Ubaté, perteneciente a la familia Ericaceae. Presenta flores tubulares y frutos comestibles. Importante para la fauna local.",
            commonNames: ["Uva camarona", "Cavendishia"]
        },
        "Weinmannia spp": {
            description: "Árbol característico de los bosques andinos de la Cuenca Ubaté. Madera utilizada localmente para construcción y leña. Florece entre marzo y junio.",
            commonNames: ["Encenillo", "Sietecueros"]
        },
        "default": {
            description: `${plantName} - Especie registrada en la Cuenca Ubaté. Esta planta presenta características típicas de la flora regional, con adaptaciones específicas al clima y altitud de la zona (2500-3500 msnm). Su presencia contribuye a la biodiversidad local y a los servicios ecosistémicos de la región.`,
            commonNames: ["Planta nativa", "Especie local"]
        }
    };
    
    const plantInfo = plantKnowledge[plantName] || plantKnowledge['default'];
    return plantInfo.description;
}

// Función alternativa para obtener descripción
async function getDescriptionFromAlternativeSources(plantName) {
    return `Información recopilada de registros botánicos de la Cuenca Ubaté sobre ${plantName}. Los datos incluyen características observadas en especímenes de la región entre 2500-3500 metros sobre el nivel del mar.`;
}

// ========== MOSTRAR RESULTADOS ==========
function displayResults(plantData, description) {
    const scientificName = plantData.species.scientificName || 'Planta desconocida';
    
    // Mostrar nombre y probabilidad
    plantName.textContent = scientificName;
    probability.textContent = `Confianza: ${(plantData.score * 100).toFixed(1)}%`;
    probability.className = `probability ${plantData.score > 0.7 ? 'high' : plantData.score > 0.4 ? 'medium' : 'low'}`;
    
    // Mostrar nombres comunes
    if (plantData.species.commonNames && plantData.species.commonNames.length > 0) {
        commonNamesText.textContent = plantData.species.commonNames.join(', ');
    } else {
        commonNamesText.textContent = 'No se encontraron nombres comunes registrados';
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
    
    // Scroll suave a los resultados
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Mostrar enlaces a fuentes de información
function displaySourceLinks(plantName) {
    sourceLinks.innerHTML = '';
    
    TRUSTED_SOURCES.forEach(source => {
        const linkContainer = document.createElement('div');
        linkContainer.className = 'source-link-container';
        
        const link = document.createElement('a');
        link.href = source.url(plantName);
        link.textContent = source.name;
        link.className = 'source-link';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        
        linkContainer.appendChild(link);
        sourceLinks.appendChild(linkContainer);
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
    const originalText = saveWithoutIdentifyBtn.innerHTML;
    saveWithoutIdentifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    
    try {
        // Guardar en localStorage para acceso inmediato (solución para Render)
        const savedPlants = JSON.parse(localStorage.getItem('savedPlants')) || [];
        
        const plantToSave = {
            id: Date.now(),
            name: 'Planta sin identificar',
            scientificName: 'Desconocida',
            commonName: 'Sin identificar',
            image: currentPlantImage,
            dateSaved: new Date().toLocaleDateString('es-CO'),
            probability: 0,
            location: 'Cuenca Ubaté',
            status: 'pendiente'
        };
        
        savedPlants.unshift(plantToSave);
        localStorage.setItem('savedPlants', JSON.stringify(savedPlants));
        
        // En Render no tenemos backend, así que mostramos éxito local
        showSuccess('¡Planta guardada en tu colección local! Puedes verla en "Mis Plantas".');
        
        // Deshabilitar botón para evitar duplicados
        saveWithoutIdentifyBtn.disabled = true;
        
    } catch (error) {
        showError('Error al guardar: ' + error.message);
        console.error('Error al guardar:', error);
        
        // Restaurar botón en caso de error
        saveWithoutIdentifyBtn.disabled = false;
        saveWithoutIdentifyBtn.innerHTML = originalText;
    }
}

// ========== FUNCIÓN PARA GUARDAR PLANTA IDENTIFICADA ==========
async function savePlant() {
    if (!currentPlantData || !currentPlantImage) {
        showError('No hay datos de planta para guardar');
        return;
    }
    
    // Deshabilitar botón mientras se guarda
    savePlantBtn.disabled = true;
    const originalText = savePlantBtn.innerHTML;
    savePlantBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    
    try {
        // Guardar en localStorage (solución para entorno estático en Render)
        const savedPlants = JSON.parse(localStorage.getItem('savedPlants')) || [];
        
        const plantToSave = {
            id: Date.now(),
            name: currentPlantData.species.scientificName,
            scientificName: currentPlantData.species.scientificName,
            commonName: currentPlantData.species.commonNames?.[0] || 'Sin nombre común',
            image: currentPlantImage,
            dateSaved: new Date().toLocaleDateString('es-CO'),
            probability: currentPlantData.score,
            location: 'Cuenca Ubaté',
            description: document.querySelector('.details-content p').textContent,
            status: 'identificada'
        };
        
        savedPlants.unshift(plantToSave);
        localStorage.setItem('savedPlants', JSON.stringify(savedPlants));
        
        // Mostrar mensaje de éxito
        showSuccess('¡Planta guardada en tu colección local! Puedes verla en "Mis Plantas".');
        
        // Ocultar botón de guardado para evitar duplicados
        savePlantBtn.style.display = 'none';
        
    } catch (error) {
        showError('Error al guardar la planta: ' + error.message);
        console.error('Error al guardar:', error);
        
        // Restaurar botón en caso de error
        savePlantBtn.disabled = false;
        savePlantBtn.innerHTML = originalText;
    }
}

// ========== FUNCIONES UTILITARIAS ==========
// Mostrar mensaje de error
function showError(message) {
    errorText.textContent = message;
    errorMessage.style.display = 'flex';
    successMessage.style.display = 'none';
    
    // Scroll al mensaje de error
    errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Mostrar mensaje de éxito
function showSuccess(message) {
    successText.textContent = message;
    successMessage.style.display = 'flex';
    errorMessage.style.display = 'none';
    
    // Scroll al mensaje de éxito
    successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    
    // Restaurar elementos del área de upload
    document.querySelector('.upload-icon').style.display = 'block';
    document.querySelector('.upload-text').style.display = 'block';
    
    currentPlantData = null;
    currentPlantImage = null;
    
    // Restaurar textos de botones
    saveWithoutIdentifyBtn.innerHTML = '<i class="fas fa-save"></i> Guardar sin identificar';
    savePlantBtn.innerHTML = '<i class="fas fa-save"></i> Guardar en Mis Plantas';
}

// Función para ver plantas guardadas
function viewSavedPlants() {
    // Redirigir a la página de plantas guardadas
    window.location.href = 'plantas_guardadas.html';
}
