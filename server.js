// server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch'); // Uses node-fetch@2

const app = express();
const PORT = process.env.PORT || 5000;

// Configuration Settings
const TELEGRAM_BOT_TOKEN = '7993793724:AAE51WGWa8M0MuibTr2-76IXUfXXd7eVfvw';
const TELEGRAM_CHAT_ID = '8983291631';
const DB_FILE = path.join(__dirname, 'data', 'products.json');

// Middleware Setup
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serves index.html from public folder

// File Upload Configuration
const upload = multer({ dest: 'uploads/' });

// Helper Functions for JSON Database (Guarantees data presence)
function readProducts() {
  const fallbackProducts = [
    {
      "id": 1,
      "title": "iPhone 15 Pro Max",
      "category": "Smartphones",
      "price": 120000,
      "stock": 10,
      "image": "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500"
    },
    {
      "id": 2,
      "title": "Samsung Galaxy S24 Ultra",
      "category": "Smartphones",
      "price": 135000,
      "stock": 8,
      "image": "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=500"
    },
    {
      "id": 3,
      "title": "MacBook Pro 16",
      "category": "Laptops",
      "price": 250000,
      "stock": 5,
      "image": "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500"
    }
  ];

  try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(fallbackProducts, null, 2));
      return fallbackProducts;
    }

    const data = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(data || '[]');
    
    // If json file exists but is empty array [], write & return fallback
    if (parsed.length === 0) {
      fs.writeFileSync(DB_FILE, JSON.stringify(fallbackProducts, null, 2));
      return fallbackProducts;
    }

    return parsed;
  } catch (err) {
    console.error("Error reading products file, serving fallback list:", err);
    return fallbackProducts;
  }
}

function writeProducts(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed to write to database file:", err);
  }
}

// ----------------------------------------------------
// REST API ENDPOINTS
// ----------------------------------------------------

// 1. GET ALL PRODUCTS
app.get('/api/products', (req, res) => {
  try {
    const products = readProducts();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// 2. CREATE A PRODUCT
app.post('/api/products', (req, res) => {
  try {
    const products = readProducts();
    const newProduct = {
      id: Date.now(),
      ...req.body
    };
    products.unshift(newProduct);
    writeProducts(products);
    res.status(201).json(newProduct);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// 3. UPDATE A PRODUCT
app.put('/api/products/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    let products = readProducts();
    const index = products.findIndex(p => p.id === id);
    
    if (index === -1) {
      return res.status(404).json({ error: 'Product not found' });
    }

    products[index] = { ...products[index], ...req.body };
    writeProducts(products);
    res.json(products[index]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// 4. DELETE A PRODUCT
app.delete('/api/products/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    let products = readProducts();
    products = products.filter(p => p.id !== id);
    writeProducts(products);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// 5. CHECKOUT & TELEGRAM NOTIFICATION
app.post('/api/checkout', upload.single('receipt'), async (req, res) => {
  try {
    const { name, phone, address, cart, totalFormatted } = req.body;
    const parsedCart = JSON.parse(cart);
    const receiptFile = req.file;

    // Deduct stock levels in products.json
    let products = readProducts();
    parsedCart.forEach(cartItem => {
      const prodIndex = products.findIndex(p => p.id === cartItem.id);
      if (prodIndex !== -1) {
        products[prodIndex].stock = Math.max(0, products[prodIndex].stock - cartItem.quantity);
      }
    });
    writeProducts(products);

    // Build Telegram Notification Message
    const productList = parsedCart
      .map(i => `• ${i.title} (x${i.quantity})`)
      .join('\n');

    const caption = `🛍️ *NEW ORDER RECEIVED*\n\n` +
                    `👤 *Name:* ${name}\n` +
                    `📞 *Phone:* ${phone}\n` +
                    `📍 *Address:* ${address}\n\n` +
                    `📦 *Products Ordered:*\n${productList}\n\n` +
                    `💰 *Total:* ${totalFormatted}`;

    // Send Receipt & Info to Telegram Bot
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('caption', caption);
    formData.append('parse_mode', 'Markdown');
    formData.append('photo', fs.createReadStream(receiptFile.path));

    const tgResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      body: formData
    });

    // Cleanup temporary upload file
    if (fs.existsSync(receiptFile.path)) {
      fs.unlinkSync(receiptFile.path);
    }

    if (tgResponse.ok) {
      res.json({ success: true, message: 'Order submitted successfully' });
    } else {
      res.status(500).json({ error: 'Failed to send notification to Telegram' });
    }
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Server error processing checkout' });
  }
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});