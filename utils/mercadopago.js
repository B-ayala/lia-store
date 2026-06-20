/**
 * Cliente mínimo de la API REST de Mercado Pago.
 * Requiere MP_ACCESS_TOKEN en el entorno (Access Token del vendedor).
 */

const MP_API_BASE = 'https://api.mercadopago.com';

// Tolera valores pegados con comillas en el .env (mismo criterio que cloudinaryController)
const getAccessToken = () =>
  (process.env.MP_ACCESS_TOKEN || '').trim().replace(/^['"]|['"]$/g, '');

const isConfigured = () => Boolean(getAccessToken());

const mpRequest = async (path, options = {}) => {
  const response = await fetch(`${MP_API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAccessToken()}`,
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      (data && data.message) || `Mercado Pago respondió ${response.status}`
    );
    error.status = response.status;
    throw error;
  }

  return data;
};

/** Crea una preferencia de checkout. Devuelve el objeto preference (incluye init_point). */
const createPreference = (preference) =>
  mpRequest('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify(preference),
  });

/** Obtiene un pago por id (para verificar estado y external_reference). */
const getPayment = (paymentId) =>
  mpRequest(`/v1/payments/${encodeURIComponent(paymentId)}`);

module.exports = { isConfigured, createPreference, getPayment };
