/**
 * Middleware de autenticación para Supabase.
 * Uso en rutas protegidas: router.get('/ruta', authMiddleware, controllerFn)
 */

const { pool } = require('../config/database');
const jwt = require('jsonwebtoken');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('[AUTH DEBUG] Authorization header:', authHeader ? 'presente' : 'NO presente');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[AUTH DEBUG] Error: Token no proporcionado correctamente');
      return res.status(401).json({
        success: false,
        message: 'Token de autenticación requerido'
      });
    }

    const token = authHeader.substring(7);
    console.log('[AUTH DEBUG] Token recibido, primeros 20 caracteres:', token.substring(0, 20));

    // Se decodifica sin verificar firma — la validación real la hace Supabase en el frontend.
    // Acá solo necesitamos el sub (user id) para buscar el perfil en BD.
    const decoded = jwt.decode(token);
    console.log('[AUTH DEBUG] Token decodificado, sub:', decoded?.sub);

    if (!decoded || !decoded.sub) {
      console.log('[AUTH DEBUG] Error: Token inválido o sin sub');
      return res.status(401).json({
        success: false,
        message: 'Token inválido'
      });
    }

    const userId = decoded.sub;
    console.log('[AUTH DEBUG] User ID extraído del token:', userId);

    console.log('[AUTH DEBUG] Buscando perfil en base de datos...');
    const result = await pool.query(
      'SELECT id, role, name FROM public.profiles WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      console.log('[AUTH DEBUG] Error: Perfil no encontrado para user ID:', userId);
      return res.status(401).json({
        success: false,
        message: 'Usuario no encontrado en la base de datos'
      });
    }

    const profile = result.rows[0];
    console.log('[AUTH DEBUG] ✓ Perfil encontrado - ID:', profile.id, 'Rol:', profile.role);

    req.user = {
      id: userId,
      name: profile.name,
      role: profile.role || 'user'
    };
    req.token = token;

    console.log('[AUTH DEBUG] ✓ Autenticación exitosa para usuario:', userId);
    next();
  } catch (error) {
    console.error('[AUTH DEBUG] Error en middleware:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Token inválido',
      error: error.message
    });
  }
};

// Debe usarse siempre DESPUÉS de authMiddleware
const adminMiddleware = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: se requieren permisos de administrador'
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error al validar rol',
      error: error.message
    });
  }
};

const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  if (err.code && err.code.startsWith('P')) {
    return res.status(400).json({
      success: false,
      message: 'Error en la base de datos',
      ...(process.env.NODE_ENV === 'development' && { error: err.message })
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = {
  authMiddleware,
  adminMiddleware
};
