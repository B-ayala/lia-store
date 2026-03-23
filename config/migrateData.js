/**
 * Script de migración MongoDB → PostgreSQL.
 *
 * USO: node config/migrateData.js
 *
 * Requiere un archivo data/users.json exportado de MongoDB:
 *   mongoexport --uri="<uri>" --collection=users --out=users.json
 *
 * Si el archivo no existe, se insertan usuarios de ejemplo.
 */

require('dotenv').config();
const { pool } = require('./database');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const migrateData = async () => {
  const client = await pool.connect();

  try {
    console.log('📊 Iniciando migración de datos...\n');

    const mongoDataPath = path.join(__dirname, '../data/users.json');

    if (!fs.existsSync(mongoDataPath)) {
      console.log('⚠️  Archivo users.json no encontrado. Creando datos de ejemplo...\n');

      const exampleUsers = [
        { name: 'Usuario Demo 1', email: 'demo1@example.com', role: 'user' },
        { name: 'Admin Demo', email: 'admin@example.com', role: 'admin' },
        { name: 'Usuario Demo 2', email: 'demo2@example.com', role: 'user' }
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

const migrateUsers = async (client, users) => {
  const migrationStats = {
    successful: 0,
    failed: 0,
    errors: []
  };

  for (const mongoUser of users) {
    try {
      if (!mongoUser.name || !mongoUser.email) {
        throw new Error('name y email son requeridos');
      }

      const userId = mongoUser.user_id || uuidv4();

      const userData = {
        user_id: userId,
        name: mongoUser.name.trim().slice(0, 100),
        email: mongoUser.email.toLowerCase().trim(),
        role: (mongoUser.role && ['user', 'admin'].includes(mongoUser.role))
          ? mongoUser.role
          : 'user'
      };

      await client.query(
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

if (require.main === module) {
  migrateData();
}

module.exports = migrateData;
