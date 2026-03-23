const { pool } = require('../config/database');

const createProduct = async (req, res) => {
  try {
    const {
      name, price, stock, category, imageUrl, publicId,
      description, discount, condition, freeShipping,
      variants, specifications, features, faqs, warranty, returnPolicy,
      status, images,
    } = req.body;

    if (!name || !price) {
      return res.status(400).json({
        success: false,
        message: 'El nombre y el precio son requeridos',
      });
    }

    // image_url se deriva del primer elemento del array images si se provee
    const resolvedImageUrl = (images && images.length > 0) ? images[0] : (imageUrl || '');
    const resolvedPublicId = publicId || '';

    const result = await pool.query(
      `INSERT INTO public.productos
       (name, price, stock, category, image_url, public_id, description,
        discount, condition, free_shipping, variants, specifications, features, faqs,
        warranty, return_policy, status, images)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        name,
        parseFloat(price),
        stock || 0,
        category || null,
        resolvedImageUrl,
        resolvedPublicId,
        description || null,
        discount ? parseFloat(discount) : null,
        condition || 'new',
        freeShipping || false,
        variants ? JSON.stringify(variants) : null,
        specifications ? JSON.stringify(specifications) : null,
        features ? JSON.stringify(features) : null,
        faqs ? JSON.stringify(faqs) : null,
        warranty || null,
        returnPolicy || null,
        status || 'active',
        images ? JSON.stringify(images) : null,
      ]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getProducts = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    const countResult = await pool.query('SELECT COUNT(*) FROM public.productos');
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT * FROM public.productos
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM public.productos WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, price, stock, category, imageUrl, publicId,
      description, discount, condition, freeShipping,
      variants, specifications, features, faqs, warranty, returnPolicy,
      status, images,
    } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (price !== undefined) {
      updates.push(`price = $${paramCount++}`);
      values.push(parseFloat(price));
    }
    if (stock !== undefined) {
      updates.push(`stock = $${paramCount++}`);
      values.push(stock);
    }
    if (category !== undefined) {
      updates.push(`category = $${paramCount++}`);
      values.push(category);
    }
    if (images !== undefined) {
      updates.push(`images = $${paramCount++}`);
      values.push(JSON.stringify(images));
      // image_url se mantiene sincronizado con el primer elemento de images
      const firstImage = (images && images.length > 0) ? images[0] : (imageUrl || '');
      updates.push(`image_url = $${paramCount++}`);
      values.push(firstImage);
    } else if (imageUrl !== undefined) {
      updates.push(`image_url = $${paramCount++}`);
      values.push(imageUrl);
    }
    if (publicId !== undefined) {
      updates.push(`public_id = $${paramCount++}`);
      values.push(publicId);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (discount !== undefined) {
      updates.push(`discount = $${paramCount++}`);
      values.push(discount ? parseFloat(discount) : null);
    }
    if (condition !== undefined) {
      updates.push(`condition = $${paramCount++}`);
      values.push(condition);
    }
    if (freeShipping !== undefined) {
      updates.push(`free_shipping = $${paramCount++}`);
      values.push(freeShipping);
    }
    if (variants !== undefined) {
      updates.push(`variants = $${paramCount++}`);
      values.push(JSON.stringify(variants));
    }
    if (specifications !== undefined) {
      updates.push(`specifications = $${paramCount++}`);
      values.push(JSON.stringify(specifications));
    }
    if (features !== undefined) {
      updates.push(`features = $${paramCount++}`);
      values.push(JSON.stringify(features));
    }
    if (faqs !== undefined) {
      updates.push(`faqs = $${paramCount++}`);
      values.push(JSON.stringify(faqs));
    }
    if (warranty !== undefined) {
      updates.push(`warranty = $${paramCount++}`);
      values.push(warranty);
    }
    if (returnPolicy !== undefined) {
      updates.push(`return_policy = $${paramCount++}`);
      values.push(returnPolicy);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay campos para actualizar',
      });
    }

    values.push(id);
    const query = `UPDATE public.productos SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const productResult = await pool.query(
      'SELECT public_id FROM public.productos WHERE id = $1',
      [id]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado',
      });
    }

    const productData = productResult.rows[0];

    if (productData.public_id) {
      try {
        const https = require('https');
        const auth = Buffer.from(
          `${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}`
        ).toString('base64');

        const postData = `public_ids%5B%5D=${encodeURIComponent(productData.public_id)}`;

        await new Promise((resolve, reject) => {
          const options = {
            hostname: 'api.cloudinary.com',
            path: `/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/image/destroy`,
            method: 'POST',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(postData),
            },
          };

          const request = https.request(options, (response) => {
            let data = '';
            response.on('data', (chunk) => {
              data += chunk;
            });
            response.on('end', () => {
              try {
                const result = JSON.parse(data);
                if (result.deleted && result.deleted[productData.public_id]) {
                  resolve(result);
                } else {
                  reject(new Error('Imagen no encontrada en Cloudinary'));
                }
              } catch (e) {
                reject(e);
              }
            });
          });

          request.on('error', reject);
          request.write(postData);
          request.end();
        });
      } catch (cloudinaryError) {
        // Si Cloudinary falla, no se cancela el borrado del producto en BD
        console.warn('Cloudinary deletion warning:', cloudinaryError.message);
      }
    }

    await pool.query('DELETE FROM public.productos WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Producto eliminado exitosamente',
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};
