from typing import Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
import os
from datetime import datetime, timedelta
import uuid
from passlib.context import CryptContext
from jose import JWTError, jwt

app = FastAPI(title="Cuenca Ubate API", version="1.0.0")

# Configura CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configura Supabase CON TUS CREDENCIALES
SUPABASE_URL = "https://arpartnlablfedsqxbsz.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFycGFydG5sYWJsZmVkc3F4YnN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxODU5MzQsImV4cCI6MjA2OTc2MTkzNH0.Vg5bkYt0ON_-WAM2-Ftq4x_i67yizI39FkGxuBWxTWs"
BUCKET_NAME = "images"

# Configuración JWT
SECRET_KEY = "clave-secreta-cuenca-ubate-2024-render"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

print("🔧 Inicializando API Cuenca Ubate...")
print(f"📋 SUPABASE_URL: {SUPABASE_URL[:20]}...")
print(f"🔑 SUPABASE_KEY: {SUPABASE_KEY[:20]}...")

# Conexión a Supabase
supabase = None
try:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    # Test de conexión
    result = supabase.table("imagenes").select("*").limit(1).execute()
    print("✅ Conexión a Supabase establecida correctamente")
except Exception as e:
    print(f"❌ Error conectando a Supabase: {e}")
    supabase = None

# Funciones de autenticación
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def authenticate_user(username: str, password: str):
    try:
        if not supabase:
            return None
            
        response = supabase.table("usuarios_administradores").select("*").eq("nombre de usuario", username).execute()
        
        if not response.data:
            return None
        
        user = response.data[0]
        if not verify_password(password, user["contraseña_hash"]):
            return None
        
        return user
    except Exception as e:
        print(f"Error en autenticación: {e}")
        return None

# Endpoints principales
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

@app.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    planta_id: str = Form("planta-desconocida"),
    nombre_usuario: str = Form("usuario_web"),
    description: str = Form(""),
    lat: Optional[float] = Form(None),
    lng: Optional[float] = Form(None)
):
    """Sube imagen asociada a una planta específica"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Error de conexión a Supabase")
    
    try:
        # Generar nombre único para el archivo
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        file_path = f"public/{unique_filename}"
        
        # Leer el contenido del archivo
        file_content = await file.read()
        
        print(f"📤 Subiendo imagen: {file_path}")
        
        # Subir a Supabase Storage
        upload_response = supabase.storage.from_(BUCKET_NAME).upload(
            path=file_path,
            file=file_content
        )
        
        if hasattr(upload_response, 'error') and upload_response.error:
            raise Exception(f"Error subiendo imagen: {upload_response.error.message}")
        
        # Obtener URL pública
        public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(file_path)
        
        # Datos para guardar
        image_data = {
            "filename": unique_filename,
            "nombre_usuario": nombre_usuario,
            "planta_id": planta_id,
            "url_imagen": public_url,
            "estado": "pendiente",
            "fecha_subida": datetime.now().isoformat(),
            "lat": lat,
            "lng": lng
        }
        
        # Solo agregar description si se proporciona
        if description:
            image_data["description"] = description
        
        print(f"💾 Guardando metadatos para planta: {planta_id}")
        
        # Insertar en base de datos con manejo de errores
        db_response = supabase.table("imagenes").insert(image_data).execute()
        
        if hasattr(db_response, 'error') and db_response.error:
            error_msg = str(db_response.error)
            # Si falla por columnas que no existen, intentar sin ellas
            if "description" in error_msg:
                image_data.pop("description", None)
                db_response = supabase.table("imagenes").insert(image_data).execute()
            
            if "lat" in error_msg or "lng" in error_msg:
                image_data.pop("lat", None)
                image_data.pop("lng", None)
                db_response = supabase.table("imagenes").insert(image_data).execute()
                
            if hasattr(db_response, 'error') and db_response.error:
                raise Exception(f"Error guardando datos: {db_response.error.message}")
        
        return {
            "success": True,
            "message": f"Imagen guardada para planta {planta_id} (pendiente de revisión)",
            "planta_id": planta_id,
            "filename": unique_filename,
            "public_url": public_url,
            "estado": "pendiente"
        }
        
    except Exception as e:
        print(f"❌ Error en upload: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.get("/list-images")
async def list_images():
    """Lista todas las imágenes de la base de datos"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Error de conexión a Supabase")
    
    try:
        response = supabase.table("imagenes").select("*").order("fecha_subida", desc=True).execute()
        
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
    """Obtiene solo las imágenes con coordenadas para mostrar en el mapa"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        # Obtener imágenes publicadas
        response = supabase.table("imagenes").select("*").eq("estado", "publicada").execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Error obteniendo imágenes: {response.error.message}")
        
        # Filtrar imágenes que tienen coordenadas
        imagenes_con_coordenadas = [
            img for img in response.data 
            if img.get('lat') is not None and img.get('lng') is not None
        ]
        
        return {
            "count": len(imagenes_con_coordenadas),
            "images": imagenes_con_coordenadas
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo imágenes: {str(e)}")

@app.get("/plantas")
async def get_plantas():
    """Obtiene lista de todas las plantas únicas"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        response = supabase.table("imagenes").select("planta_id").execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Error: {response.error.message}")
        
        plantas_unicas = list(set([img['planta_id'] for img in response.data if img['planta_id']]))
        
        return {
            "count": len(plantas_unicas),
            "plantas": sorted(plantas_unicas)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Endpoints de administración
@app.delete("/delete-image/{image_id}")
async def delete_image(image_id: int):
    """Elimina una imagen y sus metadatos"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        # 1. Obtener información de la imagen
        image_data = supabase.table("imagenes").select("*").eq("id", image_id).execute()
        
        if not image_data.data:
            raise HTTPException(status_code=404, detail="Imagen no encontrada")
        
        filename = image_data.data[0]["filename"]
        file_path = f"public/{filename}"
        
        # 2. Eliminar del storage
        supabase.storage.from_(BUCKET_NAME).remove([file_path])
        
        # 3. Eliminar de la base de datos
        supabase.table("imagenes").delete().eq("id", image_id).execute()
        
        return {
            "success": True,
            "message": "Imagen eliminada correctamente",
            "deleted_id": image_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/cambiar-estado/{image_id}")
async def cambiar_estado_imagen(image_id: int, nuevo_estado: str):
    """Cambia el estado de una imagen (publicada, rechazada, pendiente)"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        # Verificar que el estado sea válido
        estados_validos = ['pendiente', 'publicada', 'rechazada']
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
            "image_id": image_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Sistema de autenticación
@app.post("/login")
async def login_admin(
    nombre_usuario: str = Form(...),
    contraseña: str = Form(...)
):
    """Inicia sesión como administrador y devuelve token JWT"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        # Autenticar usuario
        user = authenticate_user(nombre_usuario, contraseña)
        if not user:
            raise HTTPException(
                status_code=401,
                detail="Credenciales incorrectas"
            )
        
        # Crear token de acceso
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user["nombre de usuario"], "id": user["id"]}, 
            expires_delta=access_token_expires
        )
        
        return {
            "success": True,
            "access_token": access_token,
            "token_type": "bearer",
            "nombre_usuario": user["nombre de usuario"]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en login: {str(e)}")

@app.get("/verify-token")
async def verify_token(token: str):
    """Verifica si un token JWT es válido"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        user_id: int = payload.get("id")
        
        if username is None or user_id is None:
            raise HTTPException(status_code=401, detail="Token inválido")
        
        return {
            "valid": True,
            "nombre_usuario": username,
            "id": user_id
        }
        
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

@app.post("/registrar-admin")
async def registrar_admin(
    nombre_usuario: str = Form(...),
    contrasena: str = Form(...)
):
    """Registra un nuevo usuario administrador"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        # Verificar si el usuario ya existe
        existing_user = supabase.table("usuarios_administradores").select("*").eq("nombre de usuario", nombre_usuario).execute()
        
        if existing_user.data:
            raise HTTPException(status_code=400, detail="El nombre de usuario ya existe")
        
        # Hash de la contraseña
        contrasena_hash = get_password_hash(contrasena)
        
        # Datos del nuevo administrador
        admin_data = {
            "nombre de usuario": nombre_usuario,
            "contraseña_hash": contrasena_hash,
            "creado_at": datetime.now().isoformat(),
            "actualizado_at": datetime.now().isoformat()
        }
        
        # Insertar en la base de datos
        response = supabase.table("usuarios_administradores").insert(admin_data).execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Error creando usuario: {response.error.message}")
        
        return {
            "success": True,
            "message": "Administrador registrado correctamente",
            "nombre_usuario": nombre_usuario
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

# Si necesitas ejecutar localmente
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
