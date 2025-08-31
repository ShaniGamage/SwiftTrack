const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());
const soap = require('soap');
const net = require('net');
const amqp = require('amqplib');
const cors = require('cors');

app.use(cors()); // allows any origin

const { Pool } = require('pg');

// DB connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'swift_track',
  password: 'shani123',   // your password
  port: 5432,
});



// Middleware endpoint for creating order
app.post('/order', async (req, res) => {
  const { orderId, address } = req.body;

  try {
    // Call ROS (fake REST API for route planning)
    const response = await axios.post('http://localhost:4000/plan-route', {
      orderId,
      address
    });

    res.json({
      message: 'Order sent to ROS successfully',
      rosResponse: response.data
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to contact ROS', details: err.message });
  }
});



// Middleware endpoint for order creation with CMS + ROS
app.post('/order/full', async (req, res) => {
  const { orderId, address, client } = req.body;

  try {
    // Call CMS SOAP service
    const url = 'http://localhost:5000/cms?wsdl';
    const clientSoap = await soap.createClientAsync(url);
    const [cmsResult] = await clientSoap.CreateOrderAsync({ orderId, client });

    // Call ROS REST API
    const response = await axios.post('http://localhost:4000/plan-route', {
      orderId,
      address
    });

    res.json({
      cmsResponse: cmsResult,
      rosResponse: response.data
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed in order processing', details: err.message });
  }
});


// Middleware endpoint for WMS interaction
app.post('/order/wms', (req, res) => {
  const { orderId } = req.body;

  // Connect to WMS (TCP server)
  const client = new net.Socket();
  client.connect(6000, '127.0.0.1', () => {
    console.log("Connected to WMS TCP server");
    client.write(orderId); // Send orderId to WMS
  });

  client.on('data', (data) => {
    console.log("Received from WMS:", data.toString());
    res.json({
      message: `Order ${orderId} sent to WMS`,
      wmsResponse: data.toString()
    });
    client.destroy(); // Close connection
  });

  client.on('error', (err) => {
    console.error("WMS connection error:", err.message);
    res.status(500).json({ error: "Failed to contact WMS" });
  });
});


// Combined Order Processing (CMS + ROS + WMS)
app.post('/order/process', async (req, res) => {
  const { orderId, address, client } = req.body;

  try {
    // 1️⃣ Save order to DB
    await pool.query(
      'INSERT INTO orders (order_id, client, address, status) VALUES ($1,$2,$3,$4) ON CONFLICT (order_id) DO NOTHING',
      [orderId, client, address, 'Pending']
    );

    // 2️⃣ CMS (SOAP)
    const url = 'http://localhost:5000/cms?wsdl';
    const clientSoap = await soap.createClientAsync(url);
    const [cmsResult] = await clientSoap.CreateOrderAsync({ orderId, client });

    // 3️⃣ ROS (REST)
    const rosResponse = await axios.post('http://localhost:4000/plan-route', {
      orderId, address
    });

    // 4️⃣ WMS (TCP)
    const wmsResponse = await new Promise((resolve, reject) => {
      const tcpClient = new net.Socket();
      tcpClient.connect(6000, '127.0.0.1', () => tcpClient.write(orderId));

      tcpClient.on('data', (data) => {
        resolve(data.toString());
        tcpClient.destroy();
      });
      tcpClient.on('error', (err) => reject(err.message));
    });

    // 5️⃣ Update DB with route + status
    await pool.query(
      'UPDATE orders SET route=$1, status=$2 WHERE order_id=$3',
      [rosResponse.data.route, 'Ready', orderId]
    );

    res.json({ cms: cmsResult, ros: rosResponse.data, wms: wmsResponse });

  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: "Order processing failed", details: err.message });
  }
});

// Driver fetches all orders
app.get('/driver/orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Driver updates delivery status
app.post('/driver/update', async (req, res) => {
  const { orderId, status } = req.body;
  try {
    await pool.query(
      'UPDATE orders SET status=$1 WHERE order_id=$2',
      [status, orderId]
    );
    res.json({ message: `Order ${orderId} updated to ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// RabbitMQ connection function
async function connectRabbit() {
  try {
    const connection = await amqp.connect('amqp://localhost');
    const channel = await connection.createChannel();
    await channel.assertQueue('orders');
    console.log("✅ Connected to RabbitMQ");
    return channel;
  } catch (err) {
    console.error("❌ RabbitMQ connection failed:", err.message);
  }
}

// Middleware endpoint to enqueue order
app.post('/order/queue', async (req, res) => {
  const { orderId, address, client } = req.body;

  const channel = await connectRabbit();
  if (!channel) {
    return res.status(500).json({ error: "RabbitMQ not available" });
  }

  const order = { orderId, address, client };
  channel.sendToQueue('orders', Buffer.from(JSON.stringify(order)));
  console.log("📩 Order queued:", order);

  res.json({ message: "Order queued successfully", order });
});


app.listen(3000, () => console.log('Middleware running on http://localhost:3000'));
