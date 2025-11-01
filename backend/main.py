from typing import Union, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
import os
from dotenv import load_dotenv
from datetime import datetime
import uuid
import requests
from io import BytesIO
from PIL import Image
import logging

# =============================================================================
# CONFIGURACIÓN INICIAL
# =============================================================================

load_dotenv()
app = FastAPI(title="Cuenca Ubate API", version="1.0.0")

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURACIÓN CORS
# =============================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# CONFIGURACIÓN SUPABASE
# =============================================================================

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
BUCKET_NAME = "images"

logger.info("🔧 Configurando Supabase...")
supabase = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        result = supabase.table("imagenes").select("*").limit(1).execute()
        logger.info("✅ Conexión a Supabase establecida correctamente")
    except Exception as e:
        logger.error(f"❌ Error conectando a Supabase: {e}")
        supabase = None
else:
    logger.warning("⚠️  Supabase no configurado")

# =============================================================================
# COMPRESIÓN INTELIGENTE DE IMÁGENES (TRANSPARENTE)
# =============================================================================

class ImageCompressor:
    """Compresor de imágenes inteligente y transparente"""
    
    @staticmethod
    def should_compress(image_size: int, max_size: int = 2 * 1024 * 1024) -> bool:
        """Determina si una imagen necesita compresión"""
        return image_size > max_size
    
    @staticmethod
    def compress_image(
        image_data: bytes, 
        max_dimension: int = 1200,
        quality: int = 85,
        format: str = 'JPEG'
    ) -> tuple[bytes, str, dict]:
        """
        Comprime una imagen de forma inteligente manteniendo la calidad
        
        Args:
            image_data: Bytes de la imagen original
            max_dimension: Dimensión máxima (ancho o alto)
            quality: Calidad de compresión (1-100)
            format: Formato de salida
            
        Returns:
            tuple: (imagen_comprimida, content_type, info_compresion)
        """
        try:
            # Abrir imagen original
            original_image = Image.open(BytesIO(image_data))
            original_format = original_image.format
            original_size = len(image_data)
            original_width, original_height = original_image.size
            
            logger.info(f"📐 Imagen original: {original_width}x{original_height} - {original_size//1024}KB")
            
            # Si la imagen es pequeña, no comprimir
            if original_size <= 1 * 1024 * 1024:  # Menos de 1MB
                logger.info("🟢 Imagen pequeña, sin compresión necesaria")
                return image_data, f"image/{original_format.lower()}", {
                    "compressed": False,
                    "original_size_kb": original_size // 1024,
                    "compressed_size_kb": original_size // 1024,
                    "reduction": "0%",
                    "quality": "original"
                }
            
            # Convertir a RGB si es necesario (para JPEG)
            if format == 'JPEG' and original_image.mode in ('RGBA', 'P'):
                image_rgb = original_image.convert('RGB')
            else:
                image_rgb = original_image
            
            # Calcular nuevas dimensiones manteniendo aspecto
            if original_width > max_dimension or original_height > max_dimension:
                if original_width > original_height:
                    new_width = max_dimension
                    new_height = int((original_height / original_width) * max_dimension)
                else:
                    new_height = max_dimension
                    new_width = int((original_width / original_height) * max_dimension)
                
                # Redimensionar suavemente
                resized_image = image_rgb.resize((new_width, new_height), Image.Resampling.LANCZOS)
                logger.info(f"🔄 Redimensionado a: {new_width}x{new_height}")
            else:
                resized_image = image_rgb
                new_width, new_height = original_width, original_height
            
            # Guardar imagen comprimida
            output_buffer = BytesIO()
            resized_image.save(
                output_buffer, 
                format=format, 
                quality=quality,
                optimize=True
            )
            
            compressed_data = output_buffer.getvalue()
            compressed_size = len(compressed_data)
            
            # Calcular estadísticas de compresión
            reduction = ((original_size - compressed_size) / original_size) * 100
            
            logger.info(f"✅ Compresión: {original_size//1024}KB → {compressed_size//1024}KB (-{reduction:.1f}%)")
            
            return compressed_data, f"image/{format.lower()}", {
                "compressed": True,
                "original_size_kb": original_size // 1024,
                "compressed_size_kb": compressed_size // 1024,
                "reduction": f"{reduction:.1f}%",
                "quality": f"{quality}%",
                "original_dimensions": f"{original_width}x{original_height}",
                "compressed_dimensions": f"{new_width}x{new_height}",
                "format_original": original_format,
                "format_compressed": format
            }
            
        except Exception as e:
            logger.error(f"❌ Error en compresión: {e}")
            # Si falla la compresión, devolver original
            return image_data, "image/jpeg", {
                "compressed": False,
                "error": str(e)
            }

# =============================================================================
# ENDPOINT MEJORADO CON COMPRESIÓN TRANSPARENTE
# =============================================================================

@app.post("/identify-plant")
async def identify_plant(file: UploadFile = File(...)):
    """
    🔍 Identificación de plantas CON COMPRESIÓN AUTOMÁTICA
    - Comprime imágenes grandes automáticamente
    - Mantiene calidad suficiente para identificación
    - El usuario no nota la compresión
    """
    try:
        logger.info(f"🔍 Iniciando identificación: {file.filename}")
        
        # 1. VALIDAR TIPO DE ARCHIVO
        allowed_types = ['image/jpeg', 'image/png', 'image/webp']
        if file.content_type not in allowed_types:
            raise HTTPException(400, "Solo se permiten imágenes JPEG, PNG o WebP")
        
        # 2. LEER ARCHIVO ORIGINAL
        original_content = await file.read()
        original_size = len(original_content)
        
        logger.info(f"📁 Imagen original: {original_size//1024}KB - {file.content_type}")
        
        # 3. COMPRESIÓN INTELIGENTE Y TRANSPARENTE
        compressor = ImageCompressor()
        
        # Comprimir imagen (se decide automáticamente si es necesario)
        compressed_content, content_type, compression_info = compressor.compress_image(
            original_content,
            max_dimension=1600,  # Máximo 1600px en la dimensión más grande
            quality=80,          # 80% de calidad (balance perfecto)
            format='JPEG'        # Convertir todo a JPEG para mejor compresión
        )
        
        compressed_size = len(compressed_content)
        
        logger.info(f"📦 Después de compresión: {compressed_size//1024}KB")
        logger.info(f"📊 Info compresión: {compression_info}")
        
        # 4. VERIFICAR API KEY
        api_key = os.getenv('PLANT_ID_API_KEY')
        if not api_key:
            logger.error("❌ PLANT_ID_API_KEY no configurada")
            raise HTTPException(500, "Servicio de identificación no disponible")
        
        # 5. PREPARAR Y ENVIAR SOLICITUD CON IMAGEN COMPRIMIDA
        files = {
            'images': (
                f"compressed_{file.filename}",  # Nombre diferente pero el usuario no lo ve
                compressed_content, 
                content_type
            )
        }
        data = {'organs': 'auto'}
        
        plantnet_url = f'https://my-api.plantnet.org/v2/identify/all?api-key={api_key}'
        logger.info("🌐 Enviando imagen comprimida a PlantNet...")
        
        # 6. TIMEOUT REDUCIDO (gracias a la compresión)
        timeout = 45  # 45 segundos en lugar de 90
        
        start_time = datetime.now()
        response = requests.post(plantnet_url, files=files, data=data, timeout=timeout)
        request_time = (datetime.now() - start_time).total_seconds()
        
        logger.info(f"📥 Respuesta recibida en {request_time:.1f}s")
        
        if response.status_code != 200:
            error_detail = "Error desconocido"
            try:
                error_data = response.json()
                error_detail = error_data.get('error', error_detail)
            except:
                error_detail = response.text[:100]
                
            logger.error(f"❌ Error PlantNet: {error_detail}")
            
            if response.status_code == 413:
                raise HTTPException(400, "Imagen demasiado grande incluso después de compresión")
            elif response.status_code == 429:
                raise HTTPException(429, "Demasiadas solicitudes. Espera unos minutos.")
            else:
                raise HTTPException(response.status_code, f"Error del servicio: {error_detail}")
        
        # 7. PROCESAR RESULTADOS
        plant_data = response.json()
        results = plant_data.get('results', [])
        
        logger.info(f"✅ Identificación exitosa: {len(results)} resultados")
        
        if not results:
            return {
                "success": True,
                "message": "No se pudo identificar la planta con certeza. Intenta con una imagen más clara y enfocada.",
                "results": [],
                "compression_info": compression_info,  # 🔥 INFO DE COMPRESIÓN
                "performance": {
                    "original_size_kb": original_size // 1024,
                    "processed_size_kb": compressed_size // 1024,
                    "processing_time": f"{request_time:.1f}s",
                    "timeout_used": f"{timeout}s"
                }
            }
        
        # 8. FORMATEAR RESPUESTA
        best_match = results[0]
        species = best_match.get('species', {})
        
        scientific_name = species.get('scientificName', 'Desconocida')
        common_names = species.get('commonNames', [])
        common_name = common_names[0] if common_names else 'No disponible'
        probability = best_match.get('score', 0)
        
        logger.info(f"🌿 Identificada: {scientific_name} - {probability*100:.1f}% de probabilidad")
        
        return {
            "success": True,
            "message": f"¡Planta identificada! {len(results)} resultados encontrados",
            "results": results[:3],
            "best_match": best_match,
            "identified_plant": {
                "scientific_name": scientific_name,
                "common_name": common_name,
                "probability": probability,
                "confidence": f"{probability*100:.1f}%"
            },
            "compression_info": compression_info,  # 🔥 INFO DE COMPRESIÓN (opcional mostrar al usuario)
            "performance": {
                "original_size_kb": original_size // 1024,
                "processed_size_kb": compressed_size // 1024,
                "processing_time": f"{request_time:.1f}s",
                "time_saved": "significativo" if compression_info.get('compressed') else "mínimo"
            }
        }
        
    except requests.exceptions.Timeout:
        logger.error("❌ Timeout en PlantNet (45s)")
        raise HTTPException(
            504, 
            "La identificación está tomando demasiado tiempo. Intenta con una imagen más pequeña o espera e intenta nuevamente."
        )
    except requests.exceptions.ConnectionError:
        logger.error("❌ Error de conexión con PlantNet")
        raise HTTPException(503, "Error de conexión. El servicio puede estar temporalmente no disponible.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error interno: {str(e)}")
        raise HTTPException(500, f"Error interno del servidor: {str(e)}")

# =============================================================================
# ENDPOINT RÁPIDO CON COMPRESIÓN MÁS AGRESIVA
# =============================================================================

@app.post("/identify-fast")
async def identify_fast(file: UploadFile = File(...)):
    """
    🚀 Versión RÁPIDA con compresión más agresiva
    - Compresión máxima para velocidad
    - Ideal para imágenes muy grandes
    """
    try:
        logger.info(f"🚀 Iniciando identificación RÁPIDA")
        
        original_content = await file.read()
        
        # Compresión más agresiva para modo rápido
        compressor = ImageCompressor()
        compressed_content, content_type, compression_info = compressor.compress_image(
            original_content,
            max_dimension=800,   # Más pequeño para mayor velocidad
            quality=70,          # Calidad más baja
            format='JPEG'
        )
        
        logger.info(f"⚡ Compresión rápida: {compression_info}")
        
        api_key = os.getenv('PLANT_ID_API_KEY')
        if not api_key:
            raise HTTPException(500, "Servicio no disponible")
        
        files = {'images': (f"fast_{file.filename}", compressed_content, content_type)}
        data = {'organs': 'auto'}
        
        plantnet_url = f'https://my-api.plantnet.org/v2/identify/all?api-key={api_key}'
        
        # Timeout muy corto para modo rápido
        response = requests.post(plantnet_url, files=files, data=data, timeout=30)
        
        if response.status_code != 200:
            raise HTTPException(response.status_code, "Error en identificación rápida")
        
        plant_data = response.json()
        results = plant_data.get('results', [])
        
        return {
            "success": True,
            "message": "¡Identificación rápida exitosa!" if results else "No identificado en modo rápido",
            "results": results[:2],
            "best_match": results[0] if results else None,
            "compression_info": compression_info,
            "mode": "fast"
        }
        
    except requests.exceptions.Timeout:
        raise HTTPException(504, "Timeout en modo rápido")
    except Exception as e:
        raise HTTPException(500, f"Error rápido: {str(e)}")

# =============================================================================
# ENDPOINTS ADICIONALES (MANTENER LOS QUE YA TENÍAS)
# =============================================================================

@app.get("/")
async def read_root():
    return {"message": "API Cuenca Ubate con compresión automática", "status": "online"}

@app.get("/health")
async def health_check():
    return {
        "status": "healthy", 
        "timestamp": datetime.now().isoformat(),
        "features": ["compresión_automática", "identificación_plantas"],
        "database": "connected" if supabase else "disconnected"
    }

@app.get("/api/keys")
async def get_api_keys():
    return {
        "PLANT_ID_API_KEY": "✅ Configurada" if os.getenv('PLANT_ID_API_KEY') else "❌ Faltante",
        "DEEPSEEK_API_KEY": "✅ Configurada" if os.getenv('DEEPSEEK_API_KEY') else "❌ Faltante"
    }

# =============================================================================
# INICIO DEL SERVIDOR
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", 8000))
    
    print("\n" + "="*60)
    print("🚀 CUENCA UBATÉ - CON COMPRESIÓN AUTOMÁTICA")
    print("="*60)
    print("🖼️  Características:")
    print("   • Compresión inteligente de imágenes")
    print("   • Reducción automática de tamaño")
    print("   • Mantenimiento de calidad para identificación")
    print("   • Completamente transparente para el usuario")
    print(f"🌐 URL: http://0.0.0.0:{port}")
    print("🔍 Identificar Plantas: POST /identify-plant")
    print("🚀 Modo Rápido: POST /identify-fast")
    print("❤️  Health Check: GET /health")
    print("="*60)
    
    uvicorn.run(app, host="0.0.0.0", port=port)
