```
╔════════════════════════════════════════════════════════════════════════════╗
║                           ARQUITECTURA MIGRADA                             ║
║                      MongoDB → PostgreSQL/Supabase                         ║
╚════════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React/Vue/etc)                            │
│                        Port 5173 (Vite Dev Server)                          │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ HTTP/REST API
                                │
┌───────────────────────────────▼─────────────────────────────────────────────┐
│                         EXPRESS.JS SERVER                                    │
│                              (Port 3000)                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─ ROUTES ─────────────────────────────────────────────────────────────┐  │
│  │  POST   /api/users/login          →  loginUser()                     │  │
│  │  GET    /api/users                →  getUsers()                      │  │
│  │  GET    /api/users/:id            →  getUserById()                   │  │
│  │  GET    /api/users/auth/:userId   →  getUserByAuthId()              │  │
│  │  POST   /api/users                →  createUser()                    │  │
│  │  PUT    /api/users/:id            →  updateUser()                    │  │
│  │  DELETE /api/users/:id            →  deleteUser()                    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                  ▼                                          │
│  ┌─ MIDDLEWARE ──────────────────────────────────────────────────────────┐ │
│  │  • cors()                         CORS Headers                         │ │
│  │  • express.json()                 Parse JSON Request                  │ │
│  │  • authMiddleware()               JWT Validation (Supabase)           │ │
│  │  • errorHandler()                 Error Handling                      │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                  ▼                                          │
│  ┌─ CONTROLLERS ─────────────────────────────────────────────────────────┐ │
│  │  userController.js               Lógica de Negocio                    │ │
│  │  ├─ Validaciones                                                      │ │
│  │  ├─ Llamadas a Modelos                                               │ │
│  │  └─ Respuestas HTTP                                                   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                  ▼                                          │
│  ┌─ MODELS ─────────────────────────────────────────────────────────────┐  │
│  │  User.js                         Interfaz DB                          │  │
│  │  ├─ findByEmail()                [SELECT * WHERE email]              │  │
│  │  ├─ findById()                   [SELECT * WHERE id]                 │  │
│  │  ├─ findByUserId()               [SELECT * WHERE user_id]            │  │
│  │  ├─ findAll()                    [SELECT * LIMIT OFFSET]             │  │
│  │  ├─ create()                     [INSERT INTO]                       │  │
│  │  ├─ findByIdAndUpdate()          [UPDATE SET]                        │  │
│  │  └─ findByIdAndDelete()          [DELETE]                            │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                  ▼                                          │
│  ┌─ CONFIG ──────────────────────────────────────────────────────────────┐ │
│  │  database.js                     Pool de Conexiones PostgreSQL        │ │
│  │  ├─ Host: db.nakhbsncabvwyrezhfsf.supabase.co                        │ │
│  │  ├─ Port: 5432                                                       │ │
│  │  ├─ SSL: true (requerido para Supabase)                             │ │
│  │  └─ Pool: 10 conexiones simultáneas                                 │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ SQL Queries (TCP/5432)
                                   │
┌──────────────────────────────────▼──────────────────────────────────────────┐
│                      POSTGRESQL/SUPABASE                                     │
│                                                                              │
│  ┌─ auth.users (Supabase Managed) ───────────────────────────────────────┐ │
│  │  id           | UUID                                                  │ │
│  │  email        | VARCHAR                                               │ │
│  │  password     | encrypted                                             │ │
│  │  created_at   | TIMESTAMP                                             │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                               ▲                                              │
│                               │ Referencia (user_id)                        │
│  ┌─ public.profiles ─────────┘ ────────────────────────────────────────────┐ │
│  │                                                                          │ │
│  │  id         | UUID PRIMARY KEY (auto)                                   │ │
│  │  user_id    | UUID UNIQUE (foreign key → auth.users)                   │ │
│  │  name       | VARCHAR(100) NOT NULL                                    │ │
│  │  email      | VARCHAR(255) NOT NULL UNIQUE                             │ │
│  │  role       | VARCHAR(20) DEFAULT 'user' ['user' | 'admin']           │ │
│  │  created_at | TIMESTAMP DEFAULT NOW()                                  │ │
│  │  updated_at | TIMESTAMP DEFAULT NOW() (auto update via trigger)        │ │
│  │                                                                         │ │
│  │  Índices:                                                              │ │
│  │  - idx_profiles_email   (email)                                        │ │
│  │  - idx_profiles_user_id (user_id)                                      │ │
│  │                                                                         │ │
│  │  Triggers:                                                             │ │
│  │  - update_profiles_updated_at   (actualiza updated_at antes de UPDATE) │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘


╔════════════════════════════════════════════════════════════════════════════╗
║                         FLUJO DE AUTENTICACIÓN                              ║
╚════════════════════════════════════════════════════════════════════════════╝

REGISTRO (Sign Up):
  1. Frontend → Supabase Auth         (email, password)
  2. Supabase crea user en auth.users (genera UUID)
  3. Frontend → Backend API           (user_id, name, email, role)
  4. Backend inserta en profiles      (vincula user_id con datos adicionales)
  5. ✅ Usuario registrado y perfilado

LOGIN:
  1. Frontend → Supabase Auth         (email, password)
  2. Supabase retorna JWT Token
  3. Frontend → Backend API (con JWT)
  4. Backend valida token con Supabase
  5. Backend retorna datos del usuario (name, role)
  6. ✅ Sesión iniciada


╔════════════════════════════════════════════════════════════════════════════╗
║                       OPERACIONES CRUD - EJEMPLOS                          ║
╚════════════════════════════════════════════════════════════════════════════╝

CREATE:
  POST /api/users
  { "user_id": "uuid", "name": "Juan", "email": "juan@...", "role": "user" }
  ↓
  INSERT INTO profiles (user_id, name, email, role) VALUES (...)
  ↓ Retorna: { id, user_id, name, email, role, created_at }

READ:
  GET /api/users/:id
  ↓
  SELECT id, user_id, name, email, role, created_at, updated_at FROM profiles WHERE id = $1
  ↓ Retorna: Objeto del usuario

UPDATE:
  PUT /api/users/:id
  { "name": "Juan Actualizado", "role": "admin" }
  ↓
  UPDATE profiles SET name = $1, role = $2, updated_at = NOW() WHERE id = $3
  ↓ Retorna: Objeto actualizado

DELETE:
  DELETE /api/users/:id
  ↓
  DELETE FROM profiles WHERE id = $1
  ↓ Retorna: { id, user_id, name, email } (confirmación)


╔════════════════════════════════════════════════════════════════════════════╗
║                    CAMBIOS PRINCIPALES DE ESTRUCTURA                       ║
╚════════════════════════════════════════════════════════════════════════════╝

ANTES (MongoDB + Mongoose):
  ├── modelo User = Schema de Mongoose
  ├── consultas = User.find(), User.findOne(), User.create()
  ├── IDs = ObjectId (_id)
  ├── tipos = números, strings, fechas como en Mongoose
  └── autenticación = password hasheado en la BD

DESPUÉS (PostgreSQL + Nativo):
  ├── modelo User = Clase con métodos estáticos
  ├── consultas = pool.query() con SQL directo
  ├── IDs = UUID
  ├── tipos = SQL estándar (VARCHAR, TIMESTAMP, UUID)
  └── autenticación = Supabase Auth maneja todo


╔════════════════════════════════════════════════════════════════════════════╗
║                       ESCALABILIDAD FUTURA                                 ║
╚════════════════════════════════════════════════════════════════════════════╝

Para escalar a e-commerce completo, añade estas tablas:

  products
  ├── id (UUID)
  ├── name, description, price, stock
  ├── category_id (FK)
  └── images (JSON o tabla separada)

  categories
  ├── id (UUID)
  ├── name
  └── slug

  orders
  ├── id (UUID)
  ├── user_id (FK → profiles)
  ├── status, total, created_at
  └── items (JSON o tabla separada)

  order_items
  ├── id (UUID)
  ├── order_id (FK → orders)
  ├── product_id (FK → products)
  ├── quantity, price_at_purchase

  cart_items
  ├── id (UUID)
  ├── user_id (FK → profiles)
  ├── product_id (FK → products)
  └── quantity


╔════════════════════════════════════════════════════════════════════════════╗
║                        SEGURIDAD Y MEJORES PRÁCTICAS                       ║
╚════════════════════════════════════════════════════════════════════════════╝

✅ Parametrizadas:    Todas las queries usan $1, $2 (previene SQL injection)
✅ Transacciones:     Operaciones críticas usan BEGIN/COMMIT/ROLLBACK
✅ Validaciones:      Validaciones en modelo antes de insertar
✅ Autenticación:     Supabase Auth maneja contraseñas de forma segura
✅ CORS:              Configurado para origen específico
✅ Variables secretas: .env no se versiona (.gitignore)
✅ Índices:           Optimize búsquedas (email, user_id)
✅ RLS:               Supabase soporta Row Level Security (opcional)
```

