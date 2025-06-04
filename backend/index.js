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
        dataBase = await open({
            filename: dbPath,
            driver: sqlite3.Database
        })
        app.listen(PORT, () => {
            console.log(`Server is running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.log(`DB Error: ${error.message}`);
        process.exit(1);
    }
}

initDBAndServer();

const authToken = (request, response, next) => {
    const authHeader = request.headers['authorization'];
    if (authHeader !== undefined) {
        const jwtToken = authHeader.split(' ')[1];

        jwt.verify(jwtToken, 'secretKey', (error, payload) => {
            if (error) {
                response.status(401).send('Invalid JWT Token');
            } else {
                request.user = payload;
                next();
            }
        });
    } else {
        response.status(401).send('Missing Authorization Header');
    }
}

app.post('/register', async (request, response) => {
    const { username, password, email } = request.body;
    try {
        const getUserQuery = `
SELECT * FROM users WHERE email = '${email}';`
        const dbUser = await dataBase.get(getUserQuery);
        if (dbUser === undefined) {
            const hashPassword = await bcrypt.hash(password, 10);
            const createUserQuery = `
    INSERT INTO users (username,password,email)
    VALUES ('${username}','${hashPassword}','${email}');`
            await dataBase.run(createUserQuery);
            response.status(200);
            response.send('User created successfully');
        } else {
            response.status(400);
            response.send('User already exists');
        }
    } catch (error) {
        console.error(`Error during registration: ${error.message}`);
        response.status(500).send('Internal Server Error');
    }
})

app.post('/login', async (request, response) => {
    const { email, password } = request.body;
    const getUserQuery = `
    SELECT * FROM users WHERE email = '${email}';`
    const dbUser = await dataBase.get(getUserQuery);
    if (dbUser === undefined) {
        response.status(400);
        response.send('Invalid user');
    }
    else {
        const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
        if (isPasswordMatched === true) {
            const payload = { email: dbUser.email };
            const jwtToken = jwt.sign(payload, 'secretKey');
            response.send({ jwtToken });
        } else {
            response.status(400);
            response.send('Invalid password');
        }
    }
})

app.get('/', authToken, async (request, response) => {
    const getAllProductsQuery = `SELECT * FROM products;`
    const products = await dataBase.all(getAllProductsQuery);
    response.status(200);
    response.send(products);
})

app.get('/cart', authToken, async (request, response) => {
    const { email } = request.user;
    const getCartQuery = `SELECT cartId,cart.productId, products.name,products.price AS price, products.imgUrl, cart.quantity,cart.cartId
    FROM products  JOIN cart ON products.productId = cart.productId WHERE email = '${email}' 
    GROUP BY products.productId;`
    const cartItems = await dataBase.all(getCartQuery);
    response.status(200);
    response.send(cartItems);
})
app.post('/cart', authToken, async (request, response) => {
    const { email } = request.user;
    const { productId, quantity } = request.body;
    const getCartItemQuery = `
    SELECT * FROM cart WHERE email = '${email}' AND productId = ${productId};`
    const existingCartItem = await dataBase.get(getCartItemQuery);
    if (existingCartItem) {
        const updateCartQuery = `
        UPDATE cart SET quantity = quantity + ${quantity} WHERE email = '${email}' AND productId = ${productId};`
        await dataBase.run(updateCartQuery);
        response.status(200);
        response.send('Item quantity updated in cart');
        return;
    } else if (quantity <= 0) {
        response.status(400);
        response.send('Invalid quantity');
        return;
    } else if (quantity > 10) {
        response.status(400);
        response.send('Quantity exceeds limit');
        return;
    } else {
        const addToCartQuery = `
    INSERT INTO cart (email, productId, quantity)
    VALUES ('${email}', ${productId}, ${quantity});`
        await dataBase.run(addToCartQuery);
        response.status(200);
        response.send('Item added to cart');
    }

})
app.delete('/cart/:cartId', authToken, async (request, response) => {
    const { cartId } = request.params;
    console.log(`Cart ID to delete: ${cartId}`);
    const deleteCartItemQuery = `
    DELETE FROM cart WHERE cartId = ${cartId};`
    await dataBase.run(deleteCartItemQuery);
    response.status(200);
    response.send('Item removed from cart');
})

app.get('/profile', authToken, async (request, response) => {
    const { email } = request.user;
    const getUserProfileQuery = `
    SELECT username, email FROM users WHERE email = '${email}';`
    const userProfile = await dataBase.get(getUserProfileQuery);
    response.status(200);
    response.send(userProfile);
})

