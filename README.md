## Press Club

一个用于为创业公司自动推荐媒体记者并生成外联文案的全栈应用。支持注册登录（邮箱验证/未验证自动引导）、根据网址或公司描述生成记者列表、默认预取个性化外联消息、历史记录与分页查看。

### 技术栈
- 前端：Vite + React 18 + TypeScript + Tailwind + shadcn-ui + React Router + TanStack Query
- 后端：Express 5 + TypeScript + MySQL(mysql2/promise) + JWT + Resend（事务邮件 API）
- 部署：Vercel（Serverless）。`api/index.ts` 作为入口，前端静态由 Vercel 托管，`vercel.json` 使用 rewrites。

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
- DB_HOST=localhost（或使用 DB_URL）
- DB_PORT=3306
- DB_USER=root
- DB_PASSWORD=your-password
- DB_NAME=media_magnet_users
- DB_POOL_SIZE=10
- DB_URL=mysql://user:pass@host:port/dbname（支持 TiDB Cloud，自动启用 TLS）
- DB_SSL=true（使用分散变量时启用 TLS）
- DB_SKIP_CREATE=true（托管库不允许 CREATE DATABASE 时启用）
- FRONTEND_URL=http://localhost:5173

邮件（Resend）
- RESEND_API_KEY=你的 Resend API Key
- EMAIL_FROM=you@your-verified-domain.com（在 Resend 验证过的域名地址）
- EMAIL_FROM_NAME=Press Club

前端相关
- VITE_OPENAI_API_KEY=sk-...（当前为前端直连，建议迁移到后端代理）

### API 说明（节选）
认证与邮件
- POST `/api/auth/register` 注册并发送验证码
- POST `/api/auth/verify-email` 验证邮箱，返回 JWT
- POST `/api/auth/login` 登录，返回 JWT；错误码：
  - `MISSING_CREDENTIALS` 缺少邮箱或密码
  - `INVALID_CREDENTIALS` 邮箱或密码错误
  - `EMAIL_NOT_VERIFIED` 邮箱未验证（前端会自动引导到验证步骤）
- POST `/api/auth/resend-verification` 重发验证码
- GET  `/api/auth/test-email-config` 测试邮件配置

历史记录（均需 Bearer Token）
- POST `/api/auth/history/website` 保存用户提交的网站（同用户同 URL 1 分钟去重）
- GET  `/api/auth/history/website?limit=20&offset=0` 返回 `{ items, total }`
- POST `/api/auth/history/generation` 保存生成结果（同用户同 URL 5 分钟去重）
- GET  `/api/auth/history/generation?limit=20&offset=0` 返回 `{ items, total }`

链接校验（用于诊断，可选）
- POST `/api/auth/validate-urls` { urls: string[] }

健康检查
- GET `/health` → { status: 'OK', timestamp }

### 数据库
启动时自动创建数据库与表：
- `users`、`user_sessions`、`user_website_history`、`user_generation_history`
- 已添加索引：
  - `user_website_history (user_id, created_at)`
  - `user_generation_history (user_id, created_at)`
支持托管数据库：
- TiDB Cloud Serverless（示例：`DB_URL`），自动启用 TLS；可配 `DB_SKIP_CREATE=true` 跳过建库。
- 也可使用 PlanetScale（需 TLS，且不支持 CREATE DATABASE）。

### 重要说明与安全建议
- 生产环境不要在前端暴露 `VITE_OPENAI_API_KEY`，建议改为后端代理调用。
- 使用强随机的 `JWT_SECRET`。
- 部署时将 `FRONTEND_URL`/CORS 与 API 基地址改为环境变量驱动。Vercel 生产环境前端默认调用同域 `/api`。

### 目录结构
```
server/              # Express 服务、路由与数据库初始化
  config/database.ts # 连接池与表结构/索引初始化
  routes/auth.ts     # 认证、历史、链接校验等接口
  middleware/auth.ts # JWT 鉴权中间件
  services/emailService.ts # 使用 Resend 发送事务邮件
api/
  index.ts           # Vercel Serverless 入口，复用 Express app
src/
  pages/Index.tsx             # 首页（提交网址/描述→生成结果，自动滚动）
  pages/HistoryPage.tsx       # 历史记录分页与详情
  components/JournalistList.tsx  # 生成与外联文案（默认并发预取前 N 条）
  components/HeroSection.tsx  # 提交与登录入口（支持 URL 或描述）
vercel.json          # 仅使用 rewrites，前端走 index.html，后端走 /api
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

### 新增特性（近期）
- 输入支持“URL 或公司描述”，自动判定并映射到提示词；URL 自动补全 https
- 记者列表默认并发预取前 6 条外联文案，点击即可即时展示
- 未验证用户登录时自动跳转到“验证邮箱”弹窗并预填邮箱
