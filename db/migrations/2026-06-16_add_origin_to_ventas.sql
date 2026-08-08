-- Migración: agrega la columna `origin` a public.ventas.
-- Registra la respuesta del nudge post-WhatsApp del checkout por transferencia.
--
--   null               → el cliente no respondió el nudge (o pagó por Mercado Pago)
--   'wa_confirmado'    → "Sí, ya envié el comprobante"
--   'wa_sin_confirmar' → "Todavía no lo envié" (sigue pendiente, stock retenido)
--   'wa_abandonado'    → "No, cancelar mi pedido" (orden cancelada + stock restaurado)
--
-- Idempotente: se puede correr más de una vez sin error.
-- Correr en el SQL editor de Supabase (la tabla `ventas` vive en Supabase).

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS origin text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ventas_origin_check'
  ) THEN
    ALTER TABLE public.ventas
      ADD CONSTRAINT ventas_origin_check
      CHECK (origin IS NULL OR origin IN ('wa_confirmado', 'wa_sin_confirmar', 'wa_abandonado'));
  END IF;
END $$;

COMMENT ON COLUMN public.ventas.origin IS
  'Respuesta del nudge post-WhatsApp (checkout transferencia). null = sin responder.';
