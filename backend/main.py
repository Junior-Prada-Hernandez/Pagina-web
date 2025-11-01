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
# IDENTIFICACIÓN DE PLANTAS - SIMPLE Y FUNCIONAL
# =============================================================================

@app.post("/identify-plant")
async def identify_plant(file: UploadFile = File(...)):
    """
    🔍 Identificación SIMPLE pero FUNCIONAL
    - Sin dependencias extra
    - Límites realistas para Render
    """
    try:
        print(f"🔍 Iniciando identificación: {file.filename}")
        
        # 1. VALIDACIÓN RÁPIDA
        allowed_types = ['image/jpeg', 'image/png', 'image/webp']
        if file.content_type not in allowed_types:
            raise HTTPException(400, "Solo se permiten imágenes JPEG, PNG o WebP")
        
        # 2. LECTURA Y VALIDACIÓN DE TAMAÑO
        MAX_SIZE = 2 * 1024 * 1024  # 2MB máximo (realista para Render)
        
        file_content = await file.read()
        file_size = len(file_content)
        
        print(f"📁 Tamaño de imagen: {file_size//1024}KB")
        
        if file_size > MAX_SIZE:
            raise HTTPException(
                400, 
                f"Imagen demasiado grande ({file_size//1024}KB). Para mejor rendimiento, usa imágenes menores a 2MB."
            )
        
        # 3. VERIFICAR API KEY
        api_key = os.getenv('PLANT_ID_API_KEY')
        if not api_key:
            print("❌ PLANT_ID_API_KEY no configurada")
            raise HTTPException(500, "Servicio de identificación no disponible")
        
        print(f"✅ API Key encontrada")
        
        # 4. PREPARAR Y ENVIAR SOLICITUD
        files = {'images': (file.filename, file_content, file.content_type)}
        data = {'organs': 'auto'}
        
        plantnet_url = f'https://my-api.plantnet.org/v2/identify/all?api-key={api_key}'
        print(f"🌐 Enviando a PlantNet...")
        
        # 5. TIMEOUT REALISTA para Render
        start_time = datetime.now()
        response = requests.post(plantnet_url, files=files, data=data, timeout=45)
        request_time = (datetime.now() - start_time).total_seconds()
        
        print(f"📥 Respuesta recibida en {request_time:.1f}s")
        
        if response.status_code != 200:
            error_detail = "Error desconocido"
            try:
                error_data = response.json()
                error_detail = error_data.get('error', error_detail)
            except:
                error_detail = response.text[:100]
                
            print(f"❌ Error PlantNet: {error_detail}")
            
            # Mensajes de error específicos
            if response.status_code == 413:
                raise HTTPException(400, "Imagen demasiado grande para PlantNet")
            elif response.status_code == 429:
                raise HTTPException(429, "Demasiadas solicitudes. Espera unos minutos.")
            else:
                raise HTTPException(response.status_code, f"Error del servicio: {error_detail}")
        
        # 6. PROCESAR RESULTADOS
        plant_data = response.json()
        results = plant_data.get('results', [])
        
        print(f"✅ Identificación exitosa: {len(results)} resultados")
        
        if not results:
            return {
                "success": True,
                "message": "No se pudo identificar la planta con certeza. Intenta con una imagen más clara y enfocada.",
                "results": [],
                "performance": {
                    "image_size_kb": file_size // 1024,
                    "processing_time": f"{request_time:.1f}s"
                }
            }
        
        # 7. FORMATEAR RESPUESTA
        best_match = results[0]
        species = best_match.get('species', {})
        
        scientific_name = species.get('scientificName', 'Desconocida')
        common_names = species.get('commonNames', [])
        common_name = common_names[0] if common_names else 'No disponible'
        probability = best_match.get('score', 0)
        
        print(f"🌿 Identificada: {scientific_name} - {probability*100:.1f}% de probabilidad")
        
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
            "performance": {
                "image_size_kb": file_size // 1024,
                "processing_time": f"{request_time:.1f}s"
            }
        }
        
    except requests.exceptions.Timeout:
        print("❌ Timeout en PlantNet (45s)")
        raise HTTPException(
            504, 
            "La identificación está tomando demasiado tiempo. Por favor, usa una imagen más pequeña (menor a 2MB) o intenta más tarde."
        )
    except requests.exceptions.ConnectionError:
        print("❌ Error de conexión con PlantNet")
        raise HTTPException(503, "Error de conexión. El servicio puede estar temporalmente no disponible.")
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error interno: {str(e)}")
        raise HTTPException(500, f"Error interno del servidor: {str(e)}")

# =============================================================================
# MANTENER TODOS LOS ENDPOINTS ORIGINALES
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

@app.delete("/delete-image/{image_id}")
async def delete_image(image_id: int):
    if not supabase:
        raise HTTPException(500, "Supabase no configurado")
    
    try:
        image_data = supabase.table("imagenes").select("*").eq("id", image_id).execute()
        
        if not image_data.data:
            raise HTTPException(404, "Imagen no encontrada")
        
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
        raise HTTPException(500, detail=str(e))

@app.put("/cambiar-estado/{image_id}")
async def cambiar_estado_imagen(image_id: int, nuevo_estado: str):
    if not supabase:
        raise HTTPException(500, "Supabase no configurado")
    
    try:
        estados_validos = ['pendiente', 'publicada', 'rechazada', 'activo']
        if nuevo_estado not in estados_validos:
            raise HTTPException(400, "Estado no válido")
        
        response = supabase.table("imagenes").update({"estado": nuevo_estado}).eq("id", image_id).execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Error actualizando estado: {response.error.message}")
        
        return {
            "success": True,
            "message": f"Estado cambiado a {nuevo_estado}",
            "nuevo_estado": nuevo_estado
        }
        
    except Exception as e:
        raise HTTPException(500, detail=str(e))

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
        raise HTTPException(500, "Supabase no configurado")
    
    try:
        tipos_validos = ['galeria', 'noticias']
        if tipo_publicacion not in tipos_validos:
            raise HTTPException(400, "Tipo de publicación no válido")
        
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
        raise HTTPException(500, detail=f"Error: {str(e)}")

@app.post("/suscribir")
async def suscribir_usuario(nombre: str = Form(...), email: str = Form(...)):
    if not supabase:
        raise HTTPException(500, "Supabase no configurado")
    
    try:
        if not "@" in email or not "." in email:
            raise HTTPException(400, "Email no válido")
        
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
        raise HTTPException(500, detail=f"Error en suscripción: {str(e)}")

@app.get("/suscriptores")
async def obtener_suscriptores():
    if not supabase:
        raise HTTPException(500, "Supabase no configurado")
    
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
        raise HTTPException(500, detail=f"Error obteniendo suscriptores: {str(e)}")

@app.delete("/eliminar-suscriptor/{suscriptor_id}")
async def eliminar_suscriptor(suscriptor_id: int):
    if not supabase:
        raise HTTPException(500, "Supabase no configurado")
    
    try:
        response = supabase.table("suscriptores").delete().eq("id", suscriptor_id).execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Error eliminando suscriptor: {response.error.message}")
        
        return {"success": True, "message": "Suscriptor eliminado correctamente"}
        
    except Exception as e:
        raise HTTPException(500, detail=f"Error eliminando suscriptor: {str(e)}")

@app.post("/login")
async def login_admin(nombre_usuario: str = Form(...), contraseña: str = Form(...)):
    if not supabase:
        raise HTTPException(500, "Supabase no configurado")
    
    try:
        user = authenticate_user(nombre_usuario, contraseña)
        if not user:
            raise HTTPException(401, "Credenciales incorrectas")
        
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
        raise HTTPException(500, detail=f"Error en login: {str(e)}")

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
    print("🚀 CUENCA UBATÉ - VERSIÓN ESTABLE")
    print("="*60)
    print(f"🌐 URL: http://0.0.0.0:{port}")
    print("🔍 Identificar Plantas: /identify-plant")
    print("📊 Límites: 2MB máximo, 45s timeout")
    print("✅ Sin dependencias extra - 100% funcional")
    uvicorn.run(app, host="0.0.0.0", port=port)
