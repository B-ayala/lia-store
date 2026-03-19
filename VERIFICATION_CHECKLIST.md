# ✅ Checklist Post-Migración

Esta guía te ayuda a verificar que la migración se completó exitosamente.

## 📦 Fase 1: Instalación

- [ ] Ejecuté `npm install` sin errores
- [ ] El archivo `package.json` NO contiene `mongoose`
- [ ] El archivo `package.json` contiene `pg`

## 🔧 Fase 2: Configuración

- [ ] Creé/actualicé el archivo `.env` con:
  - [ ] `DB_HOST=db.nakhbsncabvwyrezhfsf.supabase.co`
  - [ ] `DB_PORT=5432`
  - [ ] `DB_USER=postgres`
  - [ ] `DB_PASSWORD=abj3wp9rfZGmVc2g`
  - [ ] `DB_NAME=postgres`
  - [ ] `PORT=3000`
  - [ ] `FRONTEND_URL=http://localhost:5173`

- [ ] El archivo `.env` está en `.gitignore`
- [ ] El archivo `.env.example` existe como plantilla

## 🗄️ Fase 3: Base de Datos

- [ ] Ejecuté `npm run init-db` sin errores
- [ ] La tabla `profiles` fue creada
- [ ] Los índices fueron creados (idx_profiles_email, idx_profiles_user_id)
- [ ] El trigger para `updated_at` se creó

### Verificar en Supabase Console:
1. Ve a https://app.supabase.com
2. Selecciona tu proyecto
3. Ve a SQL Editor
4. Ejecuta:
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public';
   ```
5. Deberías ver: `profiles`

## 🚀 Fase 4: Iniciar Servidor

- [ ] Ejecuté `npm run dev` sin errores
- [ ] El servidor se inicia en `http://localhost:3000`
- [ ] Console muestra `✓ Conexión a PostgreSQL/Supabase establecida`

## 🧪 Fase 5: Testing API

### Endpoint Health Check
```bash
curl http://localhost:3000/health
```
- [ ] Retorna: `{"status":"OK"}`

### Listar Usuarios (vacío al inicio)
```bash
curl http://localhost:3000/api/users
```
- [ ] Status: 200
- [ ] Retorna: `{"success":true,"count":0,"data":[]}`

### Crear Usuario
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Test User",
    "email": "test@example.com",
    "role": "user"
  }'
```
- [ ] Status: 201
- [ ] Retorna usuario con `id`, `user_id`, `name`, `email`, `role`, `created_at`

### Obtener Usuario Creado
```bash
curl http://localhost:3000/api/users/[ID_DEL_USUARIO]
```
- [ ] Status: 200
- [ ] Retorna los datos del usuario

### Buscar por Email
```bash
curl http://localhost:3000/api/users?search=test@example.com
```
- [ ] (Nota: Este endpoint depende si lo implementó)

### Actualizar Usuario
```bash
curl -X PUT http://localhost:3000/api/users/[ID_DEL_USUARIO] \
  -H "Content-Type: application/json" \
  -d '{"role":"admin"}'
```
- [ ] Status: 200
- [ ] El rol se actualiza a "admin"

### Eliminar Usuario
```bash
curl -X DELETE http://localhost:3000/api/users/[ID_DEL_USUARIO]
```
- [ ] Status: 200
- [ ] Retorna confirmación de eliminación

## 📋 Fase 6: Verificar Archivos

### Archivos Actualizados
- [ ] `package.json` - sin mongoose, con pg
- [ ] `server.js` - usa config/database
- [ ] `config/database.js` - conexión PostgreSQL
- [ ] `models/User.js` - SQL directo, no Mongoose
- [ ] `controllers/userController.js` - usa User model SQL
- [ ] `routes/userRoutes.js` - incluye ruta /auth/:userId
- [ ] `.env` - variables PostgreSQL

### Archivos Nuevos
- [ ] `config/initDatabase.js` - existe y es ejecutable
- [ ] `config/migrateData.js` - existe (para migración futura)
- [ ] `middleware/authMiddleware.js` - existe
- [ ] `docs/SUPABASE_AUTH.md` - existe y documentado
- [ ] `.gitignore` - actualizado
- [ ] `README.md` - actualizado
- [ ] `CHANGELOG.md` - documentación de cambios
- [ ] `QUICKSTART.md` - guía rápida
- [ ] `ARCHITECTURE.md` - diagrama de arquitectura

## 🔐 Fase 7: Seguridad

- [ ] `.env` está en `.gitignore` (no versionado)
- [ ] Credenciales de Supabase NO están en código fuente
- [ ] Las queries usan parámetrizadas ($1, $2, etc)
- [ ] No hay contraseñas en texto plano en la BD

## 📚 Fase 8: Documentación

Verificar que leíste:
- [ ] `README.md` - configuración y endpoints
- [ ] `QUICKSTART.md` - inicio rápido
- [ ] `CHANGELOG.md` - qué cambió
- [ ] `ARCHITECTURE.md` - arquitectura del proyecto
- [ ] `docs/SUPABASE_AUTH.md` - integración Supabase Auth

## 🔄 Fase 9: Validación Completa

Ejecuta este script para verificar todo:

```bash
#!/bin/bash

echo "🔍 Verificando migración..."
echo ""

# Verificar archivos críticos
echo "📁 Verificando archivos..."
files=(
  "package.json"
  "server.js"
  "config/database.js"
  "config/initDatabase.js"
  "models/User.js"
  "controllers/userController.js"
  "routes/userRoutes.js"
  ".env"
  ".env.example"
  ".gitignore"
  "README.md"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✓ $file"
  else
    echo "  ✗ $file FALTA"
  fi
done

echo ""

# Verificar node_modules
if [ -d "node_modules/pg" ]; then
  echo "✓ pg instalado"
else
  echo "✗ pg NO instalado"
fi

if [ -d "node_modules/mongoose" ]; then
  echo "✗ mongoose TODAVÍA INSTALADO (debería eliminarse)"
else
  echo "✓ mongoose eliminado"
fi

echo ""
echo "✅ Verificación completada"
```

Guárdalo como `verify.sh`, hazlo ejecutable: `chmod +x verify.sh`, y corre: `./verify.sh`

## 🎯 Fase 10: Pasos Siguientes

- [ ] Leer `docs/SUPABASE_AUTH.md` para integrar autenticación completa
- [ ] Diseñar tabla de Productos para e-commerce
- [ ] Diseñar tabla de Órdenes
- [ ] Implementar Carrito de compras
- [ ] Integrar pasarela de pagos (Stripe/MercadoPago)
- [ ] Configurar CORS correctamente para producción

## ⚠️ Troubleshooting

### Si obtienes "Error: connect ECONNREFUSED"
```
1. Verifica que Supabase está online
2. Comprueba credenciales en .env
3. Revisa tu conexión a internet
```

### Si obtienes "Error: relation 'profiles' does not exist"
```
Ejecuta: npm run init-db
```

### Si el servidor no inicia
```
1. Verifica que el puerto 3000 está disponible
2. Revisa los logs en la consola
3. Asegúrate de que npm install completó sin errores
```

### Si la BD retorna errores raros
```
Acción nuclear (perderás datos):
1. Ve a Supabase Console
2. Copia todas las data importante
3. Query: DROP TABLE profiles;
4. Ejecuta: npm run init-db
```

## 📞 Contacto y Soporte

Si hay problemas:
1. Revisa la consola del servidor (npm run dev)
2. Revisa el navegador (F12 → Network, Console)
3. Verifica credenciales en `.env`
4. Lee ARCHITECTURE.md para entender el flujo

---

**Estado de la Migración**: ✅ COMPLETA  
**Fecha**: Marzo 2026  

¡Si pasaste todas las fases, el proyecto está listo para producción! 🚀
