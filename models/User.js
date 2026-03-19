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
   * Obtener todos los usuarios
   */
  static async findAll(limit = 50, offset = 0) {
    try {
      const query = `
        SELECT 
          p.id, 
          p.name, 
          p.role, 
          p.created_at,
          u.email,
          u.email_confirmed_at
        FROM public.profiles p
        LEFT JOIN auth.users u ON p.id = u.id
        ORDER BY p.created_at DESC 
        LIMIT $1 OFFSET $2
      `;
      const result = await pool.query(query, [limit, offset]);
      
      const countQuery = 'SELECT COUNT(*) as count FROM public.profiles';
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

      const query = 'DELETE FROM public.profiles WHERE id = $1 RETURNING id, name';
      const result = await client.query(query, [id]);

      if (result.rows.length === 0) {
        throw new Error('Usuario no encontrado');
      }

      // También eliminar de auth.users para borrar completamente la cuenta
      await client.query('DELETE FROM auth.users WHERE id = $1', [id]);

      await client.query('COMMIT');
      return result.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Error al eliminar usuario: ${error.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = User;
