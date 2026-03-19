const dotenv = require('dotenv');
// Cargar variables de entorno ANTES de importar módulos que las usen
dotenv.config();

const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/database');
const userRoutes = require('./routes/userRoutes');
const cloudinaryRoutes = require('./routes/cloudinaryRoutes');
const productRoutes = require('./routes/productRoutes');

const app = express();

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    const allowed = (process.env.FRONTEND_URL || 'http://localhost:5173')
      .split(',')
      .map(u => u.trim());
    // Allow requests with no origin (Postman, curl, same-origin)
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas
app.use('/api/users', userRoutes);
app.use('/api/cloudinary', cloudinaryRoutes);
app.use('/api/products', productRoutes);

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
  } catch (error) {
    console.error('\n❌ No se pudo iniciar el servidor:');
    console.error(error.message);
    process.exit(1);
  }
})();
