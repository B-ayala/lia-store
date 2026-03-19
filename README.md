# LIA E-Commerce API - PostgreSQL/Supabase

API REST para e-commerce migrada de MongoDB a PostgreSQL con Supabase.

## 📋 Cambios Principales

### ✅ Migración Completada
- **Antes**: MongoDB Atlas + Mongoose
- **Ahora**: PostgreSQL en Supabase + Pool de conexiones nativo

### 📦 Dependencias Actualizadas

#### Removidas
- `mongoose` (ODM de MongoDB)

#### Añadidas
- `pg` (cliente nativo de PostgreSQL)

## 🚀 Instalación y Configuración

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar variables de entorno
Crea un archivo `.env` con la siguiente configuración:

```env
NODE_ENV=development
PORT=3000

# Base de datos PostgreSQL / Supabase
DB_HOST=db.nakhbsncabvwyrezhfsf.supabase.co
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=abj3wp9rfZGmVc2g
DB_NAME=postgres

# Frontend
FRONTEND_URL=http://localhost:5173
```

### 3. Inicializar la base de datos
```bash
npm run init-db
```

Este comando:
- Crea la tabla `profiles` (esquema de usuarios)
- Crea índices para mejor rendimiento
- Configura triggers automáticos para `updated_at`

### 4. Iniciar el servidor
```bash
# Modo desarrollo
npm run dev

# Modo producción
npm start
```

El servidor correrá en `http://localhost:3000`

## 📊 Estructura de la Base de Datos

### Tabla: `profiles`
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,          -- ID de Supabase Auth
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Índices
- `idx_profiles_email` - Búsqueda rápida por email
- `idx_profiles_user_id` - Búsqueda rápida por user_id de Supabase

## 🔌 API Endpoints

### Autenticación
```
POST /api/users/login
Body: { email, password }
```

### Usuarios
```
GET    /api/users                    # Obtener todos (con paginación)
GET    /api/users/:id                # Obtener por ID
GET    /api/users/auth/:userId       # Obtener por Supabase Auth ID
POST   /api/users                    # Crear usuario
PUT    /api/users/:id                # Actualizar usuario
DELETE /api/users/:id                # Eliminar usuario
```

### Query Parameters
```
GET /api/users?limit=50&offset=0
```

## 💾 Ejemplos de Uso

### Crear usuario
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Juan Pérez",
    "email": "juan@example.com",
    "role": "user"
  }'
```

### Obtener usuario por ID
```bash
curl http://localhost:3000/api/users/550e8400-e29b-41d4-a716-446655440000
```

### Actualizar usuario
```bash
curl -X PUT http://localhost:3000/api/users/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Juan Actualizado",
    "role": "admin"
  }'
```

### Eliminar usuario
```bash
curl -X DELETE http://localhost:3000/api/users/550e8400-e29b-41d4-a716-446655440000
```

## 🔐 Integración con Supabase Auth

El proyecto está preparado para funcionar con Supabase Auth:

1. **Tabla `profiles`**: Almacena datos adicionales del usuario (nombre, rol)
2. **`user_id` UUID**: Referencia a `auth.users` de Supabase
3. **Roles**: Sistema `user` y `admin` para control de acceso

### Flujo recomendado:
1. Usuario se registra en Supabase Auth (frontend)
2. Después del registro, crear perfil en `profiles` con `user_id` del usuario
3. Usar `user_id` para asociar datos en otras tablas

## 📝 Modelos de Datos

### User Model (`models/User.js`)
Métodos disponibles:
- `findByEmail(email)` - Buscar por email
- `findById(id)` - Buscar por UUID
- `findByUserId(userId)` - Buscar por user_id de Supabase
- `findAll(limit, offset)` - Listar con paginación
- `create(userData)` - Crear usuario
- `findByIdAndUpdate(id, updateData)` - Actualizar
- `findByIdAndDelete(id)` - Eliminar
- `hashPassword(password)` - Hash de contraseña
- `comparePassword(password, hash)` - Comparar contraseña

## 🛠️ Herramientas y Mejores Prácticas

### Conexión a la BD
```javascript
const { pool } = require('./config/database');

// Usar pool directo
const result = await pool.query('SELECT * FROM profiles WHERE id = $1', [id]);
```

### Transacciones
```javascript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // Múltiples queries
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
} finally {
  client.release();
}
```

### Manejo de Errores
- Las queries están parametrizadas contra SQL injection
- Validaciones en modelo y controlador
- Códigos HTTP semánticos (201, 400, 404, 409, 500)

## 📈 Escalabilidad para E-commerce

El proyecto está listo para escalar:
- **Productos**: Crear tabla `products` con campos: id, name, description, price, stock, category, images
- **Órdenes**: Tabla `orders` con items y estado
- **Carrito**: Tabla `cart_items` con user_id, product_id, quantity
- **Pagos**: Integración con Stripe/MercadoPago
- **Roles y Permisos**: System role-based está preparado

## 🔄 Migración desde MongoDB (Referencia)

Si tenías datos en MongoDB, puedes migrarlos:

```javascript
// Script de migración (no incluido)
// 1. Exportar datos de MongoDB
// 2. Mapear _id de MongoDB a UUID
// 3. Insertar en PostgreSQL
```

## 📋 Procedimientos SQL Útiles

### Backup de datos
```bash
pg_dump -h db.nakhbsncabvwyrezhfsf.supabase.co -U postgres -d postgres > backup.sql
```

### Restaurar desde backup
```bash
psql -h db.nakhbsncabvwyrezhfsf.supabase.co -U postgres -d postgres < backup.sql
```

## 🐛 Troubleshooting

### Error: "connect ECONNREFUSED"
- Verifica las credenciales en `.env`
- Comprueba que la BD de Supabase está activa
- Revisa tu conexión a internet

### Error: "password authentication failed"
- Verifica `DB_PASSWORD` en `.env`
- Asegúrate de usar el usuario `postgres` correcto

### Tabla no existe
```bash
npm run init-db
```

## 📚 Recursos
- [Documentación PostgreSQL](https://www.postgresql.org/docs/)
- [Documentación Supabase](https://supabase.com/docs)
- [Cliente pg](https://github.com/brianc/node-postgres)

---

**Migración completada** ✅ | Última actualización: Marzo 2026
