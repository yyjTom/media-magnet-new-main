import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './config/database.js';
import authRoutes from './routes/auth.js';
import generateRoutes from './routes/generate.js';

dotenv.config();

export const app = express();

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


