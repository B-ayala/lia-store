# Guía de Integración con Supabase Auth

Esta guía te ayudará a integrar completamente Supabase Authentication en tu proyecto.

## 🔐 Flujo de Autenticación Recomendado

```
Usuario → Supabase Auth (signup/login) → JWT Token
   ↓
Backend → Valida Token → Crea/Actualiza Perfil en profiles
   ↓
Usuario Autenticado + Datos en PostgreSQL
```

## 📦 Instalación de Supabase Client (Opcional)

Si quieres usar el cliente oficial de Supabase en el backend:

```bash
npm install @supabase/supabase-js
```

## 🚀 Configuración en el Servidor

### 1. Crear archivo `config/supabase.js`

```javascript
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
```

### 2. Actualizar `.env`

```env
SUPABASE_URL=https://nakhbsncabvwyrezhfsf.supabase.co
SUPABASE_KEY=tu_supabase_anon_key
SUPABASE_SERVICE_KEY=tu_service_role_key (solo servidor)
```

## 🔄 Endpoints para Autenticación

### Registro de Usuario

```javascript
// controllers/authController.js
exports.register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // 1. Crear usuario en Supabase Auth
    const { data, error } = await supabase.auth.signUpWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    // 2. Crear perfil en profiles table
    const user = await User.create({
      user_id: data.user.id,
      name,
      email,
      role: 'user'
    });

    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
```

### Login de Usuario

```javascript
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Autenticar con Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({
        success: false,
        message: 'Email o contraseña incorrectos'
      });
    }

    // Obtener perfil del usuario
    const user = await User.findByUserId(data.user.id);

    res.status(200).json({
      success: true,
      data: {
        user: user,
        session: data.session,
        access_token: data.session.access_token
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
```

### Logout

```javascript
exports.logout = async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(200).json({
      success: true,
      message: 'Sesión cerrada exitosamente'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
```

## 🛡️ Middleware de Autenticación

```javascript
// middleware/supabaseAuth.js
const supabase = require('../config/supabase');

const verifySupabaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Token requerido'
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verificar token con Supabase
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({
        success: false,
        message: 'Token inválido o expirado'
      });
    }

    // Obtener perfil del usuario
    const user = await User.findByUserId(data.user.id);

    req.user = {
      id: user.id,
      user_id: data.user.id,
      email: data.user.email,
      role: user.role
    };

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = verifySupabaseToken;
```

## 📋 Rutas con Autenticación

```javascript
const express = require('express');
const router = express.Router();
const verifySupabaseToken = require('../middleware/supabaseAuth');
const { getProfile, updateProfile } = require('../controllers/profileController');

// Rutas protegidas
router.get('/me', verifySupabaseToken, getProfile);
router.put('/me', verifySupabaseToken, updateProfile);

module.exports = router;
```

## 🎯 Casos de Uso en E-commerce

### Crear Pedido (Protegido)
```javascript
router.post('/orders', verifySupabaseToken, createOrder);
// req.user.id es el ID del perfil
// req.user.user_id es el ID de Supabase Auth
```

### Obtener Mis Pedidos
```javascript
exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user_profile_id: req.user.id });
    res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
```

## 🔒 RLS (Row Level Security) en Supabase

Para mayor seguridad, puedes usar Políticas de Seguridad a Nivel de Fila:

```sql
-- Ver solo tu propio perfil
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Actualizar solo tu propio perfil
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Solo admins pueden ver todos
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'admin' OR
    (SELECT role FROM profiles WHERE user_id = auth.uid()) = 'admin'
  );
```

## 📝 Ejemplo Completo de Registro

```javascript
// POST /api/auth/register
exports.register = async (req, res) => {
  const { email, password, name } = req.body;

  // 1. Validar datos
  if (!email || !password || !name) {
    return res.status(400).json({
      success: false,
      message: 'Email, contraseña y nombre son requeridos'
    });
  }

  // 2. Crear usuario en Supabase Auth
  const { data, error } = await supabase.auth.signUpWithPassword({
    email,
    password
  });

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }

  // 3. Crear perfil en PostgreSQL
  const user = await User.create({
    user_id: data.user.id,
    name,
    email,
    role: 'user'
  });

  // 4. Éxito
  res.status(201).json({
    success: true,
    message: 'Registro exitoso',
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
};
```

## 🔗 Relaciones entre Tablas

Para un e-commerce, tu estructura podría verse así:

```
auth.users (Supabase Managed)
    ↓ (user_id)
profiles (PostgreSQL)
    ↓ (profile_id)
├── orders
├── cart_items
├── addresses
└── wishlist_items

products (catálogo público)
orders
├── (profile_id) → profiles
└── order_items
    └── (product_id) → products
```

## 🚀 Despliegue

Cuando despliegues el proyecto:

1. Configura variables de entorno en tu plataforma (Railway, Render, etc.)
2. Asegúrate de tener las claves correctas de Supabase
3. Ejecuta `npm run init-db` en tu servidor
4. Verifica la conexión a PostgreSQL

## 📚 Recursos Adicionales

- [Documentación de Supabase Auth](https://supabase.com/docs/guides/auth)
- [Guía de RLS](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL JWT](https://supabase.com/docs/guides/auth#jwt-tokens)

---

¡Tu aplicación está lista para usar Supabase Authentication! ✨
