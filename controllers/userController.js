const User = require('../models/User');
const { getStatus, recordRateLimit } = require('../middleware/signupTracker');

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

// Endpoint legacy — el usuario se crea vía supabase.auth.signUp() en el frontend.
// El trigger on_auth_user_created crea el perfil automáticamente en public.profiles.
exports.createUser = async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'name y email son requeridos'
      });
    }

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

exports.signupStatus = (req, res) => {
  const { email } = req.params;
  if (!email) return res.status(400).json({ success: false, message: 'Email requerido' });
  return res.status(200).json({ success: true, ...getStatus(decodeURIComponent(email)) });
};

exports.signupRateLimit = (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email requerido' });
  return res.status(200).json({ success: true, ...recordRateLimit(email) });
};

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
