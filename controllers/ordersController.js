const { pool } = require('../config/database');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || '',
});

// ─────────────────────────────────────────────
// MP: Crear preferencia y registrar la venta
// POST /api/orders/mp-preference
// ─────────────────────────────────────────────
const createMpPreference = async (req, res) => {
  const {
    buyerName,
    buyerEmail,
    productId,
    productName,
    productImage,
    quantity,
    unitPrice,
    totalPrice,
    unitsConfig,
    shippingMethod,
  } = req.body;

  if (!productName || !quantity || !unitPrice || !totalPrice) {
    return res.status(400).json({
      success: false,
      message: 'Faltan campos requeridos: productName, quantity, unitPrice, totalPrice',
    });
  }

  try {
    // 1. Insertar la venta en Supabase con payment_status = 'pendiente'
    const insertResult = await pool.query(
      `INSERT INTO public.ventas
        (buyer_name, buyer_email, product_id, product_name, product_image,
         quantity, unit_price, total_price, units_config,
         payment_method, payment_status, shipping_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'mp', 'pendiente', $10)
       RETURNING id`,
      [
        buyerName || null,
        buyerEmail || null,
        productId ? Number(productId) : null,
        productName,
        productImage || null,
        parseInt(quantity),
        parseFloat(unitPrice),
        parseFloat(totalPrice),
        unitsConfig ? JSON.stringify(unitsConfig) : null,
        shippingMethod || null,
      ]
    );

    const orderId = insertResult.rows[0].id;

    const frontendBase = process.env.FRONTEND_APP_URL || 'http://localhost:5173/damianaBella';
    const backendBase = process.env.BACKEND_URL || 'http://localhost:3000';

    // 2. Crear preferencia en Mercado Pago
    const preferenceClient = new Preference(mpClient);
    const preference = await preferenceClient.create({
      body: {
        items: [
          {
            id: String(productId || 'product'),
            title: productName,
            quantity: parseInt(quantity),
            unit_price: parseFloat(unitPrice),
            currency_id: 'ARS',
            picture_url: productImage || undefined,
          },
        ],
        payer: {
          name: buyerName || undefined,
          email: buyerEmail || undefined,
        },
        back_urls: {
          success: `${frontendBase}/checkout/result`,
          pending: `${frontendBase}/checkout/result`,
          failure: `${frontendBase}/checkout/result`,
        },
        auto_return: 'approved',
        notification_url: `${backendBase}/api/orders/mp-webhook`,
        external_reference: orderId,
        statement_descriptor: 'Damiana Bella',
      },
    });

    // 3. Guardar mp_preference_id en la venta
    await pool.query(
      `UPDATE public.ventas SET mp_preference_id = $1 WHERE id = $2`,
      [preference.id, orderId]
    );

    const isProduction = process.env.NODE_ENV === 'production';
    const redirectUrl = isProduction
      ? preference.init_point
      : (preference.sandbox_init_point || preference.init_point);

    return res.json({
      success: true,
      init_point: redirectUrl,
      order_id: orderId,
    });
  } catch (err) {
    console.error('Error creando preferencia MP:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// MP: Webhook de notificaciones
// POST /api/orders/mp-webhook
// ─────────────────────────────────────────────
const mpWebhook = async (req, res) => {
  // Responder 200 inmediatamente para que MP no reintente
  res.sendStatus(200);

  try {
    const { type, data } = req.body;

    if (type !== 'payment' || !data?.id) return;

    const paymentClient = new Payment(mpClient);
    const payment = await paymentClient.get({ id: data.id });

    const orderId = payment.external_reference;
    if (!orderId) return;

    // Mapear estado de MP a payment_status interno
    const mpStatus = payment.status; // 'approved' | 'pending' | 'rejected' | 'cancelled' | ...
    const newStatus = mpStatus === 'approved' ? 'pagado' : 'pendiente';

    await pool.query(
      `UPDATE public.ventas SET payment_status = $1 WHERE id = $2`,
      [newStatus, orderId]
    );

    console.log(`Webhook MP: order ${orderId} → payment_status=${newStatus} (mp_status=${mpStatus})`);
  } catch (err) {
    console.error('Error procesando webhook MP:', err);
  }
};

// ─────────────────────────────────────────────
// Existentes (sin cambios)
// ─────────────────────────────────────────────
const createOrder = async (req, res) => {
  try {
    const {
      productId,
      productName,
      productImage,
      quantity,
      unitPrice,
      totalPrice,
      unitsConfig,
      paymentMethod,
    } = req.body;

    if (!productName || !quantity || !unitPrice || !totalPrice) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: productName, quantity, unitPrice, totalPrice',
      });
    }

    const result = await pool.query(
      `INSERT INTO public.pedidos
        (product_id, product_name, product_image, quantity, unit_price, total_price, units_config, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        productId || null,
        productName,
        productImage || null,
        parseInt(quantity),
        parseFloat(unitPrice),
        parseFloat(totalPrice),
        unitsConfig ? JSON.stringify(unitsConfig) : null,
        paymentMethod || 'pending',
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getOrders = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM public.pedidos ORDER BY created_at DESC`
    );
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Estado inválido' });
    }
    const result = await pool.query(
      `UPDATE public.pedidos SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { createOrder, getOrders, updateOrderStatus, createMpPreference, mpWebhook };
