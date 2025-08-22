// server.js (Bitmax Backend with MySQL + Railway)
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MySQL Connection
const db = await mysql.createConnection(process.env.MYSQL_URL);
console.log('✅ Connected to Railway MySQL');

// === ROUTES ===

// User Signup
app.post('/api/signup', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.json({ success: false, message: 'All fields required' });
  }

  const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    return res.json({ success: false, message: 'Email already registered' });
  }

  const role = email === 'admin@example.com' ? 'admin' : 'user';
  await db.query(
    'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
    [username, email, password, role]
  );
  await db.query('INSERT INTO balances (email, BTC, ETH, XRP, TON) VALUES (?, 0, 0, 0, 0)', [email]);

  res.json({ success: true, role });
});

// User Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await db.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password]);
  if (rows.length === 0) {
    return res.json({ success: false, message: 'Invalid credentials' });
  }
  const user = rows[0];
  res.json({ success: true, username: user.username, role: user.role });
});

// Get Balance
app.get('/api/balance/:email', async (req, res) => {
  const email = req.params.email;
  const [rows] = await db.query('SELECT BTC, ETH, XRP, TON FROM balances WHERE email = ?', [email]);
  if (rows.length === 0) {
    return res.json({ success: false, message: 'User not found' });
  }
  res.json({ success: true, balance: rows[0] });
});

// Admin: Adjust Balance
app.post('/api/admin/balance', async (req, res) => {
  const { targetEmail, coin, amount, action, adminEmail } = req.body;
  const [rows] = await db.query('SELECT * FROM balances WHERE email = ?', [targetEmail]);
  if (rows.length === 0) {
    return res.json({ success: false, message: 'User not found' });
  }

  const current = rows[0][coin];
  const newBalance = action === 'add' ? current + parseFloat(amount) : current - parseFloat(amount);

  await db.query(`UPDATE balances SET ${coin} = ? WHERE email = ?`, [newBalance, targetEmail]);
  await db.query(
    'INSERT INTO transactions (email, coin, amount, type, action, admin, timestamp) VALUES (?, ?, ?, ?, ?, ?, NOW())',
    [targetEmail, coin, amount, 'admin-adjust', action, adminEmail]
  );

  res.json({ success: true });
});

// Withdraw Funds
app.post('/api/withdraw', async (req, res) => {
  const { email, coin, amount } = req.body;
  const [rows] = await db.query('SELECT * FROM balances WHERE email = ?', [email]);

  if (rows.length === 0) return res.json({ success: false, message: 'User not found' });
  if (rows[0][coin] < amount) return res.json({ success: false, message: 'Insufficient balance' });

  const newAmount = rows[0][coin] - parseFloat(amount);
  await db.query(`UPDATE balances SET ${coin} = ? WHERE email = ?`, [newAmount, email]);
  await db.query(
    'INSERT INTO transactions (email, coin, amount, type, timestamp) VALUES (?, ?, ?, ?, NOW())',
    [email, coin, amount, 'withdraw']
  );

  res.json({ success: true });
});

// Fetch All Users (for admin)
app.get('/api/users', async (req, res) => {
  const [users] = await db.query('SELECT username, email FROM users');
  res.json({ success: true, users });
});

app.listen(PORT, () => {
  console.log(`✅ Bitmax backend running on http://localhost:${PORT}`);
});
