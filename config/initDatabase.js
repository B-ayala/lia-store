require('dotenv').config();
const { pool } = require('./database');

const initDatabase = async () => {
  const client = await pool.connect();

  try {
    console.log('🔧 Inicializando estructura de base de datos...\n');

    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
      );
    `);

    if (!tableExists.rows[0].exists) {
      console.log('📋 Tabla profiles no existe. Creando...');

      // Esta tabla normalmente la crea el trigger de Supabase Auth automáticamente.
      // El id referencia auth.users(id) — no usar UUID autogenerado acá.
      await client.query(`
        CREATE TABLE IF NOT EXISTS profiles (
          id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
          name VARCHAR(100),
          role VARCHAR(10) DEFAULT 'user' CHECK (role IN ('user','admin')),
          created_at TIMESTAMP DEFAULT now(),
          UNIQUE(id)
        );
      `);
      console.log('✓ Tabla profiles creada');
    } else {
      console.log('✓ Tabla profiles ya existe en Supabase');

      const columns = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'profiles' AND table_schema = 'public'
        ORDER BY ordinal_position;
      `);

      console.log('  Columnas:');
      columns.rows.forEach(col => {
        console.log(`    - ${col.column_name} (${col.data_type})`);
      });
    }

    console.log('\n🔐 Verificando Row Level Security...');
    await client.query(`
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    `);
    console.log('✓ RLS habilitado en profiles');

    const policies = await client.query(`
      SELECT policyname
      FROM pg_policies
      WHERE tablename = 'profiles';
    `);

    if (policies.rows.length === 0) {
      console.log('📋 Creando política RLS...');
      await client.query(`
        CREATE POLICY "Users see their profile"
        ON public.profiles
        FOR SELECT
        USING (auth.uid() = id);
      `);
      console.log('✓ Política RLS creada');
    } else {
      console.log(`✓ Política RLS ya existe: ${policies.rows.map(p => p.policyname).join(', ')}`);
    }

    console.log('\n⚙️ Verificando función y trigger...');
    const functionExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'handle_new_user'
      );
    `);

    if (!functionExists.rows[0].exists) {
      console.log('📋 Creando función handle_new_user...');
      await client.query(`
        CREATE OR REPLACE FUNCTION public.handle_new_user()
        RETURNS trigger AS $$
        BEGIN
          INSERT INTO public.profiles (id, role)
          VALUES (NEW.id, 'user');
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
      `);
      console.log('✓ Función handle_new_user creada');
    } else {
      console.log('✓ Función handle_new_user ya existe');
    }

    const triggerExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'on_auth_user_created'
      );
    `);

    if (!triggerExists.rows[0].exists) {
      console.log('📋 Creando trigger on_auth_user_created...');
      await client.query(`
        DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
        CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_new_user();
      `);
      console.log('✓ Trigger on_auth_user_created creado');
    } else {
      console.log('✓ Trigger on_auth_user_created ya existe');
    }

    console.log('\n📊 Verificando índices...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
    `);
    console.log('✓ Índices verificados');

    console.log('\n🖼️  Verificando tabla carousel_images...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.carousel_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        url TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);
    console.log('✓ Tabla carousel_images verificada');

    console.log('\n📦 Verificando columnas de la tabla productos...');
    const productosExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'productos'
      );
    `);

    if (productosExists.rows[0].exists) {
      const alteraciones = [
        `ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS description TEXT`,
        `ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS discount NUMERIC(5,2)`,
        `ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS condition VARCHAR(10) DEFAULT 'new'`,
        `ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS free_shipping BOOLEAN DEFAULT false`,
        `ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS variants JSONB`,
        `ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS specifications JSONB`,
        `ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS features JSONB`,
        `ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS faqs JSONB`,
        `ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS warranty TEXT`,
        `ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS return_policy TEXT`,
        `ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS images JSONB`,
        `ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false`,
      ];
      for (const sql of alteraciones) {
        await client.query(sql);
      }
      console.log('✓ Columnas de productos verificadas/agregadas');
    } else {
      console.log('ℹ️  Tabla productos no encontrada (se crea desde Supabase)');
    }

    console.log('\n🛒 Verificando tabla pedidos...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.pedidos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id TEXT,
        product_name TEXT NOT NULL,
        product_image TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price NUMERIC(10,2) NOT NULL,
        total_price NUMERIC(10,2) NOT NULL,
        units_config JSONB,
        payment_method TEXT DEFAULT 'pending',
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','confirmed','shipped','delivered','cancelled')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pedidos_status ON public.pedidos(status);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON public.pedidos(created_at DESC);
    `);
    console.log('✓ Tabla pedidos verificada');

    console.log('\n✅ Base de datos inicializada correctamente');
    console.log('📌 Ahora puedes usar el servidor con: npm run dev');

  } catch (error) {
    console.error('\n❌ Error al inicializar la base de datos:');
    console.error(`   Mensaje: ${error.message}`);
    console.error(`   Código: ${error.code}`);
    if (error.detail) console.error(`   Detalle: ${error.detail}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

if (require.main === module) {
  initDatabase();
}

module.exports = initDatabase;
