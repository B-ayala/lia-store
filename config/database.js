const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: false
  },
  // Configuración del pool
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

let isConnected = false;

// Verificar conexión
pool.on('connect', () => {
  console.log(`📡 PostgreSQL conectado a ${process.env.DB_HOST}:${process.env.DB_PORT}`);
});

pool.on('error', (err) => {
  console.error('❌ Error en el pool de PostgreSQL:', err.message);
  isConnected = false;
});

const connectDB = async (retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect();
      console.log('✓ Conexión a PostgreSQL/Supabase establecida correctamente');
      
      // Verificar que la tabla profiles existe
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'profiles'
        );
      `);
      
      if (!tableCheck.rows[0].exists) {
        console.warn('⚠️ Tabla profiles no existe. Ejecuta: npm run init-db');
      } else {
        console.log('✓ Tabla profiles verificada');
      }
      
      client.release();
      isConnected = true;
      return pool;
    } catch (error) {
      console.error(`\n❌ Intento de conexión ${attempt}/${retries} fallido:`);
      console.error(`   Host: ${process.env.DB_HOST}`);
      console.error(`   Port: ${process.env.DB_PORT}`);
      console.error(`   Usuario: ${process.env.DB_USER}`);
      console.error(`   Mensaje: ${error.message || 'Sin mensaje'}`);
      console.error(`   Código: ${error.code || 'UNKNOWN'}`);
      if (error.detail) console.error(`   Detalle: ${error.detail}`);
      
      if (attempt < retries) {
        console.log(`   ⏳ Reintentando en 2 segundos...\n`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.error(`\n❌ No se pudo conectar a PostgreSQL después de ${retries} intentos`);
        console.error('\n📋 Checklist de diagnóstico:');
        console.error('   1. ¿Supabase está disponible? → https://status.supabase.com');
        console.error('   2. ¿El archivo .env existe? → Verifica c:/Users/Brian/Desktop/DamianaBella/lia-ecommerce/.env');
        console.error('   3. ¿Las credenciales son correctas?');
        console.error(`      - DB_HOST: ${process.env.DB_HOST}`);
        console.error(`      - DB_PORT: ${process.env.DB_PORT}`);
        console.error(`      - DB_USER: ${process.env.DB_USER}`);
        console.error(`      - DB_NAME: ${process.env.DB_NAME}`);
        console.error('   4. ¿La contraseña es correcta? → Verifica en Supabase Dashboard');
        console.error('   5. ¿Hay problema de red? → Intenta ping a Supabase');
        isConnected = false;
        throw error;
      }
    }
  }
};

// Verificar estado de conexión
const isDBConnected = () => {
  return isConnected;
};

module.exports = { connectDB, pool, isDBConnected };
