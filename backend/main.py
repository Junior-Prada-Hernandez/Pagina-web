from typing import Union, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
import os
from dotenv import load_dotenv
from datetime import datetime
import uuid
import requests  # 🔥 NUEVA IMPORTACIÓN para llamadas HTTP externas

# =============================================================================
# CONFIGURACIÓN INICIAL Y VARIABLES DE ENTORNO
# =============================================================================

# Cargar variables de entorno desde el archivo .env
load_dotenv()

# Crear aplicación FastAPI
app = FastAPI(
    title="Cuenca Ubate API", 
    version="1.0.0",
    description="API para identificación y gestión de plantas de la Cuenca Ubaté"
)

# =============================================================================
# CONFIGURACIÓN CORS (Comunicación Frontend-Backend)
# =============================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción, cambiar a dominios específicos
    allow_credentials=True,
    allow_methods=["*"],   # Permite todos los métodos (GET, POST, PUT, DELETE)
    allow_headers=["*"],   # Permite todos los headers
)

# =============================================================================
# CONFIGURACIÓN SUPABASE (Base de Datos)
# =============================================================================

# Obtener credenciales desde variables de entorno
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
BUCKET_NAME = "images"  # Bucket de almacenamiento en Supabase

print("🔧 Configurando Supabase...")
print(f"📋 SUPABASE_URL: {'✅' if SUPABASE_URL else '❌'}")
print(f"🔑 SUPABASE_KEY: {'✅' if SUPABASE_KEY else '❌'}")

# Conexión a Supabase
supabase = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        # Probar conexión con una consulta simple
        result = supabase.table("imagenes").select("*").limit(1).execute()
        print("✅ Conexión a Supabase establecida correctamente")
    except Exception as e:
        print(f"❌ Error conectando a Supabase: {e}")
        supabase = None
else:
    print("⚠️  Supabase no configurado - variables faltantes")

# =============================================================================
# CONFIGURACIÓN AUTENTICACIÓN JWT
# =============================================================================

from passlib.context import CryptContext
from datetime import timedelta
from jose import JWTError, jwt

# Configuración para JWT (JSON Web Tokens)
SECRET_KEY = os.getenv("SECRET_KEY", "clave-secreta-temporal-cambiar-en-produccion")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Contexto para hashing de contraseñas
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# =============================================================================
# FUNCIONES AUXILIARES DE AUTENTICACIÓN
# =============================================================================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica si una contraseña plana coincide con el hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Genera hash seguro de una contraseña"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Crea un token JWT con expiración"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def authenticate_user(username: str, password: str) -> Optional[dict]:
    """Autentica un usuario contra la base de datos"""
    try:
        # Buscar usuario en la tabla de administradores
        response = supabase.table("usuarios_administradores").select("*").eq("nombre de usuario", username).execute()
        
        if hasattr(response, 'error') and response.error:
            return None
        
        if not response.data:
            return None
        
        user = response.data[0]
        # Verificar contraseña
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
    """Endpoint raíz - Estado del servicio"""
    return {
        "message": "API Cuenca Ubate funcionando", 
        "status": "online",
        "timestamp": datetime.now().isoformat(),
        "database": "connected" if supabase else "disconnected"
    }

@app.get("/health")
def health_check():
    """Health check para monitoreo del servicio"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "api": "running",
            "database": "connected" if supabase else "disconnected"
        }
    }

# =============================================================================
# 🔐 ENDPOINT CLAVE: Identificación de Plantas (SEGURO)
# =============================================================================

@app.post("/identify-plant")
async def identify_plant(file: UploadFile = File(...)):
    """
    🔍 Identifica plantas usando PlantNet API de forma segura
    - La API Key está protegida en el backend
    - El frontend no necesita conocer la clave
    - Validación de tipos de archivo
    """
    try:
        # 1. VALIDAR TIPO DE ARCHIVO
        allowed_content_types = ['image/jpeg', 'image/png', 'image/webp']
        if file.content_type not in allowed_content_types:
            raise HTTPException(
                status_code=400, 
                detail=f"Tipo de archivo no soportado. Use: {', '.join(allowed_content_types)}"
            )
        
        # 2. OBTENER API KEY DESDE VARIABLES DE ENTORNO
        api_key = os.getenv('PLANT_ID_API_KEY')
        if not api_key:
            raise HTTPException(
                status_code=500, 
                detail="API Key no configurada en el servidor"
            )
        
        print(f"🔍 Identificando planta con API Key: {api_key[:10]}...")
        
        # 3. PREPARAR DATOS PARA PLANTNET API
        file_content = await file.read()
        files = {
            'images': (file.filename, file_content, file.content_type)
        }
        data = {
            'organs': 'auto'  # Detección automática de órganos de la planta
        }
        
        # 4. LLAMAR A PLANTNET API
        plantnet_url = f'https://my-api.plantnet.org/v2/identify/all?api-key={api_key}'
        response = requests.post(plantnet_url, files=files, data=data)
        
        # 5. MANEJAR RESPUESTA
        if response.status_code != 200:
            error_detail = response.json().get('error', 'Error desconocido de PlantNet API')
            raise HTTPException(
                status_code=response.status_code, 
                detail=f"PlantNet API error: {error_detail}"
            )
        
        plant_data = response.json()
        
        # 6. VALIDAR RESULTADOS
        if not plant_data.get('results') or len(plant_data['results']) == 0:
            return {
                "success": True,
                "message": "No se pudo identificar la planta con certeza",
                "results": [],
                "suggestions": "Intente con una imagen más clara o desde otro ángulo"
            }
        
        # 7. RETORNAR RESULTADOS
        return {
            "success": True,
            "message": f"Identificación exitosa. {len(plant_data['results'])} resultados encontrados",
            "results": plant_data['results'],
            "best_match": plant_data['results'][0]  # El resultado con mayor probabilidad
        }
        
    except HTTPException:
        # Re-lanzar excepciones HTTP que ya manejamos
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
    """
    ⚙️ Proporciona configuración segura al frontend
    - Solo información pública necesaria
    - Las API keys sensibles se mantienen en el backend
    """
    return {
        # Solo información que el frontend necesita conocer
        "API_BASE_URL": os.getenv("API_BASE_URL", "http://localhost:8000"),
        "ENVIRONMENT": os.getenv("NODE_ENV", "development"),
        "SUPABASE_URL": os.getenv("SUPABASE_URL"),
        "EMAILJS_SERVICE_ID": os.getenv("EMAILJS_SERVICE_ID"),
        "EMAILJS_TEMPLATE_ID": os.getenv("EMAILJS_TEMPLATE_ID"),
        # NOTA: PLANT_ID_API_KEY NO se expone al frontend
    }

# ✅ AGREGA AQUÍ LA NUEVA RUTA PARA LAS API KEYS
@app.get("/api/keys")
async def get_api_keys():
    """
    🔑 Proporciona API keys de forma segura al frontend
    - Las keys nunca se exponen en el código del frontend
    - Se obtienen dinámicamente desde las variables de entorno
    """
    return {
        "PLANT_ID_API_KEY": os.getenv("PLANT_ID_API_KEY"),
        "DEEPSEEK_API_KEY": os.getenv("DEEPSEEK_API_KEY")
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
    """📤 Sube imagen asociada a una planta específica"""

    if not supabase:
        raise HTTPException(status_code=500, detail="Error de conexión a Supabase")
    
    try:
        # 1. GENERAR NOMBRE ÚNICO
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        file_path = f"public/{unique_filename}"
        
        # 2. LEER CONTENIDO DEL ARCHIVO
        file_content = await file.read()
        
        print(f"📤 Subiendo imagen: {file_path}")
        
        # 3. SUBIR A SUPABASE STORAGE
        upload_response = supabase.storage.from_(BUCKET_NAME).upload(
            path=file_path,
            file=file_content
        )
        
        if hasattr(upload_response, 'error') and upload_response.error:
            raise Exception(f"Error subiendo imagen: {upload_response.error.message}")
        
        # 4. OBTENER URL PÚBLICA
        public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(file_path)
        
        # 5. PREPARAR METADATOS
        image_data = {
            "filename": unique_filename,
            "nombre_usuario": nombre_usuario,
            "planta_id": planta_id,
            "url_imagen": public_url,
            "estado": "pendiente",
            "fecha_subida": datetime.now().isoformat(),
            "lat": lat,
            "lng": lng,
            "tipo_publicacion": "galeria"  # 🆕 Valor por defecto
        }
        
        # 6. AGREGAR DESCRIPCIÓN SI EXISTE
        if description:
            image_data["description"] = description
        
        print(f"💾 Guardando metadatos: {image_data}")
        
        # 7. GUARDAR EN BASE DE DATOS
        db_response = supabase.table("imagenes").insert(image_data).execute()
        
        # 8. MANEJAR ERRORES DE COLUMNAS FALTANTES
        if hasattr(db_response, 'error') and db_response.error:
            error_msg = str(db_response.error)
            
            # Si falla por description, intentar sin description
            if "description" in error_msg:
                print("⚠️  Columna description no existe, guardando sin description...")
                image_data.pop("description", None)
                db_response = supabase.table("imagenes").insert(image_data).execute()
            
            # Si falla por lat/lng, intentar sin ellas
            elif "lat" in error_msg or "lng" in error_msg:
                print("⚠️  Columnas lat/lng no existen, guardando sin coordenadas...")
                image_data.pop("lat", None)
                image_data.pop("lng", None)
                db_response = supabase.table("imagenes").insert(image_data).execute()
            
            # Si falla por tipo_publicacion, intentar sin ella
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
# ENDPOINTS DE ADMINISTRACIÓN
# =============================================================================

@app.delete("/delete-image/{image_id}")
async def delete_image(image_id: int):
    """🗑️ Elimina una imagen y sus metadatos"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        # 1. OBTENER INFORMACIÓN DE LA IMAGEN
        image_data = supabase.table("imagenes").select("*").eq("id", image_id).execute()
        
        if not image_data.data:
            raise HTTPException(status_code=404, detail="Imagen no encontrada")
        
        filename = image_data.data[0]["filename"]
        file_path = f"public/{filename}"
        
        # 2. ELIMINAR DEL STORAGE
        storage_response = supabase.storage.from_(BUCKET_NAME).remove([file_path])
        
        # 3. ELIMINAR DE LA BASE DE DATOS
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
    """🔄 Cambia el estado de una imagen (publicada, rechazada, pendiente)"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        # Validar estado
        estados_validos = ['pendiente', 'publicada', 'rechazada', 'activo']
        if nuevo_estado not in estados_validos:
            raise HTTPException(status_code=400, detail="Estado no válido")
        
        response = supabase.table("imagenes").update({
            "estado": nuevo_estado
        }).eq("id", image_id).execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Error actualizando estado: {response.error.message}")
        
        return {
            "success": True,
            "message": f"Estado cambiado a {nuevo_estado}",
            "nuevo_estado": nuevo_estado
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 🆕 ENDPOINT ACTUALIZADO: Editar imagen con tipo_publicacion
@app.put("/editar-imagen/{image_id}")
async def editar_imagen(
    image_id: int,
    nuevo_nombre: str,
    nueva_descripcion: str = None,
    nueva_lat: float = None,
    nueva_lng: float = None,
    tipo_publicacion: str = "galeria"  # 🆕 Nuevo parámetro
):
    """✏️ Edita los metadatos de una imagen incluyendo tipo de publicación"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        # Validar tipo_publicacion
        tipos_validos = ['galeria', 'noticias']
        if tipo_publicacion not in tipos_validos:
            raise HTTPException(status_code=400, detail="Tipo de publicación no válido")
        
        # Datos a actualizar
        update_data = {
            "planta_id": nuevo_nombre,
            "description": nueva_descripcion,
            "lat": nueva_lat,
            "lng": nueva_lng,
            "tipo_publicacion": tipo_publicacion  # 🆕 Agregar este campo
        }
        
        # Remover valores None
        update_data = {k: v for k, v in update_data.items() if v is not None}
        
        print(f"🔧 Actualizando imagen {image_id} con datos: {update_data}")
        
        # Actualizar en Supabase
        response = supabase.table("imagenes").update(update_data).eq("id", image_id).execute()
        
        if hasattr(response, 'error') and response.error:
            error_msg = str(response.error)
            
            # Si falla por tipo_publicacion, intentar sin ella
            if "tipo_publicacion" in error_msg:
                print("⚠️  Columna tipo_publicacion no existe, actualizando sin tipo...")
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
        print(f"❌ Error en editar_imagen: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

# =============================================================================
# ENDPOINTS DE CONSULTA
# =============================================================================

@app.get("/list-images")
async def list_images():
    """📋 Lista todas las imágenes de la base de datos"""
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
    """🗺️ Obtiene imágenes con coordenadas para mostrar en el mapa"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        response = supabase.table("imagenes").select("*").execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Error obteniendo imágenes: {response.error.message}")
        
        # Filtrar imágenes con coordenadas y publicadas
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

# 🆕 NUEVO ENDPOINT: Obtener imágenes para noticias
@app.get("/imagenes-noticias")
async def get_imagenes_noticias():
    """📰 Obtiene imágenes marcadas como noticias para mostrar en el inicio"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        response = supabase.table("imagenes").select("*").execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Error obteniendo imágenes: {response.error.message}")
        
        # Filtrar imágenes marcadas como noticias y publicadas
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

@app.get("/plantas")
async def get_plantas():
    """🌿 Obtiene lista de todas las plantas únicas"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        response = supabase.table("imagenes").select("planta_id").execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Error: {response.error.message}")
        
        plantas_unicas = list(set([img['planta_id'] for img in response.data if img['planta_id']]))
        
        return {
            "count": len(plantas_unicas),
            "plantas": plantas_unicas
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =============================================================================
# SISTEMA DE SUSCRIPTORES (NUEVO)
# =============================================================================

@app.post("/suscribir")
async def suscribir_usuario(
    nombre: str = Form(...),
    email: str = Form(...)
):
    """📧 Suscribe un usuario a las notificaciones"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        # Validar email
        if not "@" in email or not "." in email:
            raise HTTPException(status_code=400, detail="Email no válido")
        
        # Verificar si el email ya existe
        existing = supabase.table("suscriptores").select("*").eq("email", email).execute()
        
        if existing.data:
            return {
                "success": False,
                "message": "Este email ya está suscrito",
                "email": email
            }
        
        # Insertar nuevo suscriptor
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
            "message": f"¡Gracias {nombre}! Te has suscrito exitosamente.",
            "suscriptor": {
                "nombre": nombre,
                "email": email,
                "fecha_registro": suscriptor_data["fecha_registro"]
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en suscripción: {str(e)}")

@app.get("/suscriptores")
async def obtener_suscriptores():
    """📋 Obtiene todos los suscriptores"""
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
    """🗑️ Elimina un suscriptor"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        response = supabase.table("suscriptores").delete().eq("id", suscriptor_id).execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Error eliminando suscriptor: {response.error.message}")
        
        return {
            "success": True,
            "message": "Suscriptor eliminado correctamente"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error eliminando suscriptor: {str(e)}")

@app.delete("/eliminar-suscriptor-email")
async def eliminar_suscriptor_por_email(email: str):
    """🗑️ Elimina un suscriptor por email"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        response = supabase.table("suscriptores").delete().eq("email", email).execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Error eliminando suscriptor: {response.error.message}")
        
        return {
            "success": True,
            "message": f"Suscriptor con email {email} eliminado correctamente"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error eliminando suscriptor: {str(e)}")

# =============================================================================
# SISTEMA DE AUTENTICACIÓN
# =============================================================================

@app.post("/login")
async def login_admin(
    nombre_usuario: str = Form(...),
    contraseña: str = Form(...)
):
    """🔐 Inicia sesión como administrador y devuelve token JWT"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        # Autenticar usuario
        user = authenticate_user(nombre_usuario, contraseña)
        if not user:
            raise HTTPException(
                status_code=401,
                detail="Credenciales incorrectas",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Crear token de acceso
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user["nombre de usuario"], "id": user["id"]}, 
            expires_delta=access_token_expires
        )
        
        # Actualizar última actualización
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

@app.get("/verify-token")
async def verify_token(token: str):
    """✅ Verifica si un token JWT es válido"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        user_id: int = payload.get("id")
        
        if username is None or user_id is None:
            raise HTTPException(status_code=401, detail="Token inválido")
        
        # Verificar que el usuario aún existe
        response = supabase.table("usuarios_administradores").select("*").eq("id", user_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        
        return {
            "valid": True,
            "nombre_usuario": username,
            "id": user_id
        }
        
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

# =============================================================================
# INICIO DEL SERVIDOR
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    
    print("\n" + "="*60)
    print("🚀 INICIANDO SERVIDOR FASTAPI - CUENCA UBATÉ")
    print("="*60)
    print("🌐 URL: http://localhost:8002")
    print("📚 Documentación: http://localhost:8002/docs") 
    print("❤️  Health Check: http://localhost:8002/health")
    print("🔐 Login: http://localhost:8002/login")
    print("🔍 Identificar Plantas: http://localhost:8002/identify-plant")
    print("🗺️  Map Images: http://localhost:8002/map-images")
    print("📰 Noticias Images: http://localhost:8002/imagenes-noticias")
    print("📧 Suscripciones: http://localhost:8002/suscribir")
    print("👥 Gestión Suscriptores: http://localhost:8002/suscriptores")
    print("⚙️  Config: http://localhost:8002/config")
    uvicorn.run(app, host="0.0.0.0", port=8002)