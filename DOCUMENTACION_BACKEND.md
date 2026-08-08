# Documentación Técnica — Backend (lia-store / "lia-ecommerce")

> Documentación de **cómo está construido hoy** el backend, leída directamente del código fuente
> (`server.js`, `routes/`, `controllers/`, `models/`, `middleware/`, `config/`). Pensada como
> referencia de consulta antes de cualquier cambio.
>
> ⚠️ **Leé primero la sección 11 (Discrepancias con el frontend).** Este backend implementa un
> contrato **distinto** al que consume el frontend actual (`../../FRONT/damiana-bella`). No asumas
> que todo lo que el front llama existe acá.

---

## 1. Resumen

API REST en **Node.js + Express** con patrón **MVC**, sobre **PostgreSQL/Supabase** (acceso
directo vía `pg`, no vía el SDK de Supabase). Expone tres áreas bajo el prefijo `/api`:

- **`/api/users`** — perfiles de usuario (sobre `public.profiles` + `auth.users`), login de
  referencia y tracker de rate-limit de signup.
- **`/api/products`** — CRUD de productos (lectura pública, escritura solo admin).
- **`/api/cloudinary`** — firma de uploads y gestión de imágenes/carpetas vía Admin API de Cloudinary.

La autenticación se basa en el **JWT de Supabase Auth** que emite el frontend: el backend lo
**decodifica** para extraer el `sub` (user id) y busca el rol en `public.profiles`.

---

## 2. Tecnologías y dependencias

| Dependencia | Versión | Uso |
|---|---|---|
| `express` | ^4.18.2 | servidor HTTP / routing |
| `compression` | ^1.8.1 | gzip de las respuestas (el JSON del catálogo es muy repetitivo) |
| `pg` | ^8.11.3 | cliente PostgreSQL (pool) |
| `jsonwebtoken` | ^9.0.3 | **decodificar** el JWT de Supabase (no se verifica firma — ver §10) |
| `bcryptjs` | ^2.4.3 | hashing de passwords (declarado; sin uso activo en el código actual) |
| `cors` | ^2.8.5 | CORS con allowlist por `FRONTEND_URL` |
| `dotenv` | ^16.6.1 | variables de entorno |
| `nodemon` | ^3.0.1 (dev) | hot-reload en desarrollo |

- `package.json` → `name: lia-ecommerce`, `main: server.js`, `engines.node: >=14`.
- Scripts: `start` (`node server.js`), `dev` (`nodemon server.js`), `init-db` (`node config/initDatabase.js`).

---

## 3. Estructura de carpetas

```
lia-store/
├── server.js                  # Entry point: compresión, CORS, límites de body, rate limit global,
│                              # bulkhead, montaje de rutas, /health, error handler, apagado ordenado
├── package.json               # deps + scripts (start / dev / init-db)
├── .env.example               # plantilla de variables de entorno
├── .gitignore
│
├── config/
│   ├── database.js            # Pool de pg (SSL) parametrizable + timeouts, connectDB() con reintentos,
│   │                          # getPoolStats() para /health y closeDB() para el apagado
│   ├── cors.js                # allowlist por FRONTEND_URL (+ cualquier localhost en desarrollo)
│   ├── initDatabase.js        # `npm run init-db`: profiles, RLS, trigger handle_new_user, carousel_images…
│   └── migrateData.js         # script legacy de migración MongoDB → PostgreSQL (referencia, opcional)
│
├── db/migrations/             # SQL versionado (se corre en el SQL Editor de Supabase)
│   ├── 2026-06-16_add_origin_to_ventas.sql
│   └── 2026-08-08_add_performance_indexes.sql   # índices de las consultas calientes
│
├── routes/                    # Endpoints + su rate limit y política de caché HTTP
│   ├── userRoutes.js          # /api/users            (login con el límite más estricto)
│   ├── productRoutes.js       # /api/products         (lectura pública cacheable; escritura admin)
│   ├── orderRoutes.js         # /api/orders           (checkout, webhook, nudge; todo no-store)
│   ├── shippingRoutes.js      # /api/shipping         (tarifa plana, cacheable 5 min)
│   ├── insightsRoutes.js      # /api/admin/insights   (solo admin)
│   └── cloudinaryRoutes.js    # /api/cloudinary
│
├── controllers/               # Lógica de cada endpoint
│   ├── userController.js       # login, CRUD de perfiles, signup status/ratelimit, getUserByAuthId
│   ├── productController.js    # CRUD + catálogo paginado y cacheado; errores 500 genéricos
│   ├── orderController.js      # reserva de stock, preferencia MP, transferencias, nudge, sweep
│   ├── insightsController.js   # analítica del asistente admin (cacheada 60 s)
│   ├── shippingController.js   # cotización por código postal
│   └── cloudinaryController.js # firma SHA1, delete, getImages, getConfig, folders
│
├── models/                    # Acceso a datos (SQL parametrizado)
│   ├── User.js                # profiles
│   ├── Order.js               # ventas + stock (FOR UPDATE, expiración, pago tardío)
│   └── Insights.js            # agregaciones de analítica
│
├── middleware/
│   ├── authMiddleware.js       # verifica el token contra Supabase (con caché corta) + adminMiddleware
│   ├── rateLimit.js            # límites por endpoint (ventana deslizante) con headers estándar
│   ├── concurrencyLimit.js     # bulkhead + cola con timeout → 503 en vez de colapso
│   ├── httpCache.js            # Cache-Control público / no-store
│   └── signupTracker.js        # rate-limit de signup in-memory (Map por email)
│
├── utils/
│   ├── cache.js               # caché TTL + single-flight (coalescing) e invalidación del catálogo
│   ├── logger.js              # logs estructurados JSON, nivelados por LOG_LEVEL
│   └── mercadopago.js         # cliente de la API de Mercado Pago
│
├── qa/
│   ├── test-plan.md           # plan de pruebas (incluye TC-180–TC-193 de concurrencia y carga)
│   └── load-test.js           # suite de carga y concurrencia sin dependencias
│
└── docs/
    ├── SUPABASE_AUTH.md        # notas sobre el modelo de auth con Supabase
    └── flows/
        ├── flow-checkout.md
        ├── flow-admin-assistant.md
        ├── flow-despliegue-produccion.md
        └── flow-concurrencia-carga.md   # capas de defensa ante carga y concurrencia
```

> El repo trae además documentación propia: `README.md`, `ARCHITECTURE.md`, `QUICKSTART.md`,
> `CHANGELOG.md`, `VERIFICATION_CHECKLIST.md`. Este documento las complementa con una vista
> verificada contra el código actual.

---

## 4. Arquitectura (MVC por capas)

```
HTTP request
   │
   ▼
routes/*           → define método + path, aplica middlewares
   │
   ▼
middleware/*       → authMiddleware (JWT→user_id→rol) + adminMiddleware (rol === 'admin')
   │
   ▼
controllers/*      → validación de input, orquestación, forma de la respuesta { success, data, ... }
   │
   ▼
models/User.js  ó  pool.query(...)   → acceso a PostgreSQL/Supabase
   │
   ▼
config/database.js → Pool de conexiones pg
```

- **Separación de capas**: routes → controllers → (models | pool). Los controllers no definen
  rutas; los models encapsulan SQL de `profiles`. **Excepción**: `productController` y
  `cloudinaryController` ejecutan `pool.query` / llamadas HTTP directamente (no usan una capa
  model dedicada).
- **Respuesta consistente**: todas las respuestas siguen `{ success: boolean, ... }`
  (`data`, `message`, `count/total/limit/offset` en listados).
- **Arranque ordenado** (`server.js`): primero `connectDB()` (con reintentos), recién entonces
  `app.listen`. Si la BD no conecta, el proceso sale con código 1.

---

## 5. Endpoints

### 5.1 Usuarios — `/api/users` (`userRoutes.js` → `userController.js`)
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/users/signup-status/:email` | pública | Estado de rate-limit de signup (solo lectura). |
| POST | `/api/users/signup-ratelimit` | pública | Registra que Supabase devolvió rate-limit para un email. Body `{ email }`. |
| POST | `/api/users/login` | pública | Login "de referencia": busca por email en `profiles`/`auth.users`. **No valida password** (ver §10/§11). |
| GET | `/api/users/auth/:userId` | pública | Usuario por Supabase Auth ID. |
| GET | `/api/users` | pública | Lista de perfiles (paginada `?limit&offset`, máx 100). |
| POST | `/api/users` | pública | Legacy/obsoleto: devuelve nota de "crear vía Supabase Auth". |
| GET | `/api/users/:id` | pública | Perfil por id. |
| PUT | `/api/users/:id` | pública | Actualiza `name`/`role` (transacción, valida rol ∈ {user,admin}). |
| DELETE | `/api/users/:id` | pública | Borra de `profiles` **y** `auth.users` (transacción). |

> ⚠️ Estas rutas de usuarios **no tienen `authMiddleware`**: hoy son públicas (cualquiera puede
> listar, editar rol o borrar usuarios). Ver §10.

### 5.2 Productos — `/api/products` (`productRoutes.js` → `productController.js`)
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/products` | pública | Lista paginada (`?limit&offset`, máx 100), `ORDER BY created_at DESC`. |
| GET | `/api/products/:id` | pública | Producto por id. |
| POST | `/api/products` | **Bearer + admin** | Crea producto. Requiere `name` y `price`. |
| PUT | `/api/products/:id` | **Bearer + admin** | Update dinámico (solo campos presentes). |
| DELETE | `/api/products/:id` | **Bearer + admin** | Borra producto y su imagen en Cloudinary (best-effort). |

Body de create/update (camelCase → columnas snake_case): `name`, `price`, `stock`, `category`,
`imageUrl`/`images[]` (se sincroniza `image_url` con la primera), `publicId`, `description`,
`discount` (admite null), `condition` (`new`/`used`), `freeShipping`, `variants`,
`specifications`, `features`, `faqs` (JSONB), `warranty`, `returnPolicy`, `status`.

### 5.3 Cloudinary — `/api/cloudinary` (`cloudinaryRoutes.js` → `cloudinaryController.js`)
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/cloudinary/config` | pública | `{ cloudName, apiKey }`. |
| GET | `/api/cloudinary/images` | pública | Lista recursos (`?folder&next_cursor`, Admin API). |
| GET | `/api/cloudinary/folders` | pública | Lista carpetas (`?path`). |
| POST | `/api/cloudinary/folders` | pública | Crea carpeta. Body `{ path }`. |
| DELETE | `/api/cloudinary/folders` | pública | Borra carpeta. Body `{ path }`. |
| POST | `/api/cloudinary/sign` | pública | Firma SHA1 de los params recibidos + `CLOUDINARY_API_SECRET`. |
| POST | `/api/cloudinary/delete` | pública | Borra imagen. Body `{ publicId }`. |

### 5.4 Utilidades
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Info de la API (`{ message, version }`). |
| GET | `/health` | Health check (`{ status: 'OK' }`). |
| (cualquiera) | `*` | 404 `{ success:false, message:'Ruta no encontrada' }`. |

---

## 6. Autenticación y autorización

- **Origen del token**: el frontend obtiene el JWT de **Supabase Auth** y lo manda en
  `Authorization: Bearer <token>`.
- **`authMiddleware`**: hace `jwt.decode(token)` (**sin verificar firma**), toma `decoded.sub`
  como user id, y consulta `SELECT id, role, name FROM public.profiles WHERE id = $1`. Si existe,
  setea `req.user = { id, name, role }`.
- **`adminMiddleware`**: debe ir después de `authMiddleware`; exige `req.user.role === 'admin'`
  (403 si no).
- Hoy **solo `/api/products` (POST/PUT/DELETE)** usa esta cadena. El resto de mutaciones
  (usuarios) están sin protección.

---

## 7. Modelo de datos (PostgreSQL / Supabase)

Acceso directo con `pg` al Postgres de Supabase (esquemas `public` y `auth`).

| Tabla | Esquema | Uso en el backend |
|---|---|---|
| `profiles` | public | `id UUID` (FK → `auth.users.id`, ON DELETE CASCADE), `name`, `role` (`user`/`admin`), `created_at`. RLS habilitada; política "Users see their profile". Índice `idx_profiles_role`. |
| `auth.users` | auth | gestionada por Supabase Auth; se lee (`email`, `email_confirmed_at`) y se borra en cascada al eliminar perfil. |
| `productos` | public | CRUD vía `productController`. Columnas (incluidas por `init-db`): `name`, `price`, `stock`, `category`, `image_url`, `public_id`, `description`, `discount NUMERIC(5,2)`, `condition`, `free_shipping`, `variants/specifications/features/faqs/images JSONB`, `warranty`, `return_policy`, `status`, `featured`, `created_at`, `updated_at`. |
| `carousel_images` | public | creada por `init-db` (`id`, `url`, `order`, `is_active`, `created_at`). La escribe el frontend directo; el backend solo la crea. |

**Trigger** (`init-db`): `on_auth_user_created` → `handle_new_user()` inserta una fila en
`profiles` (rol `user`) cada vez que se crea un usuario en `auth.users`.

> El esquema "fuente de verdad" lo administra Supabase; `init-db` es idempotente
> (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) y sirve para alinear una BD nueva.

---

## 8. Configuración (variables de entorno)

Definidas en `.env` (plantilla en `.env.example`). El backend usa **conexión directa a Postgres**
(`DB_*`), no `SUPABASE_URL`/`SUPABASE_KEY`.

| Variable | Requerida | Uso |
|---|---|---|
| `NODE_ENV` | — | `development`/`production` (controla verbosidad de errores). |
| `PORT` | — | Puerto HTTP (default `3000`). |
| `DB_HOST` | ✅ | Host de Postgres/Supabase. |
| `DB_PORT` | ✅ | Puerto (típicamente `5432`). |
| `DB_USER` | ✅ | Usuario (`postgres`). |
| `DB_PASSWORD` | ✅ | **Secreto.** Password de la BD. |
| `DB_NAME` | ✅ | Base (`postgres`). |
| `FRONTEND_URL` | ✅ (recomendada) | Allowlist de CORS (coma-separada). Default `http://localhost:5173`. |
| `CLOUDINARY_CLOUD_NAME` | ✅ (Cloudinary) | Cloud name. |
| `CLOUDINARY_API_KEY` | ✅ (Cloudinary) | API key. |
| `CLOUDINARY_API_SECRET` | ✅ (Cloudinary) | **Secreto.** Para firmar/borrar. |
| `SUPABASE_URL` | ✅ (auth) | Proyecto Supabase contra el que `authMiddleware` verifica los access tokens. Sin ella, toda ruta protegida falla. |
| `SUPABASE_ANON_KEY` | ✅ (auth) | Anon key usada en la verificación del token y en `userController`. |
| `MP_ACCESS_TOKEN` | ✅ (Mercado Pago) | **Secreto.** Sin ella, `/api/orders/mp-*` responde **503**; la transferencia bancaria sigue funcionando. |
| `MP_WEBHOOK_URL` | — | URL pública del webhook (`https://…/api/orders/mp-webhook`). En local no aplica salvo que expongas el backend por túnel. |

### 8.1 Concurrencia, carga y caché (opcionales)

Todas tienen default productivo; se listan para poder ajustar sin tocar código.
Detalle del mecanismo en [`docs/flows/flow-concurrencia-carga.md`](docs/flows/flow-concurrencia-carga.md).

| Variable | Default | Uso |
|---|---|---|
| `DB_POOL_MAX` | `12` | Conexiones máximas del pool. **Techo real: 15** — el pooler de Supabase en modo sesión responde `EMAXCONNSESSION` al pasarse. |
| `DB_POOL_MIN` | `2` | Conexiones tibias para no pagar handshake en cada pico. |
| `DB_IDLE_TIMEOUT_MS` | `30000` | Cierre de conexiones ociosas. |
| `DB_CONNECTION_TIMEOUT_MS` | `5000` | Espera máxima por una conexión del pool. |
| `DB_STATEMENT_TIMEOUT_MS` | `10000` | Corta queries colgadas del lado del servidor Postgres. |
| `DB_QUERY_TIMEOUT_MS` | `10000` | Ídem del lado del cliente `pg`. |
| `MAX_CONCURRENT_REQUESTS` | `DB_POOL_MAX × 2` | Handlers simultáneos admitidos (bulkhead). |
| `MAX_QUEUED_REQUESTS` | `200` | Cola de espera; al llenarse se responde **503 + `Retry-After`**. |
| `QUEUE_TIMEOUT_MS` | `8000` | Espera máxima en cola antes de devolver 503. |
| `CACHE_TTL_PRODUCTS_SECONDS` | `20` | Caché del catálogo. `0` la desactiva. Se invalida sola ante cambios de producto/stock. |
| `CACHE_TTL_INSIGHTS_SECONDS` | `60` | Caché de la analítica admin. |
| `CACHE_TTL_AUTH_SECONDS` | `30` | Caché de verificación de token. ⚠️ Un token revocado sigue siendo válido como máximo este tiempo. |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error`. |

`GET /health` expone en vivo el estado del pool, del bulkhead, del rate limit y de las cachés.

> El pool de `pg` usa `ssl: { rejectUnauthorized: false }`.
>
> CORS (`config/cors.js`): en `NODE_ENV != production` se acepta **cualquier** origen
> `localhost` / `127.0.0.1` en cualquier puerto (Vite salta a 5174 si 5173 está ocupado),
> además de la allowlist de `FRONTEND_URL`. En producción, solo la allowlist.

---

## 9. Cómo levantar el proyecto

Requisito: **Node 22.x** (`.nvmrc` y `engines.node`).

```powershell
# Desde la raíz del repo backend
cd "BACK/lia-store"

# 1. Instalar dependencias
npm install

# 2. Crear .env a partir de .env.example y completar:
#    DB_* · FRONTEND_URL · CLOUDINARY_* · SUPABASE_URL · SUPABASE_ANON_KEY · MP_ACCESS_TOKEN

# 3. (Solo en una BD nueva) alinear el esquema — idempotente
npm run init-db

# 4. Levantar
npm run dev      # nodemon, recarga al guardar
npm start        # node server.js (producción)
```

Queda escuchando en **http://localhost:3000**, con la API bajo **`/api`**.

```powershell
# Verificación rápida
curl http://localhost:3000/health      # → { "status": "OK" }
```

Al arrancar, `server.js` primero conecta a Postgres (`connectDB`): si la BD no responde, el
proceso **sale con código 1** y no levanta el servidor. Además arranca el sweep de órdenes
(`expireStaleOrders`) cada 60 s, que expira las pendientes vencidas y restaura stock.

### 9.1 Levantar el stack completo (backend + frontend)

Dos terminales, una por proceso:

```powershell
# Terminal 1 — backend (http://localhost:3000, API en /api)
cd "BACK/lia-store"; npm run dev

# Terminal 2 — frontend (http://localhost:5173)
cd "FRONT/damiana-bella"; npm run dev
```

El frontend vive en `../../FRONT/damiana-bella` (repo git propio) y apunta acá con
`VITE_API_URL_LOCAL=http://localhost:3000/api`.

### 9.2 Problemas frecuentes en local

| Síntoma | Causa probable | Solución |
|---|---|---|
| El proceso sale con `❌ No se pudo iniciar el servidor` | `DB_*` mal, proyecto Supabase pausado o sin red | Revisar credenciales; despausar el proyecto en Supabase |
| `503` en `/api/orders/mp-preference` o `mp-confirm` | Falta `MP_ACCESS_TOKEN` | Cargarlo en `.env` y reiniciar |
| `401` en rutas protegidas con un token válido | Faltan `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Cargarlas en `.env` y reiniciar |
| El navegador bloquea las requests por CORS | Front en un origen no permitido con `NODE_ENV=production` | Usar `NODE_ENV=development` en local o sumar el origen a `FRONTEND_URL` (CSV, sin espacios) |
| `relation "profiles" does not exist` | BD nueva sin esquema | `npm run init-db` |
| El front pega a un puerto que nadie escucha | Vite tomó 5174 y/o `VITE_API_URL_LOCAL` desactualizada | Verificar el puerto real que imprime Vite y la URL del `.env.local` del front |

> **Antes de integrar contratos con el frontend, leé la §11.**

---

## 10. Riesgos de seguridad detectados (a revisar)

> Hallazgos verificados en el código actual. No los corregí (la tarea era documentar), pero
> conviene tratarlos antes de producción. Referencia: `../../skill/04-security.md`.

1. **JWT sin verificación de firma** (`authMiddleware.js`): usa `jwt.decode`, no `jwt.verify`.
   Cualquiera puede forjar un token con un `sub` arbitrario; si ese `sub` existe en `profiles`
   con rol `admin`, obtiene acceso admin. **Debe verificarse la firma** contra el JWKS/secret de
   Supabase.
2. **Rutas de usuarios sin auth**: `GET/PUT/DELETE /api/users(/:id)` son públicas → listar
   usuarios, **cambiar roles** (escalada de privilegios) y borrar cuentas sin autenticación.
3. **Credenciales reales en `.env.example`**: incluye `DB_HOST` real y `DB_PASSWORD` en claro.
   Si el repo es/llega a ser público, la BD queda expuesta. **Rotar la password** y dejar la
   plantilla con valores vacíos/placeholder.
4. **`CLOUDINARY_*` ausentes en `.env.example`**: el código las usa pero no están documentadas
   en la plantilla → arranque/firmas fallan silenciosamente.
5. **Logging sensible**: `authMiddleware` y `cloudinaryController` hacen `console.log` de tokens
   (parciales) y firmas. Quitar en producción.
6. **`login` no valida password**: `POST /api/users/login` devuelve datos del usuario solo con
   el email (la comparación de hash está comentada). No usar como mecanismo de autenticación.

---

## 11. Discrepancias con el frontend actual (importante)

El frontend en `../../FRONT/damiana-bella` migró a un **esquema de auth con JWT propio** y usa
endpoints que **este backend no implementa**. Es decir, **este backend corresponde a una versión
anterior** (auth basada en el token de Supabase). Lo que el front llama y acá **falta**:

- **Auth propia (`/api/auth/*`)**: `register`, `login`, `logout`, `me`, `refresh`,
  `confirm-email`, `resend-confirmation`, `forgot-password`, `reset-password`, `change-password`.
  Acá la auth vive en `/api/users` con otro contrato.
- **Órdenes/pagos (`/api/orders/*`)**: `mp-preference` (Mercado Pago), `user?email=`,
  `:id/cancel`, `:id/confirm-transfer`, `:id/cancel-transfer`. **No existen.**
- **Envíos (`/api/shipping`)**: cálculo por código postal. **No existe.**
- **`/api/cloudinary/usage`**: el front lo consume; acá no está implementado (sí están
  `config`, `images`, `folders`, `sign`, `delete`).

Además, en el código actual hay **referencias rotas**: `userController.loginUser` llama a
`User.findByEmail` y `getUserByAuthId` llama a `User.findByUserId`, pero **esos métodos no
existen** en `models/User.js` (solo `findById`, `findAll`, `findByIdAndUpdate`,
`findByIdAndDelete`). Esas rutas lanzarían error en runtime.

> **Conclusión:** para que este backend sirva al frontend actual hay que **alinear contratos**
> (implementar auth JWT, orders, shipping, cloudinary/usage y proteger las rutas de usuarios), o
> bien reemplazar este backend por el que el frontend espera. Esto **excede** la tarea de
> documentar: queda señalado como decisión pendiente.

---

## 12. Patrones y buenas prácticas detectadas

- **SQL parametrizado** en todos los `pool.query` (productos, usuarios) → mitiga inyección SQL.
- **Transacciones** (`BEGIN/COMMIT/ROLLBACK`) en update/delete de usuarios.
- **Pool de conexiones** configurado (max 20, timeouts) y `connectDB` con reintentos + diagnóstico.
- **Update dinámico** de productos (solo persiste campos presentes en el body).
- **Respuesta uniforme** `{ success, ... }` y paginación con `limit/offset` (máx 100).
- **CORS con allowlist** por `FRONTEND_URL` (no `*`).
- **Errores genéricos al cliente en producción** (`NODE_ENV`), detalle solo en dev.
- **`init-db` idempotente** para alinear esquema sin romper datos existentes.

---

## 13. Skills senior

El contrato de calidad senior se carga automáticamente vía [CLAUDE.md](CLAUDE.md), que importa
los skills compartidos desde `../../skill/`. Para backend aplican principalmente: `00-role`,
`01-backend`, `03-testing-qa`, `04-security`, `06-restrictions`, `07-senior-rules`,
`08-delivery-format`, `09-protocols`, `10-documentation`, más `11-bug-hunter` y `12-judge-architect`.
