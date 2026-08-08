-- 2026-08-08 — Índices de soporte para las consultas calientes bajo concurrencia.
--
-- Sin estos índices, cada lectura del panel/asistente y cada "Mis compras" hace
-- un Seq Scan sobre `ventas`: con la tabla chica no se nota, pero el costo crece
-- linealmente con las ventas y se multiplica por cada usuario simultáneo.
--
-- Todos son IF NOT EXISTS: la migración es idempotente y se puede correr de nuevo
-- sin efecto. Ejecutar en el SQL Editor de Supabase.
--
-- Nota: si la tabla ya es grande en producción, correr cada CREATE INDEX con
-- CONCURRENTLY por separado (fuera de transacción) para no bloquear escrituras.

-- "Mis compras": filtro por email (case-insensitive) + estado, ordenado por fecha.
CREATE INDEX IF NOT EXISTS idx_ventas_buyer_email_status_created
  ON public.ventas (LOWER(buyer_email), payment_status, created_at DESC);

-- Sweep de expiración y panel de pendientes: filtro por estado + método + fecha.
CREATE INDEX IF NOT EXISTS idx_ventas_status_method_created
  ON public.ventas (payment_status, payment_method, created_at);

-- Analítica del asistente: ventas pagadas por fecha (hoy / mes en curso) y
-- agregación por producto. El índice parcial mantiene chico el árbol, porque
-- todas esas consultas filtran por payment_status = 'pagado'.
CREATE INDEX IF NOT EXISTS idx_ventas_paid_created
  ON public.ventas (created_at DESC, product_id)
  WHERE payment_status = 'pagado';

-- Retiros en local pendientes de despacho (insights + panel de Despachos).
CREATE INDEX IF NOT EXISTS idx_ventas_shipping_dispatch
  ON public.ventas (shipping_method, dispatch_status, created_at);

-- Catálogo: orden por fecha de alta (listado paginado del backend).
CREATE INDEX IF NOT EXISTS idx_productos_created_at
  ON public.productos (created_at DESC, id DESC);

-- Reposición / stock bajo: productos activos ordenados por stock.
CREATE INDEX IF NOT EXISTS idx_productos_active_stock
  ON public.productos (stock ASC)
  WHERE COALESCE(status, 'active') = 'active';

-- Baja de producto: chequeo de imagen compartida por public_id.
CREATE INDEX IF NOT EXISTS idx_productos_public_id
  ON public.productos (public_id)
  WHERE public_id IS NOT NULL AND public_id <> '';
