// Control de audio global
let currentAudio = null;
let carouselInterval;

// Función para cargar las 3 últimas imágenes en la galería principal
async function cargarUltimasImagenes() {
    const galeriaContainer = document.getElementById('imageGallery');
    
    // Mostrar loading
    galeriaContainer.innerHTML = `
        <div class="gallery-loading">
            <div class="spinner"></div>
            <p>Cargando imágenes...</p>
        </div>`;
    
    try {
        const response = await fetch('http://localhost:8002/list-images');
        const data = await response.json();
        
        if (data.images && data.images.length > 0) {
            // Filtrar solo imágenes publicadas y tomar las últimas 3
            const imagenesPublicadas = data.images.filter(img => img.estado === 'publicada');
            
            // Ordenar por fecha de creación descendente y tomar las primeras 3
            const ultimas3Imagenes = imagenesPublicadas
                .sort((a, b) => new Date(b.fecha_creacion || b.created_at) - new Date(a.fecha_creacion || a.created_at))
                .slice(0, 3);
            
            mostrarImagenesEnGaleria(ultimas3Imagenes);
        } else {
            mostrarImagenesPorDefecto();
        }
    } catch (error) {
        console.error('Error al cargar imágenes:', error);
        mostrarImagenesPorDefecto();
    }
}

// Función para cargar noticias desde las imágenes
async function cargarNoticias() {
    const noticiasContainer = document.getElementById('noticiasContainer');
    
    if (!noticiasContainer) return;
    
    // Mostrar loading
    noticiasContainer.innerHTML = `
        <div class="gallery-loading">
            <div class="spinner"></div>
            <p>Cargando noticias...</p>
        </div>`;
    
    try {
        const response = await fetch('http://localhost:8002/list-images');
        const data = await response.json();
        
        if (data.images && data.images.length > 0) {
            // Filtrar imágenes que están marcadas para noticias
            const noticias = data.images
                .filter(img => img.estado === 'publicada' && img.tipo_publicacion === 'noticias')
                .sort((a, b) => new Date(b.fecha_creacion || b.created_at) - new Date(a.fecha_creacion || a.created_at));
            
            mostrarNoticiasCarousel(noticias);
        } else {
            mostrarNoticiasPorDefecto();
        }
    } catch (error) {
        console.error('Error al cargar noticias:', error);
        mostrarNoticiasPorDefecto();
    }
}

// Función para mostrar noticias en carrusel
function mostrarNoticiasCarousel(noticias) {
    const noticiasContainer = document.getElementById('noticiasContainer');
    
    if (noticias.length === 0) {
        mostrarNoticiasPorDefecto();
        return;
    }
    
    noticiasContainer.innerHTML = `
        <div class="news-carousel">
            <div class="carousel-container">
                <button class="carousel-btn prev-btn">
                    <i class='bx bx-chevron-left'></i>
                </button>
                
                <div class="carousel-track">
                    ${noticias.map((noticia, index) => `
                        <div class="carousel-slide ${index === 0 ? 'active' : ''}">
                            <div class="noticia-card">
                                <div class="noticia-imagen">
                                    <img src="${noticia.url_imagen}" 
                                         alt="${noticia.planta_id || 'Noticia'}"
                                         onerror="this.src='https://via.placeholder.com/400x200/38A169/ffffff?text=Noticia'">
                                </div>
                                <div class="noticia-contenido">
                                    <h3>${noticia.planta_id || 'Nueva Planta Identificada'}</h3>
                                    <p class="noticia-fecha">${formatearFecha(noticia.fecha_creacion || noticia.created_at)}</p>
                                    <p class="noticia-descripcion">${noticia.description || 'Descubre esta nueva especie identificada en la cuenca.'}</p>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <button class="carousel-btn next-btn">
                    <i class='bx bx-chevron-right'></i>
                </button>
            </div>
            
            <div class="carousel-indicators">
                ${noticias.map((_, index) => `
                    <button class="indicator ${index === 0 ? 'active' : ''}" data-index="${index}"></button>
                `).join('')}
            </div>
        </div>
    `;
    
    // Inicializar carrusel de noticias
    setupNewsCarousel();
}

// Configurar carrusel de noticias
function setupNewsCarousel() {
    const track = document.querySelector('.carousel-track');
    const slides = document.querySelectorAll('.carousel-slide');
    const prevBtn = document.querySelector('.prev-btn');
    const nextBtn = document.querySelector('.next-btn');
    const indicators = document.querySelectorAll('.indicator');
    
    if (!track || slides.length === 0) return;
    
    let currentSlide = 0;
    const totalSlides = slides.length;
    
    // Función para mostrar slide específico
    function goToSlide(index) {
        // Remover clase active de todos los slides e indicadores
        slides.forEach(slide => slide.classList.remove('active'));
        indicators.forEach(indicator => indicator.classList.remove('active'));
        
        // Agregar clase active al slide e indicador actual
        slides[index].classList.add('active');
        indicators[index].classList.add('active');
        
        currentSlide = index;
    }
    
    // Función para siguiente slide
    function nextSlide() {
        const nextIndex = (currentSlide + 1) % totalSlides;
        goToSlide(nextIndex);
    }
    
    // Función para slide anterior
    function prevSlide() {
        const prevIndex = (currentSlide - 1 + totalSlides) % totalSlides;
        goToSlide(prevIndex);
    }
    
    // Event listeners para botones
    if (nextBtn) nextBtn.addEventListener('click', nextSlide);
    if (prevBtn) prevBtn.addEventListener('click', prevSlide);
    
    // Event listeners para indicadores
    indicators.forEach((indicator, index) => {
        indicator.addEventListener('click', () => goToSlide(index));
    });
    
    // Carrusel automático
    clearInterval(carouselInterval);
    carouselInterval = setInterval(nextSlide, 5000);
    
    // Pausar carrusel al hacer hover
    const carousel = document.querySelector('.news-carousel');
    if (carousel) {
        carousel.addEventListener('mouseenter', () => {
            clearInterval(carouselInterval);
        });
        
        carousel.addEventListener('mouseleave', () => {
            carouselInterval = setInterval(nextSlide, 5000);
        });
    }
}

// Función para formatear fecha
function formatearFecha(fechaString) {
    const fecha = new Date(fechaString);
    return fecha.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Función para mostrar noticias por defecto
function mostrarNoticiasPorDefecto() {
    const noticiasContainer = document.getElementById('noticiasContainer');
    noticiasContainer.innerHTML = `
        <div class="no-news">
            <p>No hay noticias disponibles en este momento.</p>
            <p>Pronto podrás ver aquí las últimas novedades de la cuenca.</p>
        </div>
    `;
}

// Función para mostrar las imágenes en la galería
function mostrarImagenesEnGaleria(imagenes) {
    const galeriaContainer = document.getElementById('imageGallery');
    
    if (imagenes.length === 0) {
        mostrarImagenesPorDefecto();
        return;
    }
    
    galeriaContainer.innerHTML = imagenes.map(imagen => `
        <div class="img-gallery">
            <img src="${imagen.url_imagen}" 
                 alt="${imagen.planta_id || 'Planta identificada'}"
                 onerror="this.src='https://via.placeholder.com/400x250/38A169/ffffff?text=Imagen+no+disponible'">
            <div class="image-info">
                <h3>${imagen.planta_id || 'Planta sin nombre'}</h3>
                <p>${imagen.description || 'Descripción no disponible.'}</p>
            </div>
        </div>
    `).join('');
    
    // Re-inicializar la galería después de cargar las imágenes
    setupGallery();
}

// Función para mostrar imágenes por defecto si no hay imágenes publicadas
function mostrarImagenesPorDefecto() {
    const galeriaContainer = document.getElementById('imageGallery');
    galeriaContainer.innerHTML = `
        <div class="no-images">
            <p>No hay imágenes publicadas aún.</p>
            <p>Pronto podrás ver aquí las últimas plantas identificadas.</p>
        </div>
    `;
}

// Galería de imágenes
function setupGallery() {
    const imagenes = document.querySelectorAll('.img-gallery');
    const imagenLight = document.querySelector('.imagen-light');
    const closeLightbox = document.querySelector('.close');
    
    imagenes.forEach(imagen => {
        imagen.addEventListener('click', () => {
            const img = imagen.querySelector('img');
            const title = imagen.querySelector('h3')?.textContent || 'Planta identificada';
            const description = imagen.querySelector('p')?.textContent || 'Descripción no disponible.';
            
            showImage(img.getAttribute('src'), title, description);
        });
    });
    
    // Cerrar lightbox al hacer click en la X o fuera de la imagen
    if (closeLightbox) {
        closeLightbox.addEventListener('click', () => {
            imagenLight.classList.remove('show');
        });
    }
    
    // Cerrar lightbox al hacer click fuera de la imagen
    imagenLight.addEventListener('click', (e) => {
        if (e.target === imagenLight) {
            imagenLight.classList.remove('show');
        }
    });
    
    function showImage(imagen, title, description) {
        const agregarImagen = imagenLight.querySelector('.agregar-imagen');
        const imageTitle = imagenLight.querySelector('.image-title');
        const imageDescription = imagenLight.querySelector('.image-description');
        
        if (agregarImagen) agregarImagen.src = imagen;
        if (imageTitle) imageTitle.textContent = title;
        if (imageDescription) imageDescription.textContent = description;
        
        imagenLight.classList.add('show');
    }
}

// Menú hamburguesa - CORREGIDO
function setupMenu() {
    const hamburguer = document.querySelector('.hamburguer');
    const navMenu = document.querySelector('.nav-menu');
    
    if (hamburguer && navMenu) {
        hamburguer.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevenir que el click se propague
            navMenu.classList.toggle('spread');
        });
        
        // Cerrar menú al hacer click en cualquier enlace del menú
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('spread');
            });
        });
        
        // Cerrar menú al hacer click fuera de él
        document.addEventListener('click', (e) => {
            if (navMenu.classList.contains('spread') && 
                !navMenu.contains(e.target) && 
                e.target !== hamburguer) {
                navMenu.classList.remove('spread');
            }
        });
        
        // Prevenir que el click en el menú lo cierre
        navMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
}

// Control de audio
function setupAudioPlayers() {
    document.querySelectorAll('.audio-player').forEach(player => {
        const playIcon = player.querySelector('.bx-play-circle');
        const pauseIcon = player.querySelector('.bx-pause-circle');
        const audio = new Audio(player.getAttribute('data-audio'));
        
        if (pauseIcon) pauseIcon.style.display = 'none';
        
        player.addEventListener('click', function() {
            // Pausar audio actual si hay otro reproduciéndose
            if (currentAudio && currentAudio !== audio) {
                currentAudio.pause();
                const currentPlayer = currentAudio.playerElement;
                if (currentPlayer) {
                    const currentPlayIcon = currentPlayer.querySelector('.bx-play-circle');
                    const currentPauseIcon = currentPlayer.querySelector('.bx-pause-circle');
                    if (currentPlayIcon) currentPlayIcon.style.display = 'inline';
                    if (currentPauseIcon) currentPauseIcon.style.display = 'none';
                }
            }
            
            // Reproducir o pausar
            if (audio.paused) {
                audio.play();
                if (playIcon) playIcon.style.display = 'none';
                if (pauseIcon) pauseIcon.style.display = 'inline';
                currentAudio = audio;
                audio.playerElement = player;
            } else {
                audio.pause();
                if (playIcon) playIcon.style.display = 'inline';
                if (pauseIcon) pauseIcon.style.display = 'none';
                currentAudio = null;
            }
        });
        
        audio.addEventListener('ended', function() {
            if (playIcon) playIcon.style.display = 'inline';
            if (pauseIcon) pauseIcon.style.display = 'none';
            currentAudio = null;
        });
    });
}

// Carrusel automático del banner
function setupCarousel() {
    const carouselItems = document.querySelectorAll('.carousel-item');
    let currentItem = 0;
    
    function showNextItem() {
        if (carouselItems.length === 0) return;
        
        carouselItems[currentItem].classList.remove('active');
        currentItem = (currentItem + 1) % carouselItems.length;
        carouselItems[currentItem].classList.add('active');
    }
    
    // Iniciar carrusel
    if (carouselItems.length > 0) {
        carouselItems[0].classList.add('active');
        setInterval(showNextItem, 5000);
    }
}

// Inicialización cuando el DOM está cargado
document.addEventListener('DOMContentLoaded', function() {
    // Inicializar sistemas
    setupGallery();
    setupMenu();
    setupAudioPlayers();
    setupCarousel();
    
    // Cargar las últimas imágenes
    cargarUltimasImagenes();
    
    // Cargar noticias
    cargarNoticias();
});

// Limpiar intervalos cuando la página se cierre
window.addEventListener('beforeunload', () => {
    clearInterval(carouselInterval);
});