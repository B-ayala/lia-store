const dotenv = require('dotenv');
// dotenv.config() debe ir ANTES de importar cualquier módulo que lea process.env
dotenv.config();

const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/database');
const userRoutes = require('./routes/userRoutes');
const cloudinaryRoutes = require('./routes/cloudinaryRoutes');
const productRoutes = require('./routes/productRoutes');
const ordersRoutes = require('./routes/ordersRoutes');
const shippingRoutes = require('./routes/shippingRoutes');

const app = express();

app.use(cors({
  origin: function (origin, callback) {
    const allowed = (process.env.FRONTEND_URL || 'http://localhost:5173')
      .split(',')
      .map(u => u.trim());
    // Permitir requests sin origin (Postman, curl, mismo origen)
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/users', userRoutes);
app.use('/api/cloudinary', cloudinaryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/shipping', shippingRoutes);

app.get('/', (req, res) => {
  res.json({
    message: 'API MVC con Node.js y PostgreSQL/Supabase',
    version: '1.0.0'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada'
  });
});

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

(async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`\n✅ Servidor iniciado correctamente`);
      console.log(`🚀 Escuchando en puerto ${PORT}`);
      console.log(`📝 Base de datos: PostgreSQL/Supabase`);
      console.log(`🔗 URL local: http://localhost:${PORT}\n`);
    });
  } catch (error) {
    console.error('\n❌ No se pudo iniciar el servidor:');
    console.error(error.message);
    process.exit(1);
  }
})();
