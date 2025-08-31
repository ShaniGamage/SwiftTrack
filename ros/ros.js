const express = require('express');
const app = express();
app.use(express.json());

// Fake route planning
app.post('/plan-route', (req, res) => {
  const { orderId, address } = req.body;

  res.json({
    orderId,
    route: `Optimized route to ${address}`,
    status: 'Planned'
  });
});

app.listen(4000, () => console.log('ROS mock running on http://localhost:4000'));
