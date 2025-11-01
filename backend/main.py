from typing import Union, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, BackgroundTasks
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
import asyncio
import aiohttp

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
# COMPRESIÓN AGGRESIVA PARA RENDER
# =============================================================================

def compress_image_for_render(image_data: bytes) -> bytes:
    """
    Compresión ULTRA agresiva específicamente para Render
    """
    try:
        # Abrir imagen
        image = Image.open(io.BytesIO(image_data))
        
        # REDUCIR DRÁSTICAMENTE - máximo 600px
        max_size = 600
        image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        
        # Convertir a RGB si es necesario
        if image.mode in ('RGBA', 'LA', 'P'):
            image = image.convert('RGB')
        
        # Comprimir con calidad baja
        output = io.BytesIO()
        image.save(output, format='JPEG', quality=60, optimize=True)
        
        compressed_data = output.getvalue()
        original_kb = len(image_data) // 1024
        compressed_kb = len(compressed_data) // 1024
        
        print(f"📊 Compresión AGGRESIVA: {original_kb}KB → {compressed_kb}KB")
        
        return compressed_data
        
    except Exception as e:
        print(f"⚠️  Error en compresión: {e}")
        return image_data

# =============================================================================
# SERVIR ARCHIVOS ESTÁTICOS
# =============================================================================

BASE_DIR = Path(__file__).parent.parent
print(f"📁 Directorio base: {BASE_DIR}")

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
# IDENTIFICACIÓN ULTRA OPTIMIZADA PARA RENDER
# =============================================================================

@app.post("/identify-plant")
async def identify_plant(file: UploadFile = File(...)):
    """
    🔍 Identificación ULTRA optimizada para los límites de Render
    """
    try:
        print(f"🔍 INICIO identificación ULTRA-OPTIMIZADA")
        
        # 1. VALIDACIÓN RÁPIDA
        allowed_types = ['image/jpeg', 'image/png', 'image/webp']
        if file.content_type not in allowed_types:
            raise HTTPException(400, "Solo JPEG, PNG o WebP")
        
        # 2. LECTURA Y VALIDACIÓN DE TAMAÑO
        file_content = await file.read()
        file_size = len(file_content)
        
        print(f"📁 Tamaño original: {file_size//1024}KB")
        
        # LIMITE ESTRICTO PARA RENDER
        if file_size > 2 * 1024 * 1024:  # 2MB máximo
            raise HTTPException(
                400, 
                f"Imagen demasiado grande ({file_size//1024}KB). Máximo 2MB."
            )
        
        # 3. COMPRESIÓN AGGRESIVA
        start_compress = datetime.now()
        compressed_content = compress_image_for_render(file_content)
        compress_time = (datetime.now() - start_compress).total_seconds()
        
        compressed_size = len(compressed_content)
        print(f"📊 Después compresión: {compressed_size//1024}KB ({compress_time:.1f}s)")
        
        # 4. VERIFICAR API KEY
        api_key = os.getenv('PLANT_ID_API_KEY')
        if not api_key:
            raise HTTPException(500, "Servicio no disponible")
        
        # 5. PREPARAR DATOS CON TIMEOUT CONSERVADOR
        files = {'images': ('optimized.jpg', compressed_content, 'image/jpeg')}
        data = {'organs': 'auto'}
        
        plantnet_url = f'https://my-api.plantnet.org/v2/identify/all?api-key={api_key}'
        
        print(f"🌐 Enviando a PlantNet (comprimido: {compressed_size//1024}KB)...")
        
        # 6. SOLICITUD CON TIMEOUT CONSERVADOR (45s para evitar límites de Render)
        start_request = datetime.now()
        
        # Usar aiohttp para mejor manejo asíncrono
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=45)) as session:
            form_data = aiohttp.FormData()
            form_data.add_field('images', compressed_content, filename='plant.jpg', content_type='image/jpeg')
            form_data.add_field('organs', 'auto')
            
            async with session.post(plantnet_url, data=form_data) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise HTTPException(response.status, f"Error PlantNet: {error_text[:100]}")
                
                plant_data = await response.json()
        
        request_time = (datetime.now() - start_request).total_seconds()
        print(f"✅ Respuesta recibida en {request_time:.1f}s")
        
        # 7. PROCESAR RESULTADOS
        results = plant_data.get('results', [])
        print(f"📊 {len(results)} resultados obtenidos")
        
        if not results:
            return {
                "success": True,
                "message": "No se pudo identificar la planta. Intenta con otra imagen.",
                "results": [],
                "performance": {
                    "original_size_kb": file_size // 1024,
                    "compressed_size_kb": compressed_size // 1024,
                    "total_time": f"{request_time + compress_time:.1f}s"
                }
            }
        
        # 8. RESPUESTA OPTIMIZADA
        best_match = results[0]
        species = best_match.get('species', {})
        
        return {
            "success": True,
            "message": f"¡Planta identificada! {len(results)} resultados",
            "results": results[:3],  # Solo primeros 3 para reducir tamaño respuesta
            "best_match": best_match,
            "identified_plant": {
                "scientific_name": species.get('scientificName', 'Desconocida'),
                "common_name": species.get('commonNames', [''])[0],
                "probability": best_match.get('score', 0)
            },
            "performance": {
                "original_size_kb": file_size // 1024,
                "compressed_size_kb": compressed_size // 1024,
                "compression_time": f"{compress_time:.1f}s",
                "api_time": f"{request_time:.1f}s",
                "total_time": f"{request_time + compress_time:.1f}s"
            }
        }
        
    except asyncio.TimeoutError:
        print("❌ Timeout asyncio (45s)")
        raise HTTPException(504, "La identificación tomó demasiado tiempo. Intenta con una imagen más pequeña.")
    except aiohttp.ClientError as e:
        print(f"❌ Error de conexión: {e}")
        raise HTTPException(503, "Error de conexión. Intenta nuevamente.")
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error inesperado: {str(e)}")
        raise HTTPException(500, f"Error interno: {str(e)}")

# =============================================================================
# ENDPOINT SUPER-RÁPIDO (para imágenes < 300KB)
# =============================================================================

@app.post("/identify-fast")
async def identify_fast(file: UploadFile = File(...)):
    """
    🚀 ENDPOINT SUPER-RÁPIDO para imágenes pequeñas
    """
    try:
        print(f"🚀 INICIO identificación SUPER-RÁPIDA")
        
        # LÍMITE MUY ESTRICTO
        MAX_SIZE = 300 * 1024  # 300KB
        
        file_content = await file.read()
        file_size = len(file_content)
        
        if file_size > MAX_SIZE:
            raise HTTPException(
                400,
                f"Para modo rápido: máximo 300KB. Tu imagen: {file_size//1024}KB"
            )
        
        print(f"📁 Tamaño rápido: {file_size//1024}KB")
        
        api_key = os.getenv('PLANT_ID_API_KEY')
        if not api_key:
            raise HTTPException(500, "Servicio no disponible")
        
        # COMPRESIÓN MÁS AGGRESIVA
        compressed_content = compress_image_for_render(file_content)
        
        plantnet_url = f'https://my-api.plantnet.org/v2/identify/all?api-key={api_key}'
        
        # TIMEOUT MUY CORTO
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=25)) as session:
            form_data = aiohttp.FormData()
            form_data.add_field('images', compressed_content, filename='fast.jpg', content_type='image/jpeg')
            form_data.add_field('organs', 'auto')
            
            async with session.post(plantnet_url, data=form_data) as response:
                if response.status != 200:
                    raise HTTPException(response.status, "Error en modo rápido")
                
                plant_data = await response.json()
        
        results = plant_data.get('results', [])
        
        if not results:
            return {
                "success": True,
                "message": "No identificado (modo rápido)",
                "results": [],
                "mode": "fast"
            }
        
        return {
            "success": True,
            "message": "Identificación rápida exitosa!",
            "results": results[:2],
            "best_match": results[0],
            "mode": "fast"
        }
        
    except asyncio.TimeoutError:
        raise HTTPException(504, "Timeout en modo rápido")
    except Exception as e:
        raise HTTPException(500, f"Error rápido: {str(e)}")

# =============================================================================
# MANTENER TODOS TUS OTROS ENDPOINTS ORIGINALES
# =============================================================================

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

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

# ... (MANTENER TODOS TUS OTROS ENDPOINTS EXACTAMENTE IGUAL)

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

# ... (TODOS LOS DEMÁS ENDPOINTS ORIGINALES)

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
    print("🚀 CUENCA UBATÉ - OPTIMIZADO PARA RENDER")
    print("="*60)
    print(f"🌐 URL: http://0.0.0.0:{port}")
    print("🔍 Identificar Plantas: /identify-plant")
    print("🚀 Identificación Rápida: /identify-fast")
    print("📊 Límites: 2MB máximo, 45s timeout")
    uvicorn.run(app, host="0.0.0.0", port=port)
