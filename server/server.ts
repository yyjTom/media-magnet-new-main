import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './config/database';
import authRoutes from './routes/auth';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors({
  origin: (
    process.env.FRONTEND_URL
      ? [process.env.FRONTEND_URL]
      : ['http://localhost:5173', 'http://localhost:8080', 'http://localhost:3000']
  ),
  credentials: true
}));
app.use(express.json());

// 路由
app.use('/api/auth', authRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 启动服务器
async function startServer() {
  try {
    // 初始化数据库
    await initializeDatabase();
    console.log('数据库初始化完成');

    app.listen(PORT, () => {
      console.log(`服务器运行在端口 ${PORT}`);
      console.log(`健康检查: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('服务器启动失败:', error);
    process.exit(1);
  }
}

startServer();
