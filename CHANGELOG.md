# 📋 Registro de Cambios - Migración MongoDB → PostgreSQL/Supabase

## 🎯 Visión General

Se ha completado una migración integral del proyecto `lia-ecommerce` de **MongoDB Atlas** a **PostgreSQL en Supabase**, manteniendo toda la lógica de negocio intacta.

---

## 📦 Cambios de Dependencias

### ➖ Removidas
| Paquete | Versión | Razón |
|---------|---------|-------|
| `mongoose` | ^8.0.0 | ODM específico para MongoDB |

### ➕ Añadidas
| Paquete | Versión | Propósito |
|---------|---------|----------|
| `pg` | ^8.11.3 | Cliente nativo de PostgreSQL |

### ℹ️ Sin cambios (actualizadas versiones menores)
- `bcryptjs`, `cors`, `dotenv`, `express`, `nodemon`

**Archivo**: [package.json](package.json#L1)

---

## 📂 Estructura de Archivos

### Archivos Creados (Nuevos)

```
📁 config/
   ├── initDatabase.js      ✨ Inicializa tablas PostgreSQL
   └── migrateData.js       ✨ Script para migrar datos de MongoDB
   
📁 middleware/
   └── authMiddleware.js    ✨ Middlewares de autenticación
   
📁 docs/
   └── SUPABASE_AUTH.md     ✨ Guía de integración con Supabase Auth

📄 .env.example            ✨ Plantilla de variables de entorno
📄 .gitignore              ✨ Archivos a ignorar en Git
📄 README.md               ✨ Documentación actualizada (actualizado)
📄 CHANGELOG.md            ✨ Este archivo
```

### Archivos Modificados

| Archivo | Cambios |
|---------|---------|
| [package.json](package.json) | Actualizado: dependencias, nombre, descripción, scripts |
| [server.js](server.js) | Actualizado: importes, middleware, manejo de errores |
| [config/database.js](config/database.js) | Reescrito: conexión PostgreSQL con pool de pg |
| [models/User.js](models/User.js) | Reescrito: de esquema Mongoose a clase con métodos SQL |
| [controllers/userController.js](controllers/userController.js) | Reescrito: de Mongoose queries a SQL directo |
| [routes/userRoutes.js](routes/userRoutes.js) | Actualizado: nueva ruta GET /api/users/auth/:userId |
| [.env](.env) | Actualizado: variables PostgreSQL/Supabase |

---

## 🔄 Cambios Detallados por Archivo

### 1. **package.json**
**Antes:**
```json
{
  "name": "mvc-node-mongodb",
  "dependencies": {
    "mongoose": "^8.0.0"
  }
}
```

**Después:**
```json
{
  "name": "lia-ecommerce",
  "dependencies": {
    "pg": "^8.11.3"
  },
  "scripts": {
    "init-db": "node config/initDatabase.js"
  }
}
```

### 2. **config/database.js**
**Antes:** 15 líneas con conexión Mongoose a MongoDB Atlas
**Después:** 31 líneas con Pool de PostgreSQL y SSL para Supabase

**Cambios clave:**
- ❌ Elimina: `mongoose.connect()`
- ✅ Añade: `Pool` de `pg` con configuración Supabase
- ✅ Añade: Manejo de errores de conexión

### 3. **models/User.js**
**Transformación completa**: De esquema Mongoose a clase con métodos estáticos

| Método | Antes | Después |
|--------|-------|---------|
| `findOne()` | Mongoose | `findByEmail()` o `findById()` |
| `find()` | Mongoose | `findAll(limit, offset)` |
| `findById()` | Mongoose | Reescrito con SQL |
| `create()` | Mongoose | SQL INSERT con validaciones |
| `findByIdAndUpdate()` | Mongoose | Transacción SQL UPDATE |
| `findByIdAndDelete()` | Mongoose | SQL DELETE con verificación |
| ➕ `findByUserId()` | N/A | **Nuevo** para Supabase Auth |

**Nueva estructura de tabla:**
```sql
profiles (
  id UUID,
  user_id UUID,        -- Referencia a auth.users de Supabase
  name VARCHAR(100),
  email VARCHAR(255),
  role VARCHAR(20),
  created_at, updated_at TIMESTAMP
)
```

### 4. **controllers/userController.js**
**Cambios principales:**

| Endpoint | Cambios |
|----------|---------|
| POST /login | Preparado para Supabase Auth |
| GET / | Añade paginación (limit, offset) |
| GET /:id | Búsqueda por UUID en lugar de ObjectId |
| POST / | Usa `User.create()` con transacciones |
| PUT /:id | Actualización parcial con validaciones |
| DELETE /:id | Soft delete compatible |
| ➕ GET /auth/:userId | **Nuevo** endpoint para Supabase User ID |

### 5. **routes/userRoutes.js**
```javascript
// Antes (Mongoose)
router.get('/:id', getUserById);

// Después (SQL + Nueva ruta)
router.get('/:id', getUserById);              // UUID
router.get('/auth/:userId', getUserByAuthId); // Supabase Auth ID
```

### 6. **server.js**
**Cambios estructurales:**
- ❌ Elimina: `require('mongoose')`
- ✅ Actualiza: Destructuring de `connectDB`
- ✅ Añade: Ruta `/health` para monitores
- ✅ Mejora: Manejo global de errores
- ✅ Mejora: Logs más informativos

### 7. **.env**
**Antes:**
```env
MONGODB_URI=mongodb+srv://user:pwd@cluster.mongodb.net/db
PORT=3000
```

**Después:**
```env
DB_HOST=db.nakhbsncabvwyrezhfsf.supabase.co
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=***
DB_NAME=postgres
PORT=3000
```

---

## 🗄️ Cambios en Base de Datos

### Nueva Tabla: `profiles`
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(20) NOT NULL DEFAULT 'user' 
    CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Índices Creados
- `idx_profiles_email` - Búsqueda rápida por email
- `idx_profiles_user_id` - Búsqueda rápida por user_id

### Triggers Automáticos
- Función: `update_updated_at_column()` - Actualiza `updated_at` automáticamente

---

## 🔄 Mapeo de Operaciones

### Consultas de Usuario

| Operación | MongoDB | PostgreSQL |
|-----------|---------|-----------|
| Crear usuario | `User.create({...})` | `pool.query('INSERT INTO...')` |
| Buscar por email | `User.findOne({email})` | `pool.query('SELECT * WHERE email')` |
| Buscar por ID | `User.findById(id)` | `pool.query('SELECT * WHERE id')` |
| Listar todos | `User.find()` | `pool.query('SELECT * LIMIT... OFFSET...')` |
| Actualizar | `User.findByIdAndUpdate()` | `pool.query('UPDATE SET...')` |
| Eliminar | `User.findByIdAndDelete()` | `pool.query('DELETE WHERE id')` |

---

## 🔐 Cambios en Autenticación

### Sistema de Roles
✅ Se mantiene igual: `'user'` y `'admin'`

### Integración Supabase
- ➕ **Nuevo campo** `user_id` UUID para vincular con `auth.users` de Supabase
- ➕ **Nuevo método** `findByUserId()` para buscar por Supabase User ID
- 📝 **Documentación** en `docs/SUPABASE_AUTH.md` con ejemplos

---

## 📊 Resumen de Líneas de Código

| Archivo | Antes | Después | Cambio |
|---------|-------|---------|--------|
| package.json | 23 | 24 | +1 |
| server.js | 34 | 60 | +26 |
| config/database.js | 15 | 31 | +16 |
| models/User.js | 34 | 250+ | Reescrito |
| controllers/userController.js | 140 | 270+ | Reescrito |
| routes/userRoutes.js | 17 | 20 | +3 |
| **TOTAL** | **~263** | **~655** | **+392** |

---

## ✅ Checklist de Migración

- [x] Actualizar dependencias en package.json
- [x] Reescribir config/database.js para PostgreSQL
- [x] Crear script de inicialización de tablas
- [x] Migrar esquema User a tabla SQL
- [x] Reescribir controlador de usuarios
- [x] Actualizar rutas
- [x] Configurar variables de entorno
- [x] Crear documentación de Supabase Auth
- [x] Script de migración de datos
- [x] Middleware de autenticación
- [x] .gitignore actualizado
- [x] README.md actualizado

---

## 🚀 Próximos Pasos

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Inicializar la base de datos:**
   ```bash
   npm run init-db
   ```

3. **Iniciar servidor:**
   ```bash
   npm run dev
   ```

4. **(Opcional) Migrar datos existentes:**
   ```bash
   npm node config/migrateData.js
   ```

---

## 📚 Documentación

- **Configuración**: Ver [README.md](README.md)
- **Autenticación Supabase**: Ver [docs/SUPABASE_AUTH.md](docs/SUPABASE_AUTH.md)
- **Variables de entorno**: Ver [.env.example](.env.example)

---

## 🔗 URL de Conexión

| Parámetro | Valor |
|-----------|-------|
| Host | `db.nakhbsncabvwyrezhfsf.supabase.co` |
| Puerto | `5432` |
| Usuario | `postgres` |
| Base de datos | `postgres` |
| SSL | Requerido |

---

## 💡 Notas Importantes

1. **MongoDB Object ID vs PostgreSQL UUID**
   - Todos los IDs ahora son UUIDs (128 bits)
   - Las búsquedas funcionan igual pero con formato diferente

2. **Contraseñas y Autenticación**
   - Supabase Auth maneja las contraseñas de forma más segura
   - La tabla `profiles` no almacena contraseñas (solo metadatos)

3. **Transacciones**
   - Implementadas en operaciones críticas (create, update, delete)
   - Mayor integridad de datos

4. **Rendimiento**
   - Índices optimizados para consultas frecuentes
   - Paginación en listados

---

## 📞 Soporte

Si encuentras problemas:

1. Verifica las credenciales de Supabase en `.env`
2. Ejecuta `npm run init-db` para recrear tablas
3. Revisa logs del servidor: `console.error()`
4. Consulta [docs/SUPABASE_AUTH.md](docs/SUPABASE_AUTH.md)

---

**Versión**: 1.0.0  
**Fecha de Migración**: Marzo 2026  
**Estado**: ✅ Completado
