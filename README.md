## Press Club

一个用于为创业公司自动推荐媒体记者并生成外联文案的全栈应用。支持注册登录（邮箱验证码）、生成记者列表、生成个性化外联消息、历史记录与分页查看。

### 技术栈
- 前端：Vite + React 18 + TypeScript + Tailwind + shadcn-ui + React Router + TanStack Query
- 后端：Express 5 + TypeScript + MySQL(mysql2/promise) + JWT + Nodemailer

### 快速开始
```bash
npm i

# 启动后端（端口默认 3001）
npm run dev:server

# 启动前端（端口默认 5173）
npm run dev

# 或同时启动
npm run dev:full
```

### 环境变量
复制 `.env.example` 为 `.env` 并按需填写：

后端相关
- PORT=3001
- JWT_SECRET=your-jwt-secret
- DB_HOST=localhost
- DB_PORT=3306
- DB_USER=root
- DB_PASSWORD=your-password
- DB_NAME=media_magnet_users
- DB_POOL_SIZE=10
- EMAIL_HOST=smtpdm.aliyun.com
- EMAIL_PORT=465
- EMAIL_SECURE=true
- EMAIL_USER=noreply@yourdomain.com
- EMAIL_PASS=your-smtp-password
- EMAIL_FROM_NAME=Press Club
- FRONTEND_URL=http://localhost:5173

前端相关
- VITE_OPENAI_API_KEY=sk-...（当前为前端直连，建议迁移到后端代理）

### API 说明（节选）
认证与邮件
- POST `/api/auth/register` 注册并发送验证码
- POST `/api/auth/verify-email` 验证邮箱，返回 JWT
- POST `/api/auth/login` 登录，返回 JWT
- POST `/api/auth/resend-verification` 重发验证码
- GET  `/api/auth/test-email-config` 测试邮件配置

历史记录（均需 Bearer Token）
- POST `/api/auth/history/website` 保存用户提交的网站（同用户同 URL 1 分钟去重）
- GET  `/api/auth/history/website?limit=20&offset=0` 返回 `{ items, total }`
- POST `/api/auth/history/generation` 保存生成结果（同用户同 URL 5 分钟去重）
- GET  `/api/auth/history/generation?limit=20&offset=0` 返回 `{ items, total }`

链接校验（用于诊断，可选）
- POST `/api/auth/validate-urls` { urls: string[] }

### 数据库
启动时自动创建数据库与表：
- `users`、`user_sessions`、`user_website_history`、`user_generation_history`
- 已添加索引：
  - `user_website_history (user_id, created_at)`
  - `user_generation_history (user_id, created_at)`

### 重要说明与安全建议
- 生产环境不要在前端暴露 `VITE_OPENAI_API_KEY`，建议改为后端代理调用。
- 使用强随机的 `JWT_SECRET`，邮件密码建议使用应用专用密码。
- 部署时将 `FRONTEND_URL`/CORS 与 API 基地址改为环境变量驱动。

### 常见问题
- “链接有时 404/有时能打开”
  - 前端已改为始终显示链接；如需判断有效性可调用 `/validate-urls` 做诊断。
- 历史页重复记录
  - 已在前后端做防抖与去重；仍重复时请检查是否多标签页同时触发。

### 目录结构
```
server/              # Express 服务、路由与数据库初始化
  config/database.ts # 连接池与表结构/索引初始化
  routes/auth.ts     # 认证、历史、链接校验等接口
  middleware/auth.ts # JWT 鉴权中间件
  services/emailService.ts
src/
  pages/Index.tsx             # 首页（提交网址→生成结果）
  pages/HistoryPage.tsx       # 历史记录分页与详情
  components/JournalistList.tsx  # 生成与外联文案
  components/HeroSection.tsx  # 提交与登录入口
```

### 开发脚本
- `npm run dev` 前端开发
- `npm run dev:server` 后端开发
- `npm run dev:full` 前后端并行
- `npm run build` 前端打包
- `npm run preview` 预览

### TODO / 未来优化
- 后端代理 OpenAI，移除前端密钥
- 增加 `helmet` 与限流（express-rate-limit）
- 历史页前端分页 UI/加载更多
- 统一日志与错误码，便于排障
