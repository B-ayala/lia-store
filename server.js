const dotenv = require('dotenv');
// Cargar variables de entorno ANTES de importar módulos que las usen
dotenv.config();

const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/database');
const { corsOptions } = require('./config/cors');
const userRoutes = require('./routes/userRoutes');
const cloudinaryRoutes = require('./routes/cloudinaryRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const shippingRoutes = require('./routes/shippingRoutes');
const insightsRoutes = require('./routes/insightsRoutes');
const { expireStaleOrders } = require('./controllers/orderController');

const app = express();

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas
app.use('/api/users', userRoutes);
app.use('/api/cloudinary', cloudinaryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/admin/insights', insightsRoutes);

// Ruta base
app.get('/', (req, res) => {
  res.json({ 
    message: 'API MVC con Node.js y PostgreSQL/Supabase',
    version: '1.0.0'
  });
});

// Ruta de health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    message: 'Ruta no encontrada' 
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Error interno del servidor' 
      : err.message
  });
});

const PORT = process.env.PORT || 3000;
const ORDER_SWEEP_INTERVAL_MS = 60 * 1000;

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason instanceof Error ? reason.message : reason);
});

// Iniciar servidor solo después de conectar a BD
(async () => {
  try {
    // Conectar a PostgreSQL/Supabase
    await connectDB();

    app.listen(PORT, () => {
      console.log(`\n✅ Servidor iniciado correctamente`);
      console.log(`🚀 Escuchando en puerto ${PORT}`);
      console.log(`📝 Base de datos: PostgreSQL/Supabase`);
      console.log(`🔗 URL local: http://localhost:${PORT}\n`);
    });

    // Expira órdenes pendientes vencidas (MP 15 min, transferencia 5 h)
    setInterval(expireStaleOrders, ORDER_SWEEP_INTERVAL_MS);
    expireStaleOrders();
  } catch (error) {
    console.error('\n❌ No se pudo iniciar el servidor:');
    console.error(error.message);
    process.exit(1);
  }
})();
