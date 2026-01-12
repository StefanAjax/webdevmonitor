const { createServer } = require('./server');
const { startScheduler } = require('./scheduler');

const PORT = process.env.PORT || 3000;

// Catch unhandled errors to prevent crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = createServer();

app.listen(PORT, () => {
  console.log(`Web Monitor running at http://localhost:${PORT}`);
  console.log('Open the URL in your browser to manage websites');
  startScheduler();
});
