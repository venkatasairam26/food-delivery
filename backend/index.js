// Refactored Express backend with security and routing improvements
const express = require('express');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3001;
const dbPath = path.join(__dirname, 'foodDelivery.db');
let dataBase = null;

const initDBAndServer = async () => {
  try {
    dataBase = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(PORT, () => {
      console.log(`Server is running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initDBAndServer();

const authToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, 'secretKey', (err, payload) => {
      if (err) return res.status(401).send('Invalid JWT Token');
      req.user = payload;
      next();
    });
  } else {
    res.status(401).send('Missing Authorization Header');
  }
};

app.post('/register', async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password || !email) return res.status(400).send('Missing fields');
  try {
    const getUserQuery = `SELECT * FROM users WHERE email = ?`;
    const dbUser = await dataBase.get(getUserQuery, [email]);
    if (dbUser) return res.status(400).send('User already exists');

    const hashPassword = await bcrypt.hash(password, 10);
    const createUserQuery = `INSERT INTO users (username, password, email) VALUES (?, ?, ?)`;
    await dataBase.run(createUserQuery, [username, hashPassword, email]);
    res.status(200).send('User created successfully');
  } catch (error) {
    console.error(`Error during registration: ${error.message}`);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const getUserQuery = `SELECT * FROM users WHERE email = ?`;
    const dbUser = await dataBase.get(getUserQuery, [email]);
    if (!dbUser) return res.status(400).send('Invalid user');

    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (!isPasswordMatched) return res.status(400).send('Invalid password');

    const payload = { email: dbUser.email };
    const jwtToken = jwt.sign(payload, 'secretKey', { expiresIn: '1h' });
    res.send({ jwtToken });
  } catch (error) {
    console.error(`Login error: ${error.message}`);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/', authToken, async (req, res) => {
  const getAllProductsQuery = `SELECT * FROM products;`;
  const products = await dataBase.all(getAllProductsQuery);
  res.status(200).send(products);
});

app.post('/cart', authToken, async (req, res) => {
  const { email } = req.user;
  const getCartQuery = `
    SELECT cart.cartId, cart.productId, products.name, products.price, products.imgUrl, cart.quantity
    FROM products JOIN cart ON products.productId = cart.productId
    WHERE cart.email = ?
    GROUP BY cart.cartId;
  `;
  const cartItems = await dataBase.all(getCartQuery, [email]);
  res.status(200).send(cartItems);
});

app.post('/cart', authToken, async (req, res) => {
  const { email } = req.user;
  const { productId, quantity } = req.body;
  if (quantity <= 0) return res.status(400).send('Invalid quantity');
  if (quantity > 10) return res.status(400).send('Quantity exceeds limit');

  const getCartItemQuery = `SELECT * FROM cart WHERE email = ? AND productId = ?`;
  const existingCartItem = await dataBase.get(getCartItemQuery, [email, productId]);

  if (existingCartItem) {
    const updateCartQuery = `UPDATE cart SET quantity = quantity + ? WHERE email = ? AND productId = ?`;
    await dataBase.run(updateCartQuery, [quantity, email, productId]);
    return res.status(200).send('Item quantity updated in cart');
  } else {
    const addToCartQuery = `INSERT INTO cart (email, productId, quantity) VALUES (?, ?, ?)`;
    await dataBase.run(addToCartQuery, [email, productId, quantity]);
    return res.status(200).send('Item added to cart');
  }
});

app.delete('/cart/:cartId', authToken, async (req, res) => {
  const { cartId } = req.params;
  const deleteCartItemQuery = `DELETE FROM cart WHERE cartId = ?`;
  await dataBase.run(deleteCartItemQuery, [cartId]);
  res.status(200).send('Item removed from cart');
});

app.post('/profile', authToken, async (req, res) => {
  const { email } = req.user;
  const getUserProfileQuery = `SELECT username, email FROM users WHERE email = ?`;
  const userProfile = await dataBase.get(getUserProfileQuery, [email]);
  res.status(200).send(userProfile);
});

// Serve frontend in production
const buildPath = path.join(__dirname, 'build');
app.use(express.static(buildPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});
