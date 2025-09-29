import { app, ready } from './app.js';

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    await ready;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Server failed to start:', error);
    process.exit(1);
  }
}

startServer();
