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
import io
from PIL import Image

# =============================================================================
# CONFIGURACIÓN INICIAL
# =============================================================================

load_dotenv()
app = FastAPI(title="Cuenca Ubate API", version="1.0.0")

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

print("🔧 Configurando Supabase...")
supabase = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        result = supabase.table("imagenes").select("*").limit(1).execute()
        print("✅ Conexión a Supabase establecida correctamente")
    except Exception as e:
        print(f"❌ Error conectando a Supabase: {e}")
        supabase = None
else:
    print("⚠️  Supabase no configurado")

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
        print(f"Error en autenticación: {e}")
        return None

# =============================================================================
# FUNCIONES DE COMPRESIÓN DE IMÁGENES
# =============================================================================

def compress_image(image_data: bytes, max_size: int = 500000, max_dimension: int = 1200) -> bytes:
    """
    Comprime una imagen para reducir su tamaño
    """
    try:
        # Abrir imagen
        image = Image.open(io.BytesIO(image_data))
        
        # Redimensionar si es muy grande
        if image.size[0] > max_dimension or image.size[1] > max_dimension:
            image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
        
        # Convertir a RGB si es PNG con transparencia
        if image.mode in ('RGBA', 'LA'):
            background = Image.new('RGB', image.size, (255, 255, 255))
            background.paste(image, mask=image.split()[-1])
            image = background
        
        # Guardar comprimido
        output = io.BytesIO()
        
        # Determinar calidad basada en el tamaño objetivo
        quality = 85
        image.save(output, format='JPEG', quality=quality, optimize=True)
        compressed_data = output.getvalue()
        
        # Si sigue siendo muy grande, reducir calidad
        while len(compressed_data) > max_size and quality > 40:
            quality -= 10
            output = io.BytesIO()
            image.save(output, format='JPEG', quality=quality, optimize=True)
            compressed_data = output.getvalue()
        
        original_size = len(image_data)
        compressed_size = len(compressed_data)
        reduction = ((original_size - compressed_size) / original_size) * 100
        
        print(f"📊 Compresión: {original_size//1024}KB → {compressed_size//1024}KB ({reduction:.1f}% reducción)")
        
        return compressed_data
        
    except Exception as e:
        print(f"⚠️  Error en compresión, usando imagen original: {e}")
        return image_data

# =============================================================================
# SERVIR ARCHIVOS ESTÁTICOS - CORREGIDO PARA RENDER
# =============================================================================

# En Render, main.py está en /backend/, los archivos HTML están en la raíz
BASE_DIR = Path(__file__).parent.parent  # Sube un nivel para llegar a la raíz

print(f"📁 Directorio base detectado: {BASE_DIR}")

# Servir archivos estáticos (CSS, JS, imágenes)
app.mount("/assets", StaticFiles(directory=BASE_DIR / "assets"), name="assets")

# Servir páginas HTML
@app.get("/")
async def read_root():
    html_path = BASE_DIR / "index.html"
    print(f"📄 Sirviendo index.html desde: {html_path}")
    if html_path.exists():
        return FileResponse(html_path)
    else:
        raise HTTPException(status_code=404, detail="index.html no encontrado")

@app.get("/{page_name}")
async def serve_page(page_name: str):
    # Lista de páginas válidas (sin .html)
    valid_pages = {
        "identificador-plantas", "galeria_completa", "plantas_guardadas",
        "suscripcion", "contactos", "login", "bienvenido", "mapa", "Mapa"
    }
    
    if page_name in valid_pages:
        file_path = BASE_DIR / f"{page_name}.html"
        print(f"📄 Sirviendo {page_name}.html desde: {file_path}")
    else:
        file_path = BASE_DIR / page_name
    
    if file_path.exists():
        return FileResponse(file_path)
    
    # Si no encuentra, devolver el index
    return FileResponse(BASE_DIR / "index.html")

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
# IDENTIFICACIÓN DE PLANTAS - OPTIMIZADO PARA RENDER
# =============================================================================

@app.post("/identify-plant")
async def identify_plant(file: UploadFile = File(...)):
    """
    🔍 Identificación de plantas OPTIMIZADA para Render
    - Compresión automática de imágenes
    - Timeout extendido
    - Manejo robusto de errores
    """
    try:
        print(f"🔍 Iniciando identificación OPTIMIZADA: {file.filename}")
        
        # 1. VALIDAR TIPO DE ARCHIVO
        allowed_content_types = ['image/jpeg', 'image/png', 'image/webp']
        if file.content_type not in allowed_content_types:
            raise HTTPException(
                status_code=400, 
                detail=f"Tipo de archivo no soportado. Use: JPEG, PNG o WebP"
            )
        
        # 2. LEER Y COMPRIMIR IMAGEN
        original_content = await file.read()
        original_size = len(original_content)
        print(f"📁 Tamaño original: {original_size//1024}KB")
        
        if original_size > 5 * 1024 * 1024:  # 5MB
            raise HTTPException(
                status_code=400,
                detail="Imagen demasiado grande (máximo 5MB). Por favor usa una imagen más pequeña."
            )
        
        # 3. COMPRIMIR IMAGEN
        compressed_content = compress_image(original_content)
        compressed_size = len(compressed_content)
        
        print(f"📊 Después de compresión: {compressed_size//1024}KB")
        
        # 4. OBTENER API KEY
        api_key = os.getenv('PLANT_ID_API_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="Servicio de identificación no disponible")
        
        # 5. PREPARAR Y ENVIAR SOLICITUD
        files = {'images': (file.filename, compressed_content, 'image/jpeg')}  # Siempre JPEG después de compresión
        data = {'organs': 'auto'}
        
        plantnet_url = f'https://my-api.plantnet.org/v2/identify/all?api-key={api_key}'
        print(f"🌐 Enviando a PlantNet (comprimido: {compressed_size//1024}KB)...")
        
        # 6. TIMEOUT EXTENDIDO PARA RENDER
        response = requests.post(plantnet_url, files=files, data=data, timeout=75)  # 75 segundos
        
        print(f"📥 Respuesta PlantNet: {response.status_code}")
        
        if response.status_code != 200:
            error_info = response.text[:200] if response.text else "Sin detalles"
            print(f"❌ Error PlantNet: {error_info}")
            
            if response.status_code == 429:
                raise HTTPException(status_code=429, detail="Límite de solicitudes excedido. Intenta en unos minutos.")
            elif response.status_code == 413:
                raise HTTPException(status_code=413, detail="Imagen demasiado grande después de compresión.")
            else:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Error del servicio de identificación: {error_info}"
                )
        
        # 7. PROCESAR RESULTADOS
        plant_data = response.json()
        results_count = len(plant_data.get('results', []))
        
        print(f"✅ Identificación exitosa: {results_count} resultados")
        
        if results_count == 0:
            return {
                "success": True,
                "message": "No se pudo identificar la planta con certeza. Intenta con una imagen más clara o desde otro ángulo.",
                "results": [],
                "optimization": {
                    "original_size_kb": original_size // 1024,
                    "compressed_size_kb": compressed_size // 1024,
                    "reduction_percent": round(((original_size - compressed_size) / original_size) * 100, 1)
                }
            }
        
        # 8. FORMATEAR MEJOR RESPUESTA
        best_match = plant_data['results'][0]
        species = best_match.get('species', {})
        
        scientific_name = species.get('scientificName', 'Desconocida')
        common_names = species.get('commonNames', [])
        common_name = common_names[0] if common_names else 'No disponible'
        probability = best_match.get('score', 0)
        
        print(f"🌿 Identificada: {scientific_name} ({common_name}) - {probability*100:.1f}%")
        
        return {
            "success": True,
            "message": f"¡Planta identificada! {results_count} resultados encontrados",
            "results": plant_data['results'],
            "best_match": best_match,
            "identified_plant": {
                "scientific_name": scientific_name,
                "common_name": common_name,
                "probability": probability,
                "confidence": f"{probability*100:.1f}%"
            },
            "optimization": {
                "original_size_kb": original_size // 1024,
                "compressed_size_kb": compressed_size // 1024,
                "reduction_percent": round(((original_size - compressed_size) / original_size) * 100, 1),
                "note": "Imagen comprimida para mejor rendimiento"
            }
        }
        
    except requests.exceptions.Timeout:
        print("❌ Timeout en PlantNet (75s)")
        raise HTTPException(
            status_code=504, 
            detail="La identificación está tomando demasiado tiempo. Intenta con una imagen más pequeña o mejor iluminada."
        )
    except requests.exceptions.ConnectionError:
        print("❌ Error de conexión con PlantNet")
        raise HTTPException(
            status_code=503,
            detail="Error de conexión con el servicio de identificación. Por favor, intenta nuevamente."
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error interno: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error interno del servidor: {str(e)}"
        )

# =============================================================================
# ENDPOINT RÁPIDO PARA IMÁGENES PEQUEÑAS
# =============================================================================

@app.post("/identify-plant-fast")
async def identify_plant_fast(file: UploadFile = File(...)):
    """
    🚀 Versión RÁPIDA para imágenes pequeñas (< 500KB)
    - Timeout más corto
    - Procesamiento optimizado
    """
    try:
        print(f"🚀 Identificación RÁPIDA: {file.filename}")
        
        # LÍMITE ESTRICTO PARA VERSIÓN RÁPIDA
        MAX_FAST_SIZE = 500 * 1024  # 500KB
        
        file_content = await file.read()
        file_size = len(file_content)
        
        if file_size > MAX_FAST_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"Para identificación rápida, usa imágenes menores a 500KB. Esta imagen es {file_size//1024}KB."
            )
        
        print(f"📁 Tamaño rápido: {file_size//1024}KB")
        
        api_key = os.getenv('PLANT_ID_API_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="Servicio no disponible")
        
        # COMPRIMIR AÚN MÁS PARA VERSIÓN RÁPIDA
        compressed_content = compress_image(file_content, max_size=300000, max_dimension=800)
        
        files = {'images': (file.filename, compressed_content, 'image/jpeg')}
        data = {'organs': 'auto'}
        
        plantnet_url = f'https://my-api.plantnet.org/v2/identify/all?api-key={api_key}'
        
        # TIMEOUT CORTO PARA RÁPIDO
        response = requests.post(plantnet_url, files=files, data=data, timeout=45)
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail="Error en identificación rápida. Usa el endpoint normal."
            )
        
        plant_data = response.json()
        
        if not plant_data.get('results'):
            return {
                "success": True,
                "message": "No se pudo identificar (modo rápido). Intenta con el endpoint normal.",
                "results": []
            }
        
        best_match = plant_data['results'][0]
        
        return {
            "success": True,
            "message": "Identificación rápida exitosa!",
            "results": plant_data['results'],
            "best_match": best_match,
            "mode": "fast"
        }
        
    except requests.exceptions.Timeout:
        raise HTTPException(
            status_code=504,
            detail="Timeout en modo rápido. Usa el endpoint normal para imágenes más grandes."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en modo rápido: {str(e)}")

# =============================================================================
# GESTIÓN DE IMÁGENES (MANTIENE TU CÓDIGO ORIGINAL)
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
        raise HTTPException(status_code=500, detail="Error de conexión a Supabase")
    
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
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

# =============================================================================
# ENDPOINTS DE CONSULTA (MANTIENE TU CÓDIGO ORIGINAL)
# =============================================================================

@app.get("/list-images")
async def list_images():
    if not supabase:
        raise HTTPException(status_code=500, detail="Error de conexión a Supabase")
    
    try:
        response = supabase.table("imagenes").select("*").execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Error obteniendo imágenes: {response.error.message}")
        
        return {
            "count": len(response.data),
            "images": response.data
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo imágenes: {str(e)}")

@app.get("/map-images")
async def get_map_images():
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
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
        raise HTTPException(status_code=500, detail=f"Error obteniendo imágenes: {str(e)}")

@app.get("/imagenes-noticias")
async def get_imagenes_noticias():
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
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
        raise HTTPException(status_code=500, detail=f"Error obteniendo imágenes noticias: {str(e)}")

# =============================================================================
# ADMINISTRACIÓN (MANTIENE TU CÓDIGO ORIGINAL)
# =============================================================================

@app.delete("/delete-image/{image_id}")
async def delete_image(image_id: int):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        image_data = supabase.table("imagenes").select("*").eq("id", image_id).execute()
        
        if not image_data.data:
            raise HTTPException(status_code=404, detail="Imagen no encontrada")
        
        filename = image_data.data[0]["filename"]
        file_path = f"public/{filename}"
        
        storage_response = supabase.storage.from_(BUCKET_NAME).remove([file_path])
        db_response = supabase.table("imagenes").delete().eq("id", image_id).execute()
        
        return {
            "success": True,
            "message": "Imagen eliminada correctamente",
            "deleted_filename": filename
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/cambiar-estado/{image_id}")
async def cambiar_estado_imagen(image_id: int, nuevo_estado: str):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        estados_validos = ['pendiente', 'publicada', 'rechazada', 'activo']
        if nuevo_estado not in estados_validos:
            raise HTTPException(status_code=400, detail="Estado no válido")
        
        response = supabase.table("imagenes").update({"estado": nuevo_estado}).eq("id", image_id).execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Error actualizando estado: {response.error.message}")
        
        return {
            "success": True,
            "message": f"Estado cambiado a {nuevo_estado}",
            "nuevo_estado": nuevo_estado
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/editar-imagen/{image_id}")
async def editar_imagen(
    image_id: int,
    nuevo_nombre: str,
    nueva_descripcion: str = None,
    nueva_lat: float = None,
    nueva_lng: float = None,
    tipo_publicacion: str = "galeria"
):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        tipos_validos = ['galeria', 'noticias']
        if tipo_publicacion not in tipos_validos:
            raise HTTPException(status_code=400, detail="Tipo de publicación no válido")
        
        update_data = {
            "planta_id": nuevo_nombre,
            "description": nueva_descripcion,
            "lat": nueva_lat,
            "lng": nueva_lng,
            "tipo_publicacion": tipo_publicacion
        }
        
        update_data = {k: v for k, v in update_data.items() if v is not None}
        
        response = supabase.table("imagenes").update(update_data).eq("id", image_id).execute()
        
        if hasattr(response, 'error') and response.error:
            error_msg = str(response.error)
            if "tipo_publicacion" in error_msg:
                update_data.pop("tipo_publicacion", None)
                response = supabase.table("imagenes").update(update_data).eq("id", image_id).execute()
            
            if hasattr(response, 'error') and response.error:
                raise Exception(f"Error actualizando imagen: {response.error.message}")
        
        if response.data:
            return {
                "success": True, 
                "message": "Imagen actualizada correctamente",
                "updated_fields": list(update_data.keys())
            }
        else:
            return {"success": False, "message": "No se pudo actualizar la imagen"}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

# =============================================================================
# SUSCRIPTORES (MANTIENE TU CÓDIGO ORIGINAL)
# =============================================================================

@app.post("/suscribir")
async def suscribir_usuario(nombre: str = Form(...), email: str = Form(...)):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        if not "@" in email or not "." in email:
            raise HTTPException(status_code=400, detail="Email no válido")
        
        existing = supabase.table("suscriptores").select("*").eq("email", email).execute()
        
        if existing.data:
            return {
                "success": False,
                "message": "Este email ya está suscrito",
                "email": email
            }
        
        suscriptor_data = {
            "nombre": nombre,
            "email": email,
            "fecha_registro": datetime.now().isoformat(),
            "activo": True
        }
        
        response = supabase.table("suscriptores").insert(suscriptor_data).execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Error guardando suscriptor: {response.error.message}")
        
        return {
            "success": True,
            "message": f"¡Gracias {nombre}! Te has suscrito exitosamente."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en suscripción: {str(e)}")

@app.get("/suscriptores")
async def obtener_suscriptores():
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        response = supabase.table("suscriptores").select("*").order("fecha_registro", desc=True).execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Error obteniendo suscriptores: {response.error.message}")
        
        return {
            "success": True,
            "count": len(response.data),
            "suscriptores": response.data
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo suscriptores: {str(e)}")

@app.delete("/eliminar-suscriptor/{suscriptor_id}")
async def eliminar_suscriptor(suscriptor_id: int):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        response = supabase.table("suscriptores").delete().eq("id", suscriptor_id).execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Error eliminando suscriptor: {response.error.message}")
        
        return {"success": True, "message": "Suscriptor eliminado correctamente"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error eliminando suscriptor: {str(e)}")

# =============================================================================
# AUTENTICACIÓN (MANTIENE TU CÓDIGO ORIGINAL)
# =============================================================================

@app.post("/login")
async def login_admin(nombre_usuario: str = Form(...), contraseña: str = Form(...)):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        user = authenticate_user(nombre_usuario, contraseña)
        if not user:
            raise HTTPException(status_code=401, detail="Credenciales incorrectas")
        
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user["nombre de usuario"], "id": user["id"]}, 
            expires_delta=access_token_expires
        )
        
        supabase.table("usuarios_administradores").update({
            "actualizado_at": datetime.now().isoformat()
        }).eq("id", user["id"]).execute()
        
        return {
            "success": True,
            "access_token": access_token,
            "token_type": "bearer",
            "nombre_usuario": user["nombre de usuario"],
            "id": user["id"]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en login: {str(e)}")

# =============================================================================
# CONFIGURACIÓN API KEYS
# =============================================================================

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
    print("🚀 INICIANDO SERVIDOR FASTAPI - CUENCA UBATÉ (OPTIMIZADO)")
    print("="*60)
    print(f"📁 Directorio base: {BASE_DIR}")
    print(f"🌐 URL: http://0.0.0.0:{port}")
    print(f"📚 Documentación: http://0.0.0.0:{port}/docs") 
    print("❤️  Health Check: /api/health")
    print("🔐 Login: /login")
    print("🔍 Identificar Plantas: /identify-plant")
    print("🚀 Identificación Rápida: /identify-plant-fast")
    uvicorn.run(app, host="0.0.0.0", port=port)
