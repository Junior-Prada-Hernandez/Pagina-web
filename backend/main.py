from typing import Union, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from supabase import create_client, Client
import os
from dotenv import load_dotenv
from datetime import datetime
import uuid
import requests
from passlib.context import CryptContext
from datetime import timedelta
from jose import JWTError, jwt
from pathlib import Path
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
# CONFIGURACIÓN AUTENTICACIÓN
# =============================================================================

SECRET_KEY = os.getenv("SECRET_KEY", "clave-temporal")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def authenticate_user(username: str, password: str) -> Optional[dict]:
    try:
        response = supabase.table("usuarios_administradores").select("*").eq("nombre de usuario", username).execute()
        if hasattr(response, 'error') and response.error:
            return None
        if not response.data:
            return None
        user = response.data[0]
        if not verify_password(password, user["contraseña_hash"]):
            return None
        return user
    except Exception as e:
        logger.error(f"Error en autenticación: {e}")
        return None

# =============================================================================
# SERVIR ARCHIVOS ESTÁTICOS
# =============================================================================

BASE_DIR = Path(__file__).parent.parent
logger.info(f"📁 Directorio base: {BASE_DIR}")

app.mount("/assets", StaticFiles(directory=BASE_DIR / "assets"), name="assets")

@app.get("/")
async def read_root():
    return FileResponse(BASE_DIR / "index.html")

@app.get("/{page_name}")
async def serve_page(page_name: str):
    valid_pages = {
        "identificador-plantas", "galeria_completa", "plantas_guardadas",
        "suscripcion", "contactos", "login", "bienvenido", "mapa", "Mapa"
    }
    
    if page_name in valid_pages:
        file_path = BASE_DIR / f"{page_name}.html"
    else:
        file_path = BASE_DIR / page_name
    
    if file_path.exists():
        return FileResponse(file_path)
    
    return FileResponse(BASE_DIR / "index.html")

# =============================================================================
# COMPRESIÓN INTELIGENTE DE IMÁGENES
# =============================================================================

class ImageCompressor:
    """Compresor de imágenes inteligente y transparente"""
    
    @staticmethod
    def compress_image(
        image_data: bytes, 
        max_dimension: int = 1600,
        quality: int = 80,
        format: str = 'JPEG'
    ) -> tuple[bytes, str, dict]:
        """
        Comprime una imagen de forma inteligente manteniendo la calidad
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
                    "reduction": "0%"
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
                "compressed_dimensions": f"{new_width}x{new_height}"
            }
            
        except Exception as e:
            logger.error(f"❌ Error en compresión: {e}")
            # Si falla la compresión, devolver original
            return image_data, "image/jpeg", {
                "compressed": False,
                "error": str(e)
            }

# =============================================================================
# ENDPOINTS BÁSICOS
# =============================================================================

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy", 
        "timestamp": datetime.now().isoformat(),
        "service": "Cuenca Ubate API",
        "database": "connected" if supabase else "disconnected"
    }

# =============================================================================
# IDENTIFICACIÓN DE PLANTAS CON COMPRESIÓN AUTOMÁTICA
# =============================================================================

@app.post("/identify-plant")
async def identify_plant(file: UploadFile = File(...)):
    """
    🔍 Identificación CON COMPRESIÓN AUTOMÁTICA
    - Comprime imágenes grandes automáticamente
    - Timeout reducido gracias a compresión
    - Completamente transparente para el usuario
    """
    try:
        logger.info(f"🔍 Iniciando identificación: {file.filename}")
        
        # 1. VALIDACIÓN SOLO DE TIPO (NO DE TAMAÑO)
        allowed_types = ['image/jpeg', 'image/png', 'image/webp']
        if file.content_type not in allowed_types:
            raise HTTPException(400, "Solo se permiten imágenes JPEG, PNG o WebP")
        
        # 2. LEER ARCHIVO ORIGINAL
        original_content = await file.read()
        original_size = len(original_content)
        
        logger.info(f"📁 Imagen original: {original_size//1024}KB - {file.content_type}")
        
        # 3. COMPRESIÓN INTELIGENTE Y TRANSPARENTE
        compressor = ImageCompressor()
        compressed_content, content_type, compression_info = compressor.compress_image(original_content)
        
        compressed_size = len(compressed_content)
        
        logger.info(f"📦 Después de compresión: {compressed_size//1024}KB")
        logger.info(f"📊 Info compresión: {compression_info}")
        
        # 4. VERIFICAR API KEY
        api_key = os.getenv('PLANT_ID_API_KEY')
        if not api_key:
            logger.error("❌ PLANT_ID_API_KEY no configurada")
            raise HTTPException(500, "Servicio de identificación no disponible")
        
        logger.info(f"✅ API Key encontrada")
        
        # 5. PREPARAR Y ENVIAR SOLICITUD CON IMAGEN COMPRIMIDA
        files = {'images': (file.filename, compressed_content, content_type)}
        data = {'organs': 'auto'}
        
        plantnet_url = f'https://my-api.plantnet.org/v2/identify/all?api-key={api_key}'
        logger.info(f"🌐 Enviando a PlantNet...")
        
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
                raise HTTPException(400, "Imagen demasiado grande para el servicio PlantNet")
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
                "compression_info": compression_info,
                "performance": {
                    "original_size_kb": original_size // 1024,
                    "processed_size_kb": compressed_size // 1024,
                    "processing_time": f"{request_time:.1f}s",
                    "platform": "Render con compresión"
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
            "compression_info": compression_info,
            "performance": {
                "original_size_kb": original_size // 1024,
                "processed_size_kb": compressed_size // 1024,
                "processing_time": f"{request_time:.1f}s",
                "platform": "Render con compresión"
            }
        }
        
    except requests.exceptions.Timeout:
        logger.error("❌ Timeout en PlantNet (45s)")
        raise HTTPException(
            504, 
            "La identificación está tomando demasiado tiempo. Esto puede pasar con imágenes muy grandes. Puedes intentar con una imagen más pequeña o esperar e intentar nuevamente."
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
    - Para cuando quieras resultados más rápidos
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
        
        files = {'images': (file.filename, compressed_content, content_type)}
        data = {'organs': 'auto'}
        
        plantnet_url = f'https://my-api.plantnet.org/v2/identify/all?api-key={api_key}'
        
        # Timeout más corto para modo rápido
        response = requests.post(plantnet_url, files=files, data=data, timeout=30)
        
        if response.status_code != 200:
            raise HTTPException(response.status_code, "Error en identificación rápida")
        
        plant_data = response.json()
        results = plant_data.get('results', [])
        
        if not results:
            return {
                "success": True,
                "message": "No identificado en modo rápido",
                "results": [],
                "mode": "fast"
            }
        
        return {
            "success": True,
            "message": "¡Identificación rápida exitosa!",
            "results": results[:2],
            "best_match": results[0],
            "mode": "fast"
        }
        
    except requests.exceptions.Timeout:
        raise HTTPException(504, "Timeout en modo rápido")
    except Exception as e:
        raise HTTPException(500, f"Error rápido: {str(e)}")

# =============================================================================
# MANTENER TODOS LOS ENDPOINTS ORIGINALES (EXACTAMENTE IGUAL)
# =============================================================================

@app.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    planta_id: str = Form("planta-desconocida"),
    nombre_usuario: str = Form("usuario_web"),
    description: str = Form(""),
    lat: Optional[float] = Form(None),
    lng: Optional[float] = Form(None)
):
    if not supabase:
        raise HTTPException(500, "Error de conexión a Supabase")
    
    try:
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        file_path = f"public/{unique_filename}"
        
        file_content = await file.read()
        
        upload_response = supabase.storage.from_(BUCKET_NAME).upload(
            path=file_path,
            file=file_content
        )
        
        if hasattr(upload_response, 'error') and upload_response.error:
            raise Exception(f"Error subiendo imagen: {upload_response.error.message}")
        
        public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(file_path)
        
        image_data = {
            "filename": unique_filename,
            "nombre_usuario": nombre_usuario,
            "planta_id": planta_id,
            "url_imagen": public_url,
            "estado": "pendiente",
            "fecha_subida": datetime.now().isoformat(),
            "lat": lat,
            "lng": lng,
            "tipo_publicacion": "galeria"
        }
        
        if description:
            image_data["description"] = description
        
        db_response = supabase.table("imagenes").insert(image_data).execute()
        
        if hasattr(db_response, 'error') and db_response.error:
            error_msg = str(db_response.error)
            if "description" in error_msg:
                image_data.pop("description", None)
                db_response = supabase.table("imagenes").insert(image_data).execute()
            elif "lat" in error_msg or "lng" in error_msg:
                image_data.pop("lat", None)
                image_data.pop("lng", None)
                db_response = supabase.table("imagenes").insert(image_data).execute()
            elif "tipo_publicacion" in error_msg:
                image_data.pop("tipo_publicacion", None)
                db_response = supabase.table("imagenes").insert(image_data).execute()
                
            if hasattr(db_response, 'error') and db_response.error:
                raise Exception(f"Error guardando datos: {db_response.error.message}")
        
        return {
            "success": True,
            "message": f"Imagen guardada para planta {planta_id}",
            "planta_id": planta_id,
            "filename": unique_filename,
            "public_url": public_url
        }
        
    except Exception as e:
        raise HTTPException(500, f"Error: {str(e)}")

@app.get("/list-images")
async def list_images():
    if not supabase:
        raise HTTPException(500, "Error de conexión a Supabase")
    
    try:
        response = supabase.table("imagenes").select("*").execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Error obteniendo imágenes: {response.error.message}")
        
        return {
            "count": len(response.data),
            "images": response.data
        }
        
    except Exception as e:
        raise HTTPException(500, f"Error obteniendo imágenes: {str(e)}")

@app.get("/map-images")
async def get_map_images():
    if not supabase:
        raise HTTPException(500, "Supabase no configurado")
    
    try:
        response = supabase.table("imagenes").select("*").execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Error obteniendo imágenes: {response.error.message}")
        
        imagenes_con_coordenadas = [
            img for img in response.data 
            if img.get('lat') is not None and 
               img.get('lng') is not None and 
               img.get('estado') == 'publicada'
        ]
        
        return {
            "count": len(imagenes_con_coordenadas),
            "images": imagenes_con_coordenadas
        }
        
    except Exception as e:
        raise HTTPException(500, f"Error obteniendo imágenes: {str(e)}")

@app.get("/imagenes-noticias")
async def get_imagenes_noticias():
    if not supabase:
        raise HTTPException(500, "Supabase no configurado")
    
    try:
        response = supabase.table("imagenes").select("*").execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Error obteniendo imágenes: {response.error.message}")
        
        imagenes_noticias = [
            img for img in response.data 
            if img.get('tipo_publicacion') == 'noticias' and 
               img.get('estado') == 'publicada'
        ]
        
        return {
            "count": len(imagenes_noticias),
            "images": imagenes_noticias
        }
        
    except Exception as e:
        raise HTTPException(500, f"Error obteniendo imágenes noticias: {str(e)}")

@app.get("/api/keys")
async def get_api_keys():
    return {
        "PLANT_ID_API_KEY": os.getenv("PLANT_ID_API_KEY"),
        "DEEPSEEK_API_KEY": os.getenv("DEEPSEEK_API_KEY")
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
    print("🔍 Identificar Plantas: /identify-plant")
    print("🚀 Modo Rápido: /identify-fast")
    print("📊 Health Check: /api/health")
    print("="*60)
    
    uvicorn.run(app, host="0.0.0.0", port=port)
