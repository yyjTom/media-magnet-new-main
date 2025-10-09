# Vercel 环境变量配置指南

## 🔧 必需的环境变量

在 Vercel 项目设置中配置以下环境变量：

### 1. 数据库配置

```
DB_URL=mysql://user:password@host:port/database
```

示例：
```
DB_URL=mysql://admin:mypassword@mysql.example.com:3306/pressclub
```

### 2. Gemini AI 配置

```
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.0-flash
```

### 3. JWT 配置

```
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

**重要**：使用强随机字符串，至少 32 个字符。

生成方法：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. 邮件服务配置

```
RESEND_API_KEY=re_your_resend_api_key
```

### 5. Google OAuth 配置

```
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

### 6. 前端环境变量（带 VITE_ 前缀）

```
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
VITE_GA_MEASUREMENT_ID=G-GFXGJNK1XZ
```

**注意**：前端环境变量必须以 `VITE_` 开头才能在客户端代码中访问。

### 7. （可选）代理配置

如果服务器在需要代理的环境中（如中国）：

```
HTTPS_PROXY=http://your-proxy-server:port
HTTP_PROXY=http://your-proxy-server:port
```

**重要**：Vercel 在全球都有节点，通常**不需要**设置代理。

## 📝 在 Vercel 中配置环境变量

### 方法 1：通过 Vercel Dashboard

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 选择你的项目（`media-magnet-new-main`）
3. 进入 **Settings** → **Environment Variables**
4. 点击 **Add New** 添加每个环境变量：
   - **Key**: 变量名（如 `GEMINI_API_KEY`）
   - **Value**: 变量值
   - **Environments**: 选择应用的环境
     - ✅ **Production** - 生产环境（必选）
     - ✅ **Preview** - 预览环境（可选）
     - ⬜ **Development** - 本地开发（不需要）

5. 点击 **Save**

### 方法 2：通过 Vercel CLI

```bash
# 安装 Vercel CLI（如果还没安装）
npm i -g vercel

# 登录
vercel login

# 添加环境变量
vercel env add GEMINI_API_KEY production
# 然后粘贴你的 API key

# 批量添加（创建 .env.production 文件后）
vercel env pull .env.production
```

## 🌍 环境配置建议

### Production（生产环境）

- `FRONTEND_URL`: `https://pressclub.app`（如果设置）
- `GOOGLE_CLIENT_ID`: 生产环境的 Google OAuth Client ID
- `VITE_GOOGLE_CLIENT_ID`: 同上（带 VITE_ 前缀）
- `GEMINI_API_KEY`: 生产环境的 Gemini API key
- `DB_URL`: 生产数据库连接
- `RESEND_API_KEY`: 生产邮件服务 key
- `JWT_SECRET`: 强随机字符串
- `VITE_GA_MEASUREMENT_ID`: `G-GFXGJNK1XZ`

### Preview（预览环境）

- 可以使用与生产环境相同的配置
- 或者设置测试数据库和测试 API keys

### Development（本地开发）

- **不要**在 Vercel 中配置
- 在本地创建 `.env` 文件（已在 `.gitignore` 中）
- 使用测试/开发环境的 credentials

## 🔒 安全最佳实践

### 1. 不要提交敏感信息

❌ **永远不要**将这些文件提交到 Git：
```
.env
.env.local
.env.production
.env.development
```

✅ **确保** `.gitignore` 包含：
```
.env*
!.env.example
```

### 2. 使用不同的 credentials

- 生产环境：使用独立的、强密钥
- 开发环境：使用测试 credentials
- 永远不要在开发中使用生产 credentials

### 3. 定期轮换密钥

- JWT_SECRET: 每 6 个月
- API keys: 当团队成员离职时
- 数据库密码: 每年

### 4. 限制访问权限

- 只给需要的团队成员访问 Vercel 环境变量
- 使用 Vercel Teams 功能管理权限

## ✅ 验证配置

### 部署后检查

1. **健康检查**：
   ```
   curl https://pressclub.app/health
   ```
   应该返回：
   ```json
   {"status":"OK","timestamp":"2025-..."}
   ```

2. **API 端点测试**：
   ```bash
   # 测试注册（应该返回错误或成功消息）
   curl -X POST https://pressclub.app/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"test123"}'
   ```

3. **查看日志**：
   - Vercel Dashboard → 你的项目 → **Deployments**
   - 点击最新部署 → **Function Logs**
   - 检查是否有环境变量相关的错误

### 常见错误

#### ❌ "GEMINI_API_KEY not found"
**解决**：在 Vercel 中添加 `GEMINI_API_KEY` 环境变量

#### ❌ "DB_URL not set"
**解决**：在 Vercel 中添加 `DB_URL` 环境变量

#### ❌ "Google Client ID mismatch"
**解决**：
1. 检查 `VITE_GOOGLE_CLIENT_ID` 是否正确
2. 在 Google Cloud Console 中添加 `https://pressclub.app` 到授权来源

#### ❌ "CORS error"
**解决**：检查 `server/app.ts` 中的 CORS 配置是否包含你的域名

## 🚀 部署后更新环境变量

如果更新了环境变量：

1. 在 Vercel Dashboard 中更新变量值
2. **重要**：更新后需要重新部署
   - 方法 1：在 Dashboard 中点击 **Redeploy**
   - 方法 2：推送新的 commit 触发自动部署

## 📋 环境变量清单

部署前确保所有必需的变量都已配置：

- [ ] `DB_URL`
- [ ] `GEMINI_API_KEY`
- [ ] `GEMINI_MODEL`（可选，默认 `gemini-2.0-flash`）
- [ ] `JWT_SECRET`
- [ ] `RESEND_API_KEY`
- [ ] `GOOGLE_CLIENT_ID`
- [ ] `VITE_GOOGLE_CLIENT_ID`
- [ ] `VITE_GA_MEASUREMENT_ID`

## 🔗 相关资源

- [Vercel 环境变量文档](https://vercel.com/docs/concepts/projects/environment-variables)
- [Vite 环境变量文档](https://vitejs.dev/guide/env-and-mode.html)
- [Google OAuth 设置指南](./GOOGLE_OAUTH_SETUP.md)
- [Google Analytics 设置指南](./GOOGLE_ANALYTICS_SETUP.md)

---

**重要提醒**：配置完环境变量后，记得重新部署项目以使更改生效！

