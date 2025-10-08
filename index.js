const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '4170423090';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    name TEXT,
    phone TEXT,
    pickup TEXT,
    delivery TEXT,
    items TEXT,
    details TEXT,
    status TEXT,
    createdAt TEXT,
    acceptedAt TEXT,
    enrouteAt TEXT,
    deliveredAt TEXT
  )`);
});

const app = express();
app.use(bodyParser.json());
const cors = require('cors');
app.use(cors());

// Public endpoint to create order
app.post('/api/orders', (req, res) => {
  const { name, phone, pickup, delivery, items, details } = req.body;
  if (!phone || !pickup || !delivery) return res.status(400).json({ error: 'phone,pickup,delivery required' });
  const id = 'ord_' + Date.now();
  const createdAt = new Date().toISOString();
  const status = 'new';
  const itemsStr = JSON.stringify(items || []);
  db.run(
    `INSERT INTO orders (id,name,phone,pickup,delivery,items,details,status,createdAt) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, name, phone, pickup, delivery, itemsStr, details, status, createdAt],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id, name, phone, pickup, delivery, items: JSON.parse(itemsStr), details, status, createdAt });
    }
  );
});

// Admin auth middleware
function requireAdmin(req, res, next) {
  const h = req.get('Authorization') || '';
  const token = h.replace('Bearer ', '').trim();
  if (token === ADMIN_TOKEN) return next();
  res.status(401).json({ error: 'unauthorized' });
}

app.get('/api/orders', requireAdmin, (req, res) => {
  db.all(`SELECT * FROM orders ORDER BY createdAt DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const mapped = rows.map((r) => ({ ...r, items: JSON.parse(r.items || '[]') }));
    res.json(mapped);
  });
});

app.patch('/api/orders/:id/status', requireAdmin, (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  const tsNow = new Date().toISOString();
  db.get(`SELECT * FROM orders WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'order not found' });
    const updates = [];
    const params = [];
    updates.push('status = ?');
    params.push(status);
    if (status === 'accepted') {
      updates.push('acceptedAt = ?');
      params.push(tsNow);
    }
    if (status === 'enroute') {
      updates.push('enrouteAt = ?');
      params.push(tsNow);
    }
    if (status === 'delivered') {
      updates.push('deliveredAt = ?');
      params.push(tsNow);
    }
    params.push(id);
    db.run(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`, params, function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

app.delete('/api/orders/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  db.run(`DELETE FROM orders WHERE id = ?`, [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log('API listening on', port));
