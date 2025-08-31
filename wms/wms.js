const net = require('net');

// Create TCP server
const server = net.createServer((socket) => {
  console.log("Client connected to WMS");

  // When client sends data
  socket.on('data', (data) => {
    console.log("Received from Middleware:", data.toString());

    // Reply back with a warehouse update
    socket.write(`WMS ACK: Package ${data.toString()} is ready for dispatch`);
  });

  socket.on('end', () => {
    console.log("Client disconnected from WMS");
  });
});

server.listen(6000, () => {
  console.log("WMS mock TCP server running on port 6000");
});
