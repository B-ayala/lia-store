const User = require('../models/User');
const { getStatus, recordRateLimit } = require('../middleware/signupTracker');

/**
 * @desc    Login de usuario
 * @route   POST /api/users/login
 * @note    Con Supabase Auth, el login debe manejarse en el frontend o a través de Supabase
 *          Este endpoint es para validar credenciales contra Supabase
 */
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email y contraseña son requeridos'
      });
    }

    const user = await User.findByEmail(email);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Nota: Supabase maneja la autenticación, pero si necesitas validar
    // contraseña contra hash en PostgreSQL:
    // const isPasswordValid = User.comparePassword(password, user.password_hash);
    // if (!isPasswordValid) { ... }

    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error en loginUser:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Obtener todos los usuarios
 * @route   GET /api/users
 * @query   ?limit=50&offset=0
 */
exports.getUsers = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    const result = await User.findAll(limit, offset);

    res.status(200).json({
      success: true,
      count: result.users.length,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      data: result.users
    });
  } catch (error) {
    console.error('Error en getUsers:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Obtener un usuario por ID
 * @route   GET /api/users/:id
 */
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario requerido'
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error en getUserById:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Crear un nuevo usuario
 * @route   POST /api/users
 * @note    Con Supabase Auth, el usuario se crea en el frontend y el trigger
 *          automáticamente crea el perfil en public.profiles
 *          Este endpoint es obsoleto pero se mantiene para compatibilidad
 */
exports.createUser = async (req, res) => {
  try {
    // Con Supabase Auth + trigger, el usuario y su perfil se crean automáticamente
    // Este endpoint no debería usarse normalmente
    
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'name y email son requeridos'
      });
    }

    // El usuario ya debería estar creado en Supabase Auth
    // y su perfil ya debería existir gracias al trigger
    // Este endpoint es solo una referencia legacy
    res.status(200).json({
      success: true,
      message: 'Usuario debe ser creado a través de Supabase Auth en el frontend',
      data: {
        name,
        email,
        role: 'user',
        note: 'Usar supabase.auth.signUp() en el frontend'
      }
    });
  } catch (error) {
    console.error('Error en createUser:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Actualizar un usuario
 * @route   PUT /api/users/:id
 * @body    {name, email, role}
 */
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario requerido'
      });
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debe proporcionar al menos un campo para actualizar'
      });
    }

    const user = await User.findByIdAndUpdate(id, updateData);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Usuario actualizado exitosamente',
      data: user
    });
  } catch (error) {
    console.error('Error en updateUser:', error);
    
    // Detectar error de email duplicado
    if (error.message.includes('ya está en uso')) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }

    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Eliminar un usuario
 * @route   DELETE /api/users/:id
 */
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario requerido'
      });
    }

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Usuario eliminado correctamente',
      data: user
    });
  } catch (error) {
    console.error('Error en deleteUser:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Leer estado de rate limit para un email (sin modificar nada)
 * @route   GET /api/users/signup-status/:email
 */
exports.signupStatus = (req, res) => {
  const { email } = req.params;
  if (!email) return res.status(400).json({ success: false, message: 'Email requerido' });
  return res.status(200).json({ success: true, ...getStatus(decodeURIComponent(email)) });
};

/**
 * @desc    Registrar que Supabase devolvió rate limit para un email
 * @route   POST /api/users/signup-ratelimit
 * @body    { email: string }
 */
exports.signupRateLimit = (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email requerido' });
  return res.status(200).json({ success: true, ...recordRateLimit(email) });
};

/**
 * @desc    Obtener usuario por user_id (Supabase Auth ID)
 * @route   GET /api/users/auth/:userId
 */
exports.getUserByAuthId = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario requerido'
      });
    }

    const user = await User.findByUserId(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error en getUserByAuthId:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
