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

# =============================================================================
# CONFIGURACIÓN INICIAL Y VARIABLES DE ENTORNO
# =============================================================================

load_dotenv()

app = FastAPI(
    title="Cuenca Ubate API", 
    version="1.0.0",
    description="API para identificación y gestión de plantas de la Cuenca Ubaté"
)

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
# SERVIR ARCHIVOS ESTÁTICOS - CORREGIDO PARA RENDER
# =============================================================================

# Servir archivos estáticos desde la carpeta actual
app.mount("/assets", StaticFiles(directory="assets"), name="assets")

# Servir archivos HTML principales
@app.get("/")
async def read_index():
    if os.path.exists("index.html"):
        return FileResponse("index.html")
    else:
        return {"message": "API funcionando pero index.html no encontrado"}

@app.get("/{page_name}")
async def read_page(page_name: str):
    # Lista de páginas permitidas
    paginas_permitidas = [
        "index.html", "plantas_guardadas.html", "Mapa.html", "mapa.html", 
        "galeria_completa.html", "identificador-plantas.html",
        "suscripcion.html", "contactos.html", "login.html",
        "bienvenido.html"
    ]
    
    if page_name in paginas_permitidas and os.path.exists(page_name):
        return FileResponse(page_name)
    elif page_name.endswith('.html') and os.path.exists(page_name):
        return FileResponse(page_name)
    else:
        # Si no encuentra la página, devolver el index
        if os.path.exists("index.html"):
            return FileResponse("index.html")
        else:
            raise HTTPException(status_code=404, detail="Página no encontrada")

# =============================================================================
# CONFIGURACIÓN SUPABASE - CON CREDENCIALES DIRECTAS PARA RENDER
# =============================================================================

# 🔥 CREDENCIALES DIRECTAS DE SUPABASE (para Render)
SUPABASE_URL = "https://arpartnlablfedsqxbsz.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFycGFydG5sYWJsZmVkc3F4YnN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxODU5MzQsImV4cCI6MjA2OTc2MTkzNH0.Vg5bkYt0ON_-WAM2-Ftq4x_i67yizI39FkGxuBWxTWs"
BUCKET_NAME = "images"

print("🔧 Configurando Supabase...")
print(f"📋 SUPABASE_URL: {SUPABASE_URL}")
print(f"🔑 SUPABASE_KEY: {SUPABASE_KEY[:10]}...")

# Conexión a Supabase
supabase = None
try:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    # Probar conexión con una consulta simple
    result = supabase.table("imagenes").select("*").limit(1).execute()
    print("✅ Conexión a Supabase establecida correctamente")
    print(f"📊 Tabla 'imagenes': {len(result.data)} registros encontrados")
    
    # Probar conexión con suscriptores
    suscriptores_result = supabase.table("suscriptores").select("*").limit(1).execute()
    print(f"📧 Tabla 'suscriptores': {len(suscriptores_result.data)} registros encontrados")
    
except Exception as e:
    print(f"❌ Error conectando a Supabase: {e}")
    supabase = None

# =============================================================================
# CONFIGURACIÓN AUTENTICACIÓN JWT
# =============================================================================

from passlib.context import CryptContext
from datetime import timedelta
from jose import JWTError, jwt

# Configuración para JWT
SECRET_KEY = os.getenv("SECRET_KEY", "clave-secreta-temporal-cambiar-en-produccion")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Contexto para hashing de contraseñas
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
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
# ENDPOINTS PÚBLICOS
# =============================================================================

@app.get("/")
def read_root():
    return {
        "message": "API Cuenca Ubate funcionando", 
        "status": "online",
        "timestamp": datetime.now().isoformat(),
        "database": "connected" if supabase else "disconnected"
    }

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "api": "running",
            "database": "connected" if supabase else "disconnected"
        }
    }

# =============================================================================
# 🔐 ENDPOINT CLAVE: Identificación de Plantas - CORREGIDO
# =============================================================================

@app.post("/identify-plant")
async def identify_plant(file: UploadFile = File(...)):
    try:
        allowed_content_types = ['image/jpeg', 'image/png', 'image/webp']
        if file.content_type not in allowed_content_types:
            raise HTTPException(
                status_code=400, 
                detail=f"Tipo de archivo no soportado. Use: {', '.join(allowed_content_types)}"
            )
        
        # 🔥 API KEY DIRECTA PARA RENDER
        api_key = "2b10aLv6ZUTN4hwDcJ4I3dmu"
        if not api_key:
            raise HTTPException(
                status_code=500, 
                detail="API Key no configurada en el servidor"
            )
        
        print(f"🔍 Identificando planta con API Key: {api_key[:10]}...")
        
        file_content = await file.read()
        files = {
            'images': (file.filename, file_content, file.content_type)
        }
        data = {
            'organs': 'auto'
        }
        
        plantnet_url = f'https://my-api.plantnet.org/v2/identify/all?api-key={api_key}'
        
        # Agregar timeout para evitar 504
        response = requests.post(plantnet_url, files=files, data=data, timeout=30)
        
        if response.status_code != 200:
            error_detail = response.json().get('error', 'Error desconocido de PlantNet API')
            raise HTTPException(
                status_code=response.status_code, 
                detail=f"PlantNet API error: {error_detail}"
            )
        
        plant_data = response.json()
        
        if not plant_data.get('results') or len(plant_data['results']) == 0:
            return {
                "success": True,
                "message": "No se pudo identificar la planta con certeza",
                "results": [],
                "suggestions": "Intente con una imagen más clara o desde otro ángulo"
            }
        
        return {
            "success": True,
            "message": f"Identificación exitosa. {len(plant_data['results'])} resultados encontrados",
            "results": plant_data['results'],
            "best_match": plant_data['results'][0]
        }
        
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Timeout: La identificación tardó demasiado")
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error en identificación: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error interno del servidor: {str(e)}"
        )

# =============================================================================
# ENDPOINT DE CONFIGURACIÓN PARA FRONTEND
# =============================================================================

@app.get("/config")
async def get_config():
    return {
        "API_BASE_URL": "https://pagina-web-2p69.onrender.com",
        "ENVIRONMENT": "production",
        "SUPABASE_URL": SUPABASE_URL,
        "EMAILJS_SERVICE_ID": os.getenv("EMAILJS_SERVICE_ID"),
        "EMAILJS_TEMPLATE_ID": os.getenv("EMAILJS_TEMPLATE_ID"),
    }

@app.get("/api/keys")
async def get_api_keys():
    return {
        "PLANT_ID_API_KEY": "2b10aLv6ZUTN4hwDcJ4I3dmu",
        "DEEPSEEK_API_KEY": "sk-93a2f73354c14faf8121c0bab5935598"
    }

# =============================================================================
# GESTIÓN DE IMÁGENES
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
        
        print(f"📤 Subiendo imagen: {file_path}")
        
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
        
        print(f"💾 Guardando metadatos: {image_data}")
        
        db_response = supabase.table("imagenes").insert(image_data).execute()
        
        if hasattr(db_response, 'error') and db_response.error:
            error_msg = str(db_response.error)
            
            if "description" in error_msg:
                print("⚠️  Columna description no existe, guardando sin description...")
                image_data.pop("description", None)
                db_response = supabase.table("imagenes").insert(image_data).execute()
            
            elif "lat" in error_msg or "lng" in error_msg:
                print("⚠️  Columnas lat/lng no existen, guardando sin coordenadas...")
                image_data.pop("lat", None)
                image_data.pop("lng", None)
                db_response = supabase.table("imagenes").insert(image_data).execute()
            
            elif "tipo_publicacion" in error_msg:
                print("⚠️  Columna tipo_publicacion no existe, guardando sin tipo...")
                image_data.pop("tipo_publicacion", None)
                db_response = supabase.table("imagenes").insert(image_data).execute()
                
            if hasattr(db_response, 'error') and db_response.error:
                raise Exception(f"Error guardando datos: {db_response.error.message}")
        
        return {
            "success": True,
            "message": f"Imagen guardada para planta {planta_id} (pendiente de revisión)",
            "planta_id": planta_id,
            "filename": unique_filename,
            "public_url": public_url,
            "estado": "pendiente",
            "lat": lat,
            "lng": lng
        }
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

# =============================================================================
# ENDPOINTS DE CONSULTA - CORREGIDOS
# =============================================================================

@app.get("/list-images")
async def list_images():
    if not supabase:
        raise HTTPException(status_code=500, detail="Error de conexión a Supabase")
    
    try:
        response = supabase.table("imagenes").select("*").execute()
        
        if hasattr(response, 'error') and response.error:
            print(f"❌ Error de Supabase: {response.error}")
            raise Exception(f"Error obteniendo imágenes: {response.error.message}")
        
        print(f"📊 Enviando {len(response.data)} imágenes al frontend")
        
        # Asegurarse de que todas las imágenes tengan URL válida
        imagenes_procesadas = []
        for img in response.data:
            imagen_procesada = {
                "id": img.get("id"),
                "planta_id": img.get("planta_id", "Sin nombre"),
                "description": img.get("description", "Sin descripción"),
                "nombre_usuario": img.get("nombre_usuario", "Anónimo"),
                "fecha_subida": img.get("fecha_subida", datetime.now().isoformat()),
                "estado": img.get("estado", "pendiente"),
                "url_imagen": img.get("url_imagen", ""),
                "lat": img.get("lat"),
                "lng": img.get("lng"),
                "tipo_publicacion": img.get("tipo_publicacion", "galeria")
            }
            
            # Si no hay URL de imagen, generar placeholder
            if not imagen_procesada["url_imagen"]:
                imagen_procesada["url_imagen"] = f"https://via.placeholder.com/400x200/4a7c59/ffffff?text={imagen_procesada['planta_id']}"
            
            imagenes_procesadas.append(imagen_procesada)
        
        return {
            "count": len(imagenes_procesadas),
            "images": imagenes_procesadas
        }
        
    except Exception as e:
        print(f"❌ Error obteniendo imágenes: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo imágenes: {str(e)}")

# ... (el resto de los endpoints se mantienen igual)

# =============================================================================
# INICIO DEL SERVIDOR - ADAPTADO PARA RENDER
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", 8000))
    
    print("\n" + "="*60)
    print("🚀 INICIANDO SERVIDOR FASTAPI - CUENCA UBATÉ")
    print("="*60)
    print(f"🌐 URL: http://0.0.0.0:{port}")
    print(f"📚 Documentación: http://0.0.0.0:{port}/docs") 
    print(f"❤️  Health Check: http://0.0.0.0:{port}/health")
    
    uvicorn.run(app, host="0.0.0.0", port=port)
