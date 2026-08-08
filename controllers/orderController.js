const crypto = require('crypto');
const { pool } = require('../config/database');
const Order = require('../models/Order');
const mercadopago = require('../utils/mercadopago');
const { caches, invalidateProducts } = require('../utils/cache');
const logger = require('../utils/logger');

// Ventanas de expiración — deben coincidir con las que muestra el frontend
// (MP_EXPIRY_MS / TRANSFER_EXPIRY_MS en admin/pages/Sales).
const MP_EXPIRY_MINUTES = 15;
const TRANSFER_EXPIRY_HOURS = 5;

const MP_NOT_CONFIGURED_MESSAGE =
  'Los pagos con Mercado Pago no están disponibles en este momento. Podés pagar por transferencia.';

// Respuestas del nudge "¿al final comprás?" (checkout transferencia) → valor de
// `origin` en ventas. 'abandonado' además cancela la orden y devuelve el stock.
const NUDGE_ORIGIN = {
  confirmado: 'wa_confirmado',
  sin_confirmar: 'wa_sin_confirmar',
  abandonado: 'wa_abandonado',
};
const MAX_NUDGE_ORDERS = 50;

const MAX_ORDER_ITEMS = 50;
const DEFAULT_ORDER_PAGE_SIZE = 200;
const MAX_ORDER_PAGE_SIZE = 500;

/** Entero saneado dentro de [min, max]; cae al default si no es válido. */
const boundedInt = (raw, fallback, min, max) => {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
};

/**
 * Clave de deduplicación de una compra: mismo usuario + mismo carrito.
 *
 * Sirve para colapsar el doble submit (doble click, reintento del usuario
 * mientras la primera request sigue en vuelo), que hoy generaría DOS juegos de
 * ventas pendientes y descontaría el stock dos veces vía trigger.
 */
const orderDedupeKey = (prefix, req) => {
  const payload = JSON.stringify({
    items: req.body.items,
    shippingMethod: req.body.shippingMethod,
    shippingCost: req.body.shippingCost,
    totalPrice: req.body.totalPrice,
  });
  const owner = (req.user && req.user.id) || req.body.buyerEmail || 'anon';
  return `${prefix}:${owner}:${crypto.createHash('sha256').update(payload).digest('hex')}`;
};

const getFrontendOrigin = () =>
  (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

/** Valida el payload de creación de orden. Devuelve un mensaje de error o null. */
const validateOrderPayload = ({ buyerName, buyerEmail, items, totalPrice }) => {
  if (!buyerName || !String(buyerName).trim()) return 'El nombre del comprador es requerido.';
  if (!buyerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(buyerEmail))) {
    return 'El email del comprador no es válido.';
  }
  if (!Array.isArray(items) || items.length === 0) {
    return 'No hay productos en el carrito para procesar la compra.';
  }
  // Cota dura: cada ítem es un bloqueo de fila dentro de la transacción, así que
  // un carrito absurdo mantendría el lock (y una conexión del pool) demasiado tiempo.
  if (items.length > MAX_ORDER_ITEMS) {
    return `El carrito supera el máximo de ${MAX_ORDER_ITEMS} productos por compra.`;
  }
  for (const item of items) {
    if (!item || !item.productName || !String(item.productName).trim()) {
      return 'Los datos del producto son inválidos (productName).';
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return `La cantidad seleccionada de "${item.productName}" es inválida (quantity).`;
    }
    if (!Number.isFinite(item.unitPrice) || item.unitPrice <= 0) {
      return `El producto "${item.productName}" no tiene un precio válido (unitPrice).`;
    }
    if (!Number.isFinite(item.totalPrice) || item.totalPrice <= 0) {
      return `El total calculado de "${item.productName}" es inválido (totalPrice).`;
    }
  }
  if (!Number.isFinite(totalPrice) || totalPrice <= 0) return 'El total final es inválido (totalPrice).';
  return null;
};

/** Arma el payload de preferencia de Mercado Pago. */
const buildPreferencePayload = ({ buyerName, buyerEmail, items, shippingCost, orderIds }) => {
  const origin = getFrontendOrigin();
  const resultUrl = `${origin}/checkout/result`;

  const mpItems = items.map((item) => ({
    title: String(item.productName).slice(0, 256),
    quantity: item.quantity,
    unit_price: Number(item.unitPrice),
    currency_id: 'ARS',
    picture_url: item.productImage || undefined,
  }));

  const surcharge = Number.isFinite(Number(shippingCost)) ? Number(shippingCost) : 0;
  if (surcharge > 0) {
    mpItems.push({ title: 'Envío', quantity: 1, unit_price: surcharge, currency_id: 'ARS' });
  }

  const preference = {
    items: mpItems,
    payer: { name: String(buyerName).trim(), email: String(buyerEmail).trim() },
    back_urls: { success: resultUrl, pending: resultUrl, failure: resultUrl },
    external_reference: orderIds.map(String).join(','),
    expires: true,
    expiration_date_to: new Date(Date.now() + MP_EXPIRY_MINUTES * 60 * 1000).toISOString(),
  };

  // MP rechaza auto_return si back_urls.success no es una URL pública (HTTPS):
  // en localhost devuelve 400 "auto_return invalid". Solo lo activamos en prod.
  if (resultUrl.startsWith('https://')) {
    preference.auto_return = 'approved';
  }

  if (process.env.MP_WEBHOOK_URL) {
    preference.notification_url = process.env.MP_WEBHOOK_URL;
  }

  return preference;
};

/**
 * Reserva el stock e inserta las ventas pendientes en una única transacción corta.
 *
 * El trigger `trg_decrement_stock` descuenta al insertar la venta, pero con
 * `GREATEST(stock,0)`, que permitiría sobreventa silenciosa: por eso se valida
 * disponibilidad con la fila bloqueada (`FOR UPDATE`) antes de insertar. El lock
 * se mantiene hasta el COMMIT, así que las líneas posteriores del mismo producto
 * ya ven el stock que descontó el trigger en este loop, y dos compras
 * simultáneas del último ítem se serializan (una gana, la otra recibe 409).
 *
 * @returns {Promise<{ok: true, orderIds: string[]} | {ok: false, status: number, message: string}>}
 */
const reserveOrders = async ({ buyerName, buyerEmail, items, shippingMethod, shippingCost, paymentMethod }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const surcharge = Number.isFinite(Number(shippingCost)) ? Number(shippingCost) : 0;
    const orderIds = [];

    for (const [index, item] of items.entries()) {
      const productId = Number.parseInt(item.productId, 10);
      const hasProductId = Number.isInteger(productId);

      if (hasProductId) {
        const available = await Order.getStockForUpdate(client, productId);
        if (available === null || available < item.quantity) {
          await client.query('ROLLBACK');
          return {
            ok: false,
            status: 409,
            message: `No hay stock suficiente de "${item.productName}".`,
          };
        }
      }

      const orderId = await Order.insertPending(client, {
        buyerName,
        buyerEmail,
        productId: hasProductId ? productId : null,
        productName: item.productName,
        productImage: item.productImage,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        // El costo de envío se suma a la primera línea (mismo criterio que el frontend)
        totalPrice: item.totalPrice + (index === 0 ? surcharge : 0),
        unitsConfig: item.unitsConfig,
        paymentMethod,
        shippingMethod,
      });
      orderIds.push(orderId);
    }

    await client.query('COMMIT');
    invalidateProducts();
    return { ok: true, orderIds };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error(`Error al reservar órdenes (${paymentMethod}):`, error.message);
    return { ok: false, status: 500, message: 'No se pudo registrar la orden. Intentá de nuevo.' };
  } finally {
    client.release();
  }
};

/**
 * Compensación: cancela reservas recién creadas y devuelve su stock.
 * Se usa cuando la reserva salió bien pero el paso siguiente falló (ej. Mercado
 * Pago no devolvió preferencia), para que el usuario vea el mismo resultado que
 * antes —nada persistido— sin haber tenido que mantener la transacción abierta
 * durante la llamada externa.
 */
const releaseOrders = async (orderIds) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const id of orderIds) {
      const order = await Order.findByIdForUpdate(client, id);
      if (!order || order.payment_status !== 'pendiente') continue;
      await Order.setStatus(client, order.id, 'cancelado');
      await Order.restoreStock(client, order.product_id, order.quantity);
    }
    await client.query('COMMIT');
    invalidateProducts();
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    // No se propaga: el sweep de órdenes vencidas (cada 60 s) es la red de
    // seguridad si esta compensación falla.
    console.error('Error al liberar reservas de órdenes:', error.message);
  } finally {
    client.release();
  }
};

/**
 * Crea preferencia de Mercado Pago sobre reservas ya confirmadas.
 *
 * La llamada HTTP a Mercado Pago queda FUERA de la transacción a propósito: si
 * se hiciera adentro, cada checkout en curso retendría una conexión del pool
 * durante todo el round trip externo (cientos de ms) y con 20 conexiones
 * bastarían 20 compras simultáneas para frenar toda la API.
 */
const buildMpCheckout = async (req) => {
  const { buyerName, buyerEmail, items, shippingMethod, shippingCost } = req.body;

  const reservation = await reserveOrders({
    buyerName, buyerEmail, items, shippingMethod, shippingCost, paymentMethod: 'mp',
  });
  if (!reservation.ok) {
    return { status: reservation.status, body: { success: false, message: reservation.message } };
  }

  try {
    const preference = await mercadopago.createPreference(
      buildPreferencePayload({ buyerName, buyerEmail, items, shippingCost, orderIds: reservation.orderIds })
    );

    if (!preference || !preference.init_point) {
      throw new Error('Mercado Pago no devolvió init_point');
    }

    return {
      status: 201,
      body: {
        success: true,
        init_point: preference.init_point,
        order_ids: reservation.orderIds.map(String),
      },
    };
  } catch (error) {
    console.error('Error en createMpPreference:', error.message);
    await releaseOrders(reservation.orderIds);
    return {
      status: 502,
      body: {
        success: false,
        message: 'No se pudo conectar con Mercado Pago. Intentá de nuevo o elegí transferencia.',
      },
    };
  }
};

/**
 * @desc    Crea preferencia de Mercado Pago, registra ventas pendientes y reserva stock
 * @route   POST /api/orders/mp-preference
 */
const createMpPreference = async (req, res) => {
  const { buyerName, buyerEmail, items, totalPrice } = req.body;

  const validationError = validateOrderPayload({ buyerName, buyerEmail, items, totalPrice });
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }

  if (!mercadopago.isConfigured()) {
    return res.status(503).json({ success: false, message: MP_NOT_CONFIGURED_MESSAGE });
  }

  // Doble click / reintento con la primera request todavía en vuelo: se comparte
  // la misma ejecución en vez de crear dos juegos de ventas y descontar dos veces.
  const { status, body } = await caches.orders.single(orderDedupeKey('mp', req), () => buildMpCheckout(req));
  return res.status(status).json(body);
};

/**
 * @desc    Crea órdenes de transferencia bancaria, valida stock y reserva en la DB.
 *          Mueve el INSERT fuera del frontend (anon key + RLS) al backend (service role).
 * @route   POST /api/orders/transfer
 */
const createTransferOrder = async (req, res) => {
  const { buyerName, buyerEmail, items, shippingMethod, shippingCost, totalPrice } = req.body;

  const validationError = validateOrderPayload({ buyerName, buyerEmail, items, totalPrice });
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }

  const reservation = await caches.orders.single(orderDedupeKey('transfer', req), () =>
    reserveOrders({ buyerName, buyerEmail, items, shippingMethod, shippingCost, paymentMethod: 'transfer' })
  );

  if (!reservation.ok) {
    return res.status(reservation.status).json({ success: false, message: reservation.message });
  }
  return res.status(201).json({ success: true, order_ids: reservation.orderIds.map(String) });
};

/**
 * @desc    Compras pagadas del usuario (por email). Solo el dueño o un admin.
 * @route   GET /api/orders/user?email=...
 */
const getUserOrders = async (req, res) => {
  try {
    const email = String(req.query.email || '').trim();
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email requerido' });
    }

    const isOwner = req.user.email && req.user.email.toLowerCase() === email.toLowerCase();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'No podés consultar las compras de otro usuario',
      });
    }

    // Paginado con tope: "Mis compras" de un cliente fiel puede tener cientos de
    // líneas y devolverlas todas serializa un JSON grande por request.
    // El default cubre el histórico completo de un usuario normal, así que el
    // frontend actual (que no pagina) sigue funcionando igual.
    const limit = boundedInt(req.query.limit, DEFAULT_ORDER_PAGE_SIZE, 1, MAX_ORDER_PAGE_SIZE);
    const offset = boundedInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);

    const { rows, total } = await Order.findPaidByEmail(email, limit, offset);
    return res.status(200).json({
      success: true,
      orders: rows,
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    });
  } catch (error) {
    console.error('Error en getUserOrders:', error.message);
    return res.status(500).json({ success: false, message: 'Error al cargar las compras' });
  }
};

/**
 * @desc    Confirma contra MP un pago aprobado y marca las órdenes como pagadas.
 *          Lo llama el frontend al volver de MP con payment_id; el webhook es el respaldo.
 * @route   POST /api/orders/mp-confirm
 */
const confirmMpPayment = async (req, res) => {
  try {
    const { paymentId } = req.body;
    if (!paymentId) {
      return res.status(400).json({ success: false, message: 'paymentId requerido' });
    }
    if (!mercadopago.isConfigured()) {
      return res.status(503).json({ success: false, message: MP_NOT_CONFIGURED_MESSAGE });
    }

    // El estado se verifica directo contra MP: el cliente no puede forjar un pago.
    const payment = await mercadopago.getPayment(paymentId);
    if (!payment || payment.status !== 'approved' || !payment.external_reference) {
      return res.status(409).json({ success: false, message: 'El pago no está aprobado' });
    }

    const ids = String(payment.external_reference).split(',').map((s) => s.trim()).filter(Boolean);
    const updated = ids.length > 0 ? await Order.markPaidByIds(ids) : 0;
    // Un pago acreditado tarde vuelve a descontar stock: el catálogo cacheado
    // tiene que reflejarlo ya.
    if (updated > 0) invalidateProducts();

    return res.status(200).json({ success: true, orders_paid: updated });
  } catch (error) {
    console.error('Error en confirmMpPayment:', error.message);
    return res.status(502).json({ success: false, message: 'No se pudo verificar el pago' });
  }
};

/**
 * @desc    Webhook de Mercado Pago (server a server). Marca pagadas las órdenes aprobadas.
 * @route   POST /api/orders/mp-webhook
 */
const mpWebhook = async (req, res) => {
  try {
    const topic = req.query.type || req.query.topic || (req.body && req.body.type);
    const paymentId =
      req.query['data.id'] || (req.body && req.body.data && req.body.data.id) || req.query.id;

    if (topic !== 'payment' || !paymentId || !mercadopago.isConfigured()) {
      return res.status(200).json({ success: true });
    }

    const payment = await mercadopago.getPayment(paymentId);
    if (payment && payment.status === 'approved' && payment.external_reference) {
      const ids = String(payment.external_reference).split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        await Order.markPaidByIds(ids);
        invalidateProducts();
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error en mpWebhook:', error.message);
    // 500 hace que MP reintente la notificación más tarde
    return res.status(500).json({ success: false });
  }
};

/**
 * @desc    Cancela una orden MP pendiente (usuario volvió sin pagar) y devuelve stock
 * @route   POST /api/orders/:id/cancel
 */
const cancelOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const order = await Order.findByIdForUpdate(client, req.params.id);
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Orden no encontrada' });
    }

    const isOwner =
      req.user.email && order.buyer_email &&
      req.user.email.toLowerCase() === order.buyer_email.toLowerCase();
    if (!isOwner && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'No podés cancelar esta orden' });
    }

    if (order.payment_method !== 'mp') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Solo se cancelan órdenes de Mercado Pago por esta vía' });
    }

    // Idempotente: si el sweep ya la expiró (y devolvió stock), no hay nada que hacer
    if (['cancelado', 'expirado'].includes(order.payment_status)) {
      await client.query('COMMIT');
      return res.status(200).json({ success: true, message: 'La orden ya estaba cancelada' });
    }

    if (order.payment_status !== 'pendiente') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'La orden ya fue pagada y no puede cancelarse' });
    }

    await Order.setStatus(client, order.id, 'cancelado');
    await Order.restoreStock(client, order.product_id, order.quantity);

    await client.query('COMMIT');
    invalidateProducts();
    return res.status(200).json({ success: true, message: 'Orden cancelada' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Error en cancelOrder:', error.message);
    return res.status(500).json({ success: false, message: 'Error al cancelar la orden' });
  } finally {
    client.release();
  }
};

/**
 * Cambia el estado de una orden de transferencia pendiente (uso interno de
 * confirmTransfer / cancelTransfer). El stock se descuenta al INSERTAR la venta
 * (trigger trg_decrement_stock), así que:
 *  - confirmar el pago NO toca stock (ya estaba descontado);
 *  - cancelar DEVUELVE el stock que el trigger había descontado.
 */
const resolveTransferOrder = async (req, res, targetStatus) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const order = await Order.findByIdForUpdate(client, req.params.id);
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Orden no encontrada' });
    }
    if (order.payment_method !== 'transfer') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'La orden no es de transferencia' });
    }
    if (order.payment_status !== 'pendiente') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: `La orden ya no está pendiente (estado actual: ${order.payment_status})`,
      });
    }

    if (targetStatus === 'cancelado') {
      await Order.restoreStock(client, order.product_id, order.quantity);
    }

    await Order.setStatus(client, order.id, targetStatus);
    await client.query('COMMIT');
    if (targetStatus === 'cancelado') invalidateProducts();
    return res.status(200).json({
      success: true,
      message: targetStatus === 'pagado' ? 'Pago confirmado' : 'Orden cancelada',
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Error al resolver orden de transferencia:', error.message);
    return res.status(500).json({ success: false, message: 'Error al actualizar la orden' });
  } finally {
    client.release();
  }
};

/**
 * @desc    Admin confirma que llegó la transferencia → 'pagado' + descuenta stock
 * @route   PATCH /api/orders/:id/confirm-transfer
 */
const confirmTransfer = (req, res) => resolveTransferOrder(req, res, 'pagado');

/**
 * @desc    Admin cancela una orden de transferencia pendiente → 'cancelado'
 * @route   PATCH /api/orders/:id/cancel-transfer
 */
const cancelTransfer = (req, res) => resolveTransferOrder(req, res, 'cancelado');

/** Solo se actúa sobre órdenes de transferencia, pendientes y del propio usuario (o admin). */
const canActOnNudgeOrder = (order, user) => {
  if (!order || order.payment_method !== 'transfer' || order.payment_status !== 'pendiente') {
    return false;
  }
  const isOwner =
    user.email && order.buyer_email &&
    user.email.toLowerCase() === order.buyer_email.toLowerCase();
  return isOwner || user.role === 'admin';
};

/** Aplica la respuesta del nudge: 'wa_abandonado' cancela + devuelve stock; el resto solo marca origin. */
const applyNudgeToOrder = async (client, order, origin) => {
  if (origin === NUDGE_ORIGIN.abandonado) {
    await Order.restoreStock(client, order.product_id, order.quantity);
    await Order.setStatus(client, order.id, 'cancelado');
  }
  await Order.setOrigin(client, order.id, origin);
};

/**
 * @desc    Registra la respuesta del nudge post-WhatsApp del checkout transferencia.
 *          'abandonado' cancela las órdenes y devuelve stock; el resto solo marca `origin`.
 * @route   POST /api/orders/nudge
 */
const recordNudge = async (req, res) => {
  const { orderIds, response } = req.body || {};
  const origin = NUDGE_ORIGIN[response];

  if (!origin) {
    return res.status(400).json({ success: false, message: 'Respuesta de nudge inválida' });
  }
  if (!Array.isArray(orderIds) || orderIds.length === 0 || orderIds.length > MAX_NUDGE_ORDERS) {
    return res.status(400).json({ success: false, message: 'Lista de órdenes inválida' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let applied = 0;
    for (const id of orderIds) {
      const order = await Order.findByIdForUpdate(client, id);
      if (!canActOnNudgeOrder(order, req.user)) continue;
      await applyNudgeToOrder(client, order, origin);
      applied += 1;
    }
    await client.query('COMMIT');
    if (origin === NUDGE_ORIGIN.abandonado && applied > 0) invalidateProducts();
    return res.status(200).json({ success: true, applied });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Error en recordNudge:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudo registrar la respuesta' });
  } finally {
    client.release();
  }
};

/** Sweep periódico: expira órdenes pendientes vencidas (lo programa server.js). */
let sweepRunning = false;
const expireStaleOrders = async () => {
  if (sweepRunning) return;
  sweepRunning = true;
  try {
    const { mp, transfer } = await Order.expireStale(MP_EXPIRY_MINUTES, TRANSFER_EXPIRY_HOURS);
    if (mp > 0 || transfer > 0) {
      invalidateProducts(); // el sweep devolvió stock: el catálogo cacheado quedó viejo
      logger.info('orders_sweep', { expiredMp: mp, expiredTransfer: transfer });
    }
  } catch (error) {
    console.error('Error en sweep de órdenes:', error.message);
  } finally {
    sweepRunning = false;
  }
};

module.exports = {
  createMpPreference,
  createTransferOrder,
  getUserOrders,
  confirmMpPayment,
  mpWebhook,
  cancelOrder,
  confirmTransfer,
  cancelTransfer,
  recordNudge,
  expireStaleOrders,
};
