/**
 * Script de Migración: MongoDB → PostgreSQL
 * 
 * IMPORTANTE: Este es un ejemplo/referencia. Ajusta según tus datos.
 * 
 * Pasos para migrar datos de MongoDB a PostgreSQL:
 * 
 * 1. Exportar datos de MongoDB:
 *    mongoexport --uri="your_mongodb_uri" --collection=users --out=users.json
 * 
 * 2. Procesar el archivo JSON con este script
 * 
 * 3. Verificar que los datos se insertaron correctamente
 * 
 * USO: node config/migrateData.js
 */

require('dotenv').config();
const { pool } = require('./database');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// NOTA: Instala uuid si no lo tienes
// npm install uuid

const migrateData = async () => {
  const client = await pool.connect();

  try {
    console.log('📊 Iniciando migración de datos...\n');

    // Leer archivo JSON exportado de MongoDB
    const mongoDataPath = path.join(__dirname, '../data/users.json');

    if (!fs.existsSync(mongoDataPath)) {
      console.log('⚠️  Archivo users.json no encontrado. Creando datos de ejemplo...\n');
      
      // Datos de ejemplo para prueba
      const exampleUsers = [
        {
          name: 'Usuario Demo 1',
          email: 'demo1@example.com',
          role: 'user'
        },
        {
          name: 'Admin Demo',
          email: 'admin@example.com',
          role: 'admin'
        },
        {
          name: 'Usuario Demo 2',
          email: 'demo2@example.com',
          role: 'user'
        }
      ];

      await migrateUsers(client, exampleUsers);
    } else {
      const mongoData = JSON.parse(fs.readFileSync(mongoDataPath, 'utf-8'));
      console.log(`📂 Leyendo ${mongoData.length} registros de MongoDB...\n`);
      
      await migrateUsers(client, mongoData);
    }

    console.log('\n✅ Migración completada exitosamente');

  } catch (error) {
    console.error('❌ Error durante la migración:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

/**
 * Migrar usuarios de MongoDB a PostgreSQL
 */
const migrateUsers = async (client, users) => {
  const migrationStats = {
    successful: 0,
    failed: 0,
    errors: []
  };

  for (const mongoUser of users) {
    try {
      // Validar datos necesarios
      if (!mongoUser.name || !mongoUser.email) {
        throw new Error('name y email son requeridos');
      }

      // Generar UUID para user_id (simulando Supabase Auth)
      const userId = mongoUser.user_id || uuidv4();

      // Preparar datos para PostgreSQL
      const userData = {
        user_id: userId,
        name: mongoUser.name.trim().slice(0, 100), // Limitar a 100 caracteres
        email: mongoUser.email.toLowerCase().trim(),
        role: (mongoUser.role && ['user', 'admin'].includes(mongoUser.role)) 
          ? mongoUser.role 
          : 'user'
      };

      // Insertar en PostgreSQL
      const result = await client.query(
        `INSERT INTO profiles (user_id, name, email, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         role = EXCLUDED.role
         RETURNING id, user_id, name, email, role`,
        [userData.user_id, userData.name, userData.email, userData.role]
      );

      migrationStats.successful++;
      console.log(`✓ ${userData.email} - Migrado exitosamente`);

    } catch (error) {
      migrationStats.failed++;
      migrationStats.errors.push({
        user: mongoUser.email || 'desconocido',
        error: error.message
      });
      console.log(`✗ ${mongoUser.email || 'Usuario'} - Error: ${error.message}`);
    }
  }

  // Resumen de migración
  console.log('\n' + '='.repeat(50));
  console.log('📋 RESUMEN DE MIGRACIÓN');
  console.log('='.repeat(50));
  console.log(`✓ Exitosos: ${migrationStats.successful}`);
  console.log(`✗ Fallidos: ${migrationStats.failed}`);

  if (migrationStats.errors.length > 0) {
    console.log('\n❌ Errores encontrados:');
    migrationStats.errors.forEach(err => {
      console.log(`  - ${err.user}: ${err.error}`);
    });
  }

  console.log('='.repeat(50) + '\n');
};

// Ejecutar si se llama directamente
if (require.main === module) {
  migrateData();
}

module.exports = migrateData;

/**
 * NOTAS IMPORTANTES:
 * 
 * 1. CAMPOS QUE CAMBIARON:
 *    - MongoDB: _id (ObjectId) → PostgreSQL: id (UUID)
 *    - MongoDB: createdAt → PostgreSQL: created_at
 *    - No hay password directamente (usa Supabase Auth)
 * 
 * 2. DATOS QUE SE PIERDEN:
 *    - Si tenías _id de MongoDB, genera nuevos UUIDs
 *    - Si tenías timestamps, se crean nuevos con current_at
 *    - Si tenías contraseñas hasheadas, debes resetearlas con Supabase
 * 
 * 3. Si tienes más campos personalizados:
 *    - Añade columnas a la tabla profiles
 *    - Actualiza el query INSERT
 * 
 * 4. Ejemplo de estructura MongoDB vs PostgreSQL:
 * 
 *    MongoDB:
 *    {
 *      "_id": ObjectId("..."),
 *      "name": "Juan",
 *      "email": "juan@example.com",
 *      "password": "hashed_pwd",
 *      "role": "user",
 *      "createdAt": ISODate("2024-01-15T10:30:00Z")
 *    }
 *    
 *    PostgreSQL:
 *    id | user_id | name | email | role | created_at | updated_at
 *    ---|---------|------|-------|------|------------|----------
 *    (UUID) | (UUID) | Juan | juan@... | user | 2024-01-15 | 2024-01-15
 */
