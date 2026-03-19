/**
 * Guía Rápida de Inicio
 * 
 * Este archivo contiene instrucciones paso a paso para empezar con el proyecto
 */

# 🚀 INICIO RÁPIDO - LIA E-COMMERCE

## 1️⃣ Instalación

```bash
# Instalar dependencias
npm install
```

## 2️⃣ Configurar Variables de Entorno

Copia `.env.example` a `.env`:

```bash
cp .env.example .env
```

O crea manualmente `.env` con:

```env
NODE_ENV=development
PORT=3000

# Supabase PostgreSQL
DB_HOST=db.nakhbsncabvwyrezhfsf.supabase.co
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=abj3wp9rfZGmVc2g
DB_NAME=postgres

FRONTEND_URL=http://localhost:5173
```

## 3️⃣ Inicializar Base de Datos

```bash
npm run init-db
```

Esto crea:
- Tabla `profiles`
- Índices para búsquedas rápidas
- Triggers para timestamps

## 4️⃣ Iniciar el Servidor

```bash
# Desarrollo (con reinicio automático)
npm run dev

# Producción
npm start
```

El servidor estará en: `http://localhost:3000`

---

## 🧪 Probar la API

### Ver que funciona
```bash
curl http://localhost:3000/health
```

### Obtener usuarios (vacío al inicio)
```bash
curl http://localhost:3000/api/users
```

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

---

## 📁 Estructura del Proyecto

```
lia-ecommerce/
├── config/
│   ├── database.js          ← Conexión PostgreSQL
│   ├── initDatabase.js      ← Crear tablas
│   └── migrateData.js       ← Migrar datos (opcional)
├── controllers/
│   └── userController.js    ← Lógica de usuarios
├── middleware/
│   └── authMiddleware.js    ← Autenticación
├── models/
│   └── User.js              ← Interfaz con BD
├── routes/
│   └── userRoutes.js        ← Endpoints
├── docs/
│   └── SUPABASE_AUTH.md     ← Guía de autenticación
├── server.js                ← Servidor Express
├── .env                     ← Configuración (no versionar)
├── .env.example             ← Template de .env
├── package.json
└── README.md
```

---

## 🔑 Endpoints Principales

```
POST   /api/users/login                  Iniciar sesión
GET    /api/users                        Listar usuarios
GET    /api/users/:id                    Obtener usuario
GET    /api/users/auth/:userId           Obtener por Supabase ID
POST   /api/users                        Crear usuario
PUT    /api/users/:id                    Actualizar usuario
DELETE /api/users/:id                    Eliminar usuario
```

---

## ⚠️ Problemas Comunes

### "Error: connect ECONNREFUSED"
- Verifica que Supabase está activo
- Revisa las credenciales en `.env`
- Comprueba conexión a internet

### "Error: relation "profiles" does not exist"
```bash
npm run init-db
```

### "Error: password authentication failed"
- Verifica `DB_PASSWORD` en `.env`
- El usuario default es `postgres`

---

## 📚 Documentación

- **[README.md](README.md)** - Documentación completa
- **[CHANGELOG.md](CHANGELOG.md)** - Registro de cambios
- **[docs/SUPABASE_AUTH.md](docs/SUPABASE_AUTH.md)** - Integración Supabase

---

## 🎯 Próximos Pasos

1. ✅ Servidor corriendo
2. 📁 Tablas creadas
3. 👤 Usuarios creados
4. 🔐 Integrar Supabase Auth (ver docs/SUPABASE_AUTH.md)
5. 📦 Crear tabla de Productos
6. 🛒 Crear tabla de Órdenes

---

¡Listo para desarrollar! 🚀
