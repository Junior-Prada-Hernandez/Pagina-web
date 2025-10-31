// Menú hamburguesa
function setupMenu() {
    const hamburguer = document.querySelector('.hamburguer');
    const navMenu = document.querySelector('.nav-menu');
    
    if (hamburguer && navMenu) {
        hamburguer.addEventListener('click', (e) => {
            e.stopPropagation();
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

// Efectos de hover para las tarjetas de creadores
function setupCreatorCards() {
    const creatorCards = document.querySelectorAll('.creator-card');
    
    creatorCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-10px)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });
}

// Inicialización cuando el DOM está cargado
document.addEventListener('DOMContentLoaded', function() {
    // Inicializar sistemas
    setupMenu();
    setupCreatorCards();
    
    // Efecto de scroll suave para enlaces internos
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});