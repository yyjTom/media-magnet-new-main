import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './config/database.js';
import authRoutes from './routes/auth.js';
import generateRoutes from './routes/generate.js';

// Load environment variables (only in development)
if (process.env.NODE_ENV !== 'production') {
  console.log('📋 Development mode: loading .env file');
  const result = dotenv.config();
  console.log('📋 .env file loaded:', result.error ? `❌ ${result.error}` : '✅ Success');
} else {
  console.log('📋 Production mode: using Vercel environment variables');
}

// Configure Node.js for better network connectivity
process.env.UV_THREADPOOL_SIZE = '16'; // Increase thread pool size
console.log('🔧 Node.js configured for better network connectivity');

// Debug: Check if environment variables are loaded
console.log('🔧 Environment variables loaded:');
console.log('- PORT:', process.env.PORT);
console.log('- GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.substring(0, 7)}...${process.env.GEMINI_API_KEY.substring(process.env.GEMINI_API_KEY.length - 4)}` : '❌ NOT FOUND');
console.log('- GEMINI_MODEL:', process.env.GEMINI_MODEL || 'gemini-2.0-flash');
console.log('- DB_URL:', process.env.DB_URL ? '✅ SET' : '❌ NOT SET');
console.log('- RESEND_API_KEY:', process.env.RESEND_API_KEY ? '✅ SET' : '❌ NOT SET');

export const app = express();

// Set server timeout to 3 minutes (180 seconds)
app.use((req, res, next) => {
  req.setTimeout(180000); // 3 minutes
  res.setTimeout(180000); // 3 minutes
  next();
});

app.use(cors({
  origin: (
    process.env.FRONTEND_URL
      ? [process.env.FRONTEND_URL]
      : ['http://localhost:5173', 'http://localhost:8080', 'http://localhost:3000']
  ),
  credentials: true
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/generate', generateRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

export const ready = initializeDatabase().then(() => {
  console.log('Database initialized');
});

export default app;


