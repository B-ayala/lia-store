const { pool } = require('../config/database');

class User {
  /**
   * Encontrar usuario por ID (UUID de Supabase)
   * Con Supabase, el ID es el UUID de auth.users
   */
  static async findById(id) {
    try {
      const query = `
        SELECT 
          p.id, 
          p.name, 
          p.role, 
          p.created_at,
          u.email
        FROM public.profiles p
        LEFT JOIN auth.users u ON p.id = u.id
        WHERE p.id = $1
      `;
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      throw new Error(`Error al buscar usuario por ID: ${error.message}`);
    }
  }

  /**
   * Encontrar usuario por email (en auth.users de Supabase)
   */
  static async findByEmail(email) {
    try {
      const query = `
        SELECT
          p.id,
          p.name,
          p.role,
          p.created_at,
          u.email
        FROM public.profiles p
        LEFT JOIN auth.users u ON p.id = u.id
        WHERE LOWER(u.email) = LOWER($1)
      `;
      const result = await pool.query(query, [email]);
      return result.rows[0] || null;
    } catch (error) {
      throw new Error(`Error al buscar usuario por email: ${error.message}`);
    }
  }

  /**
   * Encontrar usuario por el ID de Supabase Auth.
   * Con el esquema actual profiles.id ES el id de auth.users, así que
   * equivale a findById; se mantiene por el contrato de /api/users/auth/:userId.
   */
  static async findByUserId(userId) {
    return User.findById(userId);
  }

  /**
   * Obtener todos los usuarios
   */
  static async findAll(limit = 50, offset = 0) {
    try {
      // Listar desde auth.users (fuente de verdad de las cuentas) para que una
      // cuenta sin perfil siga siendo visible y administrable desde el panel.
      const query = `
        SELECT
          u.id,
          p.name,
          COALESCE(p.role, 'user') AS role,
          COALESCE(p.created_at, u.created_at) AS created_at,
          u.email,
          u.email_confirmed_at
        FROM auth.users u
        LEFT JOIN public.profiles p ON p.id = u.id
        ORDER BY COALESCE(p.created_at, u.created_at) DESC
        LIMIT $1 OFFSET $2
      `;
      const result = await pool.query(query, [limit, offset]);

      const countQuery = 'SELECT COUNT(*) as count FROM auth.users';
      const countResult = await pool.query(countQuery);
      
      return {
        users: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit,
        offset
      };
    } catch (error) {
      throw new Error(`Error al obtener usuarios: ${error.message}`);
    }
  }

  /**
   * NOTA: Crear usuario debe hacerse a través de Supabase Auth en el frontend
   * El trigger automáticamente crea el perfil en public.profiles
   */
  static async create(userData) {
    throw new Error(
      'La creación de usuarios debe hacerse a través de Supabase Auth en el frontend. ' +
      'El trigger automáticamente crea el perfil en public.profiles'
    );
  }

  /**
   * Actualizar perfil de usuario
   */
  static async findByIdAndUpdate(id, updateData) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const { name, role } = updateData;
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        if (name.length > 100) {
          throw new Error('El nombre no puede tener más de 100 caracteres');
        }
        updates.push(`name = $${paramCount}`);
        values.push(name.trim());
        paramCount++;
      }

      if (role !== undefined) {
        if (!['user', 'admin'].includes(role)) {
          throw new Error('El rol debe ser "user" o "admin"');
        }
        updates.push(`role = $${paramCount}`);
        values.push(role);
        paramCount++;
      }

      if (updates.length === 0) {
        throw new Error('Debe proporcionar al menos un campo para actualizar (name o role)');
      }

      values.push(id);
      const query = `
        UPDATE public.profiles 
        SET ${updates.join(', ')} 
        WHERE id = $${paramCount}
        RETURNING id, name, role, created_at
      `;

      const result = await client.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Usuario no encontrado');
      }

      await client.query('COMMIT');
      return result.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Error al actualizar usuario: ${error.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Eliminar usuario
   */
  static async findByIdAndDelete(id) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Borrado defensivo del perfil (por si no hubiera FK con ON DELETE CASCADE).
      const profileResult = await client.query(
        'DELETE FROM public.profiles WHERE id = $1 RETURNING name',
        [id]
      );

      // Fuente de verdad: la cuenta de auth. Sin esto el email queda "ocupado"
      // y el signup falla con "ya registrado" aunque el perfil ya no exista.
      const authResult = await client.query(
        'DELETE FROM auth.users WHERE id = $1 RETURNING id, email',
        [id]
      );

      if (authResult.rowCount === 0 && profileResult.rowCount === 0) {
        throw new Error('Usuario no encontrado');
      }

      await client.query('COMMIT');
      return {
        id,
        name: profileResult.rows[0]?.name ?? authResult.rows[0]?.email ?? null
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Error al eliminar usuario: ${error.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = User;
