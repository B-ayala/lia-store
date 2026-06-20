# 📋 Registro de Cambios - Migración MongoDB → PostgreSQL/Supabase

## [Unreleased]

### Added
- **Analítica del asistente admin** (`/api/admin/insights/*`, solo-admin con
  `authMiddleware + adminMiddleware`, solo lectura): cinco endpoints que devuelven un
  envelope uniforme `{ success, insight }` con métricas, tabla y acción sugerida:
  - `GET /low-stock?threshold=` — productos **activos** por debajo del umbral (default 5,
    clamp 1–100). Los inactivos se excluyen: su stock bajo no es accionable para reposición.
  - `GET /sales-today` — facturación, pedidos y unidades pagadas del día (hora local AR).
  - `GET /pending-payment` — pedidos en estado `pendiente` (split MP / transferencia).
  - `GET /pending-pickups` — retiros en local por WhatsApp (`transfer` + `retiro_local`)
    pendientes de confirmar desde el momento del pedido, con antigüedad por fila.
  - `GET /top-products` — top de unidades vendidas (pagadas) del mes con facturación y
    comparación contra el mes anterior.
  - `GET /sales-growth` — productos con mayor crecimiento de unidades vs. mes anterior.
  - `GET /pickups-to-confirm` — retiros en local (`shipping_method = 'local'`) pagados,
    pendientes de confirmar la entrega (dispatch_status no entregado).
  - Capa nueva: `models/Insights.js` (queries parametrizadas) + `controllers/insightsController.js`.
- Validación server-side en `productController`: no se permite crear ni dejar un
  producto en estado `active` con stock 0 (devuelve **400**). En `create` se valida
  contra el `stock` del body; en `update` se resuelve el estado/stock objetivo contra
  la fila actual (cubre tanto activar como bajar stock a 0). Antes el controlador
  guardaba el `status` tal cual. El estado `inactive` sigue permitiendo stock 0.

### Fixed
- `deleteProduct` ya no borra el asset de Cloudinary si **otro producto comparte el
  mismo `public_id`** (imagen reutilizada): antes, borrar un producto rompía la imagen
  del otro. Se consulta si algún otro producto referencia el `public_id` y, si es así,
  se saltea el borrado en Cloudinary (el producto igual se elimina de la base).
- **Módulo de órdenes** (`/api/orders/*`) que el frontend ya consumía y devolvía 404:
  - `POST /mp-preference` (auth): valida el pedido, reserva stock de forma atómica,
    registra ventas `pendiente` y crea la preferencia de Mercado Pago
    (`init_point` + `order_ids`, `external_reference` con los ids).
  - `POST /mp-confirm` (auth): verifica un pago contra la API de MP y marca las
    ventas como `pagado` (lo llama el front al volver de MP con `payment_id`).
  - `POST /mp-webhook` (público, server a server): notificaciones de pago de MP.
  - `GET /user?email=` (auth): compras pagadas del usuario; solo el dueño del
    email o un admin pueden consultarlas.
  - `POST /:id/cancel` (auth, idempotente): cancela una orden MP pendiente y
    devuelve el stock reservado.
  - `PATCH /:id/confirm-transfer` y `PATCH /:id/cancel-transfer` (admin):
    resuelven transferencias pendientes; al confirmar se descuenta stock.
- **Sweep de expiración** (cada 60 s): órdenes `pendiente` vencidas → `expirado`
  + devolución de stock (MP > 15 min, transferencias > 5 h). Ventanas alineadas
  con las que muestra el panel de Ventas del frontend.

  > **Modelo de stock (verificado contra la DB):** existe el trigger
  > `trg_decrement_stock` (AFTER INSERT en `ventas`) que descuenta stock al crear
  > cualquier venta. Por eso el backend NO descuenta stock al crear órdenes —
  > solo **valida disponibilidad** con la fila bloqueada (`SELECT … FOR UPDATE`)
  > antes de insertar, y **restaura** stock al cancelar/expirar. Si un pago se
  > acredita después de expirar, se vuelve a descontar.
- Endpoint `GET /api/shipping?postalCode=` que la página de producto ya consumía
  (devuelve `{ cost, days }` de Correo Argentino).
- Modelo `models/Order.js` (acceso a `ventas`/`productos` con transacciones) y
  cliente `utils/mercadopago.js`. Nueva variable de entorno: `MP_ACCESS_TOKEN`
  (opcional `MP_WEBHOOK_URL`); sin token, los endpoints MP responden 503 con
  mensaje claro.
- `User.findByEmail()` y `User.findByUserId()`: eran llamados por
  `loginUser` y `GET /api/users/auth/:userId` pero no existían en el modelo
  (TypeError en runtime).
- Endpoint `GET /api/cloudinary/usage`: expone el consumo de la cuenta de Cloudinary
  (recursos usados/límite) que el frontend ya consumía y devolvía 404.

### Changed
- CORS movido a `config/cors.js`. En desarrollo (`NODE_ENV !== 'production'`) se
  acepta cualquier origen local (`localhost`/`127.0.0.1` en cualquier puerto) para
  no romper cuando Vite cambia de puerto (5173 → 5174 → …). En producción se
  mantiene la allowlist estricta de `FRONTEND_URL`.
- Rutas `/api/cloudinary/*` ahora protegidas con `authMiddleware` + `adminMiddleware`
  (solo admin): `images`, `usage`, `folders` (GET/POST/DELETE), `delete`, `sign`.
  `/config` queda pública (solo expone `cloudName` + `apiKey`, datos no sensibles).
- `authMiddleware` ahora **verifica** el access token contra Supabase Auth
  (`GET /auth/v1/user`: valida firma, expiración y revocación) en lugar de solo
  decodificarlo. Requiere `SUPABASE_URL` y `SUPABASE_ANON_KEY` en el entorno.
- Rutas `/api/users/*` ahora protegidas con `authMiddleware` + `adminMiddleware`
  (solo admin): listar, ver por id, ver por auth-id, crear, actualizar, eliminar.
  Quedan públicas `signup-status`, `signup-ratelimit` y `login` (flujo pre-auth).

### Removed
- Logs de debug `[AUTH DEBUG]` en `authMiddleware` que exponían fragmentos del token.

### Fixed
- **`GET /api/cloudinary/usage` reportaba un "límite" engañoso:** `media_limit` caía
  al fallback `credits.limit` (los 25 créditos del plan free) y `media_count` era la
  cantidad de archivos, así que el front calculaba "96% del límite" comparando archivos
  contra créditos. Ahora `mapUsageResponse` devuelve el consumo real de créditos
  (`credits_used`, `credits_limit`, `credits_used_percent`) y `asset_count` como dato
  informativo aparte.
- **Checkout de Mercado Pago caía con 502 en entornos no-HTTPS (p. ej. localhost):**
  `buildPreferencePayload` enviaba siempre `auto_return: 'approved'`, pero MP
  rechaza ese campo con `400 "auto_return invalid. back_url.success must be
  defined"` cuando `back_urls.success` no es una URL pública (HTTPS) — el
  controller lo traducía a 502 y el flujo quedaba bloqueado por completo en local.
  Ahora `auto_return` solo se incluye cuando el origin del frontend es `https://`
  (producción); en HTTP/localhost se omite y la preferencia se crea igual. No
  cambia el comportamiento en producción (Vercel sirve HTTPS).
- **Las cuentas nuevas no generaban perfil:** el trigger `on_auth_user_created`
  (que crea la fila en `public.profiles`) no existía en la base, así que los
  registros nacían sin perfil (agravado al desactivar "Confirm email", porque ya
  no había un evento de confirmación posterior). Se recreó la función
  `handle_new_user` (ahora también guarda `name` desde el metadata del signup,
  con `ON CONFLICT DO NOTHING`) y el trigger `AFTER INSERT ON auth.users`. En
  `initDatabase.js` se aplican siempre (idempotente) para evitar drift repo↔base.
  Se backfillearon los perfiles faltantes de cuentas ya existentes.
- **Borrado de usuario dejaba la cuenta de auth viva:** `User.findByIdAndDelete`
  solo garantizaba el borrado del perfil; si el perfil ya no existía no llegaba a
  borrar `auth.users`, dejando el email "ocupado" (el signup fallaba con "ya
  registrado"). Ahora borra `auth.users` (fuente de verdad) y el perfil de forma
  defensiva, y funciona aunque el perfil ya no exista.
- **Panel de usuarios ocultaba cuentas sin perfil:** `User.findAll` listaba
  `FROM profiles`, por lo que una cuenta de `auth.users` sin perfil quedaba
  invisible e ingestionable desde el panel. Ahora lista `FROM auth.users` (LEFT
  JOIN a `profiles`) para mostrarlas y poder eliminarlas.
- `req.user` ahora incluye `email` (verificado por Supabase): lo usan las rutas
  de órdenes para validar que un usuario solo vea/cancele sus propias compras.
- `server.js` loguea promesas rechazadas sin manejar (`unhandledRejection`).
- `GET /api/cloudinary/images` ya no enmascara errores de Cloudinary como `200/success`:
  si Cloudinary responde con `{ error }` o sin `resources`, se propaga `502` para que
  el frontend muestre estado de error en vez de crashear.

### Security
- **Bypass de login cerrado:** `POST /api/users/login` devolvía éxito con cualquier
  contraseña si el email existía (la comparación estaba comentada). Ahora valida
  las credenciales contra Supabase Auth (`grant_type=password`) y la ruta quedó
  registrada en `userRoutes`.
- `.env.example` tenía la contraseña real de la base de datos commiteada; se
  reemplazó por un placeholder. **Rotar esa contraseña en Supabase** si el repo
  se compartió.
- Cierre de acceso anónimo a listado/borrado/firma de Cloudinary: antes cualquiera con
  la URL podía listar o borrar imágenes y generar firmas de upload.
- **Auth bypass cerrado:** `authMiddleware` validaba el JWT con `jwt.decode` (sin verificar
  firma), por lo que un token falsificado con `sub`/rol de admin pasaba. Ahora la firma se
  verifica contra Supabase; un token forjado responde `401`.

---

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
