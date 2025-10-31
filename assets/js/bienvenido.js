/**
 * =============================================
 * SCRIPT PARA PÁGINA DE BIENVENIDA
 * Cuenca Alta del Río Ubaté
 * 
 * Funcionalidades:
 * 1. Crea animación de hojas cayendo
 * 2. Maneja el ciclo infinito de las hojas
 * =============================================
 */

// Esperar a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', function() {
    
    /**
     * =============================================
     * CONFIGURACIÓN INICIAL - CREAR CONTENEDOR
     * =============================================
     */
    const leafContainer = document.createElement('div');
    leafContainer.className = 'leaf-container';
    document.body.appendChild(leafContainer);

    /**
     * =============================================
     * DEFINICIÓN DE TIPOS DE HOJAS DISPONIBLES
     * =============================================
     */
    const leafTypes = [
        'url("assets/img/hoja1.svg")',
        'url("assets/img/hoja2.svg")',
        'url("assets/img/hoja3.svg")'
    ];

    /**
     * =============================================
     * CREACIÓN DE HOJAS CON CONFIGURACIÓN ALEATORIA
     * =============================================
     */
    
    // Número total de hojas a crear
    const totalLeaves = 15;
    
    for (let i = 0; i < totalLeaves; i++) {
        // Espaciar la creación de hojas para efecto escalonado
        setTimeout(() => {
            createLeaf(leafContainer, leafTypes);
        }, i * 300);
    }

    /**
     * =============================================
     * FUNCIÓN PARA CREAR UNA HOJA INDIVIDUAL
     * =============================================
     * @param {HTMLElement} container - Contenedor donde se agregará la hoja
     * @param {Array} leafTypes - Array con URLs de imágenes de hojas
     */
    function createLeaf(container, leafTypes) {
        const leaf = document.createElement('div');
        leaf.className = 'leaf';
        
        // CONFIGURACIÓN ALEATORIA PARA CADA HOJA
        const size = Math.random() * 100 + 90;        // Tamaño: 90-190px
        const duration = Math.random() * 15 + 10;     // Duración animación: 10-25s
        const startX = Math.random() * 100;           // Posición horizontal inicial
        const rotation = Math.random() * 360;         // Rotación inicial
        const randomXMovement = (Math.random() * 200 - 100); // Movimiento horizontal: -100px a +100px
        
        // APLICAR ESTILOS A LA HOJA
        leaf.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            background-image: ${leafTypes[Math.floor(Math.random() * leafTypes.length)]};
            left: ${startX}%;
            top: -${size}px;
            --random-x: ${randomXMovement}px;
            animation-duration: ${duration}s;
            animation-delay: ${Math.random() * 5}s;
            transform: rotate(${rotation}deg);
        `;
        
        // AGREGAR HOJA AL CONTENEDOR
        container.appendChild(leaf);
        
        /**
         * =============================================
         * MANEJADOR PARA REINICIAR ANIMACIÓN
         * =============================================
         * Cuando una hoja completa su ciclo, se reinicia
         * desde una nueva posición aleatoria
         */
        leaf.addEventListener('animationiteration', () => {
            // Nueva posición aleatoria
            leaf.style.left = `${Math.random() * 100}%`;
            leaf.style.top = `-${size}px`;
            leaf.style.opacity = '0';
            leaf.style.setProperty('--random-x', `${(Math.random() * 200 - 100)}px`);
            
            // Forzar reflow del navegador para reiniciar animación
            void leaf.offsetWidth;
            
            // Restaurar opacidad
            leaf.style.opacity = '0.8';
        });
    }
});