const crypto = require('crypto');
const https = require('https');

const generateSignature = (req, res) => {
  try {
    // El widget manda exactamente los parámetros que quiere firmar en el body
    // (ej: folder, timestamp, upload_preset, source, etc.)
    const paramsToSign = req.body;

    if (!paramsToSign || Object.keys(paramsToSign).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionaron parámetros para firmar',
      });
    }

    // Firma Cloudinary: ordenar keys alfabéticamente, concatenar "key=value&...", agregar API_SECRET al final
    const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').replace(/^['"]|['"]$/g, '');
    const signatureString =
      Object.keys(paramsToSign)
        .sort()
        .map((key) => `${key}=${paramsToSign[key]}`)
        .join('&') + apiSecret;

    const signature = crypto
      .createHash('sha1')
      .update(signatureString)
      .digest('hex');

    console.log('Signature generated for params:', Object.keys(paramsToSign).sort().join(', '));
    console.log('Signature:', signature);

    res.json({
      success: true,
      data: {
        signature,
      },
    });
  } catch (error) {
    console.error('Cloudinary signature error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const deleteImage = async (req, res) => {
  try {
    const { publicId } = req.body;

    if (!publicId) {
      return res.status(400).json({
        success: false,
        message: 'El publicId es requerido',
      });
    }

    const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').replace(/^['"]|['"]$/g, '');
    const auth = Buffer.from(
      `${process.env.CLOUDINARY_API_KEY}:${apiSecret}`
    ).toString('base64');

    const options = {
      hostname: 'api.cloudinary.com',
      path: `/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/image/upload?public_ids%5B%5D=${encodeURIComponent(publicId)}`,
      method: 'DELETE',
      headers: {
        'Authorization': `Basic ${auth}`,
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
          res.json({
            success: true,
            data: result,
          });
        } catch (parseError) {
          console.error('Parse error:', parseError);
          res.status(500).json({
            success: false,
            message: 'No se pudo analizar la respuesta de Cloudinary',
          });
        }
      });
    });

    request.on('error', (error) => {
      console.error('Cloudinary delete error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    });

    request.end();
  } catch (error) {
    console.error('Delete handler error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getImages = async (req, res) => {
  try {
    const { folder, next_cursor } = req.query;

    const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').replace(/^['"]|['"]$/g, '');
    const auth = Buffer.from(
      `${process.env.CLOUDINARY_API_KEY}:${apiSecret}`
    ).toString('base64');

    let path = `/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/image?max_results=100&type=upload`;
    if (folder) path += `&prefix=${encodeURIComponent(folder)}`;
    if (next_cursor) path += `&next_cursor=${encodeURIComponent(next_cursor)}`;

    const options = {
      hostname: 'api.cloudinary.com',
      path,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
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
          res.json({ success: true, data: result });
        } catch (parseError) {
          console.error('Parse error:', parseError);
          res.status(500).json({ success: false, message: 'No se pudo analizar la respuesta de Cloudinary' });
        }
      });
    });

    request.on('error', (error) => {
      console.error('Cloudinary getImages error:', error);
      res.status(500).json({ success: false, message: error.message });
    });

    request.end();
  } catch (error) {
    console.error('getImages handler error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const cloudinaryRequest = (method, path, body) => {
  return new Promise((resolve, reject) => {
    const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').replace(/^['"]|['"]$/g, '');
    const auth = Buffer.from(`${process.env.CLOUDINARY_API_KEY}:${apiSecret}`).toString('base64');

    const headers = { 'Authorization': `Basic ${auth}` };
    let postData = null;

    if (body) {
      postData = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(
      { hostname: 'api.cloudinary.com', path, method, headers },
      (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Parse error')); }
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
};

const getFolders = async (req, res) => {
  try {
    const { path: folderPath } = req.query;
    const apiPath = folderPath
      ? `/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/folders/${encodeURIComponent(folderPath)}`
      : `/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/folders`;

    const result = await cloudinaryRequest('GET', apiPath, null);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('getFolders error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const createFolder = async (req, res) => {
  try {
    const { path: folderPath } = req.body;
    if (!folderPath) {
      return res.status(400).json({ success: false, message: 'El path de la carpeta es requerido' });
    }

    const apiPath = `/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/folders/${folderPath.split('/').map(encodeURIComponent).join('/')}`;
    const result = await cloudinaryRequest('POST', apiPath, null);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('createFolder error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteFolder = async (req, res) => {
  try {
    const { path: folderPath } = req.body;
    if (!folderPath) {
      return res.status(400).json({ success: false, message: 'El path de la carpeta es requerido' });
    }

    const apiPath = `/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/folders/${folderPath.split('/').map(encodeURIComponent).join('/')}`;
    const result = await cloudinaryRequest('DELETE', apiPath, null);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('deleteFolder error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getConfig = (_req, res) => {
  res.json({
    success: true,
    data: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
    },
  });
};

module.exports = { generateSignature, deleteImage, getImages, getConfig, getFolders, createFolder, deleteFolder };
