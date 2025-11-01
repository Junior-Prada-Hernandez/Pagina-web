from typing import Union, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
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
# ENDPOINTS BÁSICOS - SIN SERVIR ARCHIVOS HTML
# =============================================================================

@app.get("/")
async def read_root():
    return {
        "message": "API Cuenca Ubate funcionando", 
        "status": "online",
        "timestamp": datetime.now().isoformat(),
        "database": "connected" if supabase else "disconnected"
    }

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy", 
        "timestamp": datetime.now().isoformat(),
        "service": "Cuenca Ubate API",
        "database": "connected" if supabase else "disconnected"
    }

# =============================================================================
# IDENTIFICACIÓN DE PLANTAS - SOLO EL ENDPOINT API
# =============================================================================

@app.post("/identify-plant")
async def identify_plant(file: UploadFile = File(...)):
    try:
        print(f"🔍 Iniciando identificación de planta: {file.filename}")
        
        allowed_content_types = ['image/jpeg', 'image/png', 'image/webp']
        if file.content_type not in allowed_content_types:
            raise HTTPException(status_code=400, detail=f"Tipo de archivo no soportado. Use JPEG, PNG o WebP.")
        
        api_key = os.getenv('PLANT_ID_API_KEY')
        if not api_key:
            print("❌ PLANT_ID_API_KEY no encontrada")
            raise HTTPException(status_code=500, detail="API Key no configurada")
        
        print(f"✅ API Key encontrada: {api_key[:10]}...")
        
        file_content = await file.read()
        print(f"📁 Tamaño del archivo: {len(file_content)} bytes")
        
        files = {'images': (file.filename, file_content, file.content_type)}
        data = {'organs': 'auto'}
        
        plantnet_url = f'https://my-api.plantnet.org/v2/identify/all?api-key={api_key}'
        print(f"🌐 Enviando solicitud a PlantNet...")
        
        response = requests.post(plantnet_url, files=files, data=data, timeout=30)
        
        print(f"📥 Respuesta de PlantNet: {response.status_code}")
        
        if response.status_code != 200:
            error_detail = "Error desconocido"
            try:
                error_data = response.json()
                error_detail = error_data.get('error', error_detail)
            except:
                error_detail = response.text
                
            print(f"❌ Error PlantNet: {error_detail}")
            raise HTTPException(status_code=response.status_code, detail=f"PlantNet API error: {error_detail}")
        
        plant_data = response.json()
        print(f"✅ Identificación exitosa. {len(plant_data.get('results', []))} resultados")
        
        if not plant_data.get('results') or len(plant_data['results']) == 0:
            return {
                "success": True,
                "message": "No se pudo identificar la planta con certeza",
                "results": []
            }
        
        return {
            "success": True,
            "message": f"Identificación exitosa. {len(plant_data['results'])} resultados",
            "results": plant_data['results'],
            "best_match": plant_data['results'][0]
        }
        
    except requests.exceptions.Timeout:
        print("❌ Timeout en la solicitud a PlantNet")
        raise HTTPException(status_code=504, detail="Tiempo de espera agotado")
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error interno: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

# =============================================================================
# ENDPOINTS DE CONSULTA (mantén los mismos que tenías)
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

# ... (mantén todos los otros endpoints que tenías)

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
    print("🚀 API CUENCA UBATÉ - SOLO ENDPOINTS")
    print("="*60)
    print(f"🌐 URL: http://0.0.0.0:{port}")
    print(f"📚 Documentación: http://0.0.0.0:{port}/docs") 
    print("❤️  Health Check: /api/health")
    print("🔍 Identificar Plantas: /identify-plant")
    uvicorn.run(app, host="0.0.0.0", port=port)
