const amqp = require('amqplib');
const axios = require('axios');
const soap = require('soap');
const net = require('net');

async function processOrders() {
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();
  await channel.assertQueue('orders');

  console.log("👷 Worker started. Waiting for messages...");

  channel.consume('orders', async (msg) => {
    if (msg !== null) {
      const order = JSON.parse(msg.content.toString());
      console.log("⚡ Processing order:", order);

      try {
        // 1️⃣ CMS SOAP
        const url = 'http://localhost:5000/cms?wsdl';
        const clientSoap = await soap.createClientAsync(url);
        const [cmsResult] = await clientSoap.CreateOrderAsync(order);

        // 2️⃣ ROS REST
        const rosResponse = await axios.post('http://localhost:4000/plan-route', order);

        // 3️⃣ WMS TCP
        const wmsResponse = await new Promise((resolve, reject) => {
          const tcpClient = new net.Socket();
          tcpClient.connect(6000, '127.0.0.1', () => {
            tcpClient.write(order.orderId);
          });

          tcpClient.on('data', (data) => {
            resolve(data.toString());
            tcpClient.destroy();
          });

          tcpClient.on('error', (err) => {
            reject("WMS error: " + err.message);
          });
        });

        console.log("✅ Order processed:", {
          cms: cmsResult,
          ros: rosResponse.data,
          wms: wmsResponse
        });

      } catch (err) {
        console.error("❌ Failed to process order:", err.message);
      }

      channel.ack(msg); // Acknowledge message
    }
  });
}

processOrders().catch(console.error);
