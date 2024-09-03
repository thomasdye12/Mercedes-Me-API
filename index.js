const express = require('express');
const { connectWebSocket } = require('./support/socket');
const routes = require('./support/routes');

const app = express();
const port = 5007;

app.use(express.json());
app.use('/', routes);

connectWebSocket();

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
