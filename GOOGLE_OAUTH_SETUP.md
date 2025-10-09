# Google OAuth 登录设置指南

本指南将帮助你为应用配置 Google OAuth 登录功能。

## 第一步：在 Google Cloud Console 创建项目

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 点击顶部的项目选择器，然后点击 **"新建项目"**
3. 输入项目名称（例如：Press Club）
4. 点击 **"创建"**

## 第二步：启用 Google+ API

1. 在左侧导航栏中，选择 **"API 和服务"** > **"库"**
2. 搜索 **"Google+ API"** 或 **"Google Identity"**
3. 点击并启用该 API

## 第三步：创建 OAuth 2.0 客户端 ID

1. 在左侧导航栏中，选择 **"API 和服务"** > **"凭据"**
2. 点击 **"创建凭据"** > **"OAuth 客户端 ID"**

### 配置 OAuth 同意屏幕（首次需要）

如果这是你第一次创建 OAuth 客户端 ID，系统会提示你配置 OAuth 同意屏幕：

1. 选择 **"外部"** 用户类型（除非你有 Google Workspace 组织）
2. 点击 **"创建"**
3. 填写应用信息：
   - **应用名称**：Press Club（或你的应用名称）
   - **用户支持电子邮件**：你的电子邮件
   - **应用徽标**：（可选）上传你的应用图标
   - **应用首页**：你的应用 URL
   - **授权域**：添加你的域名（例如：`pressclub.app`，不包括 `https://`）
   - **开发者联系信息**：你的电子邮件
4. 点击 **"保存并继续"**
5. 在 **"范围"** 页面，点击 **"添加或删除范围"**
6. 选择以下范围：
   - `email`
   - `profile`
   - `openid`
7. 点击 **"保存并继续"**
8. 在 **"测试用户"** 页面（如果应用处于测试模式），添加测试用户的电子邮件
9. 点击 **"保存并继续"**
10. 点击 **"返回控制台"**

### 创建 OAuth 客户端 ID

1. 再次点击 **"创建凭据"** > **"OAuth 客户端 ID"**
2. 选择应用类型：**"Web 应用"**
3. 输入名称：Press Club Web Client
4. 配置 **已获授权的 JavaScript 来源**：
   ```
   http://localhost:5173
   http://localhost:3000
   https://your-domain.com
   https://your-vercel-app.vercel.app
   ```
   注意：每个 URL 都需要单独添加，不要包含尾部斜杠
   
5. 配置 **已获授权的重定向 URI**（可选，对于我们的实现不是必需的）：
   ```
   http://localhost:5173
   https://your-domain.com
   ```

6. 点击 **"创建"**

7. 系统会显示你的 **客户端 ID** 和 **客户端密钥**
   - **客户端 ID**：类似 `123456789-abc123.apps.googleusercontent.com`
   - **客户端密钥**：我们的实现中不需要（仅客户端 ID 用于前端）

## 第四步：配置环境变量

### 本地开发环境

在项目根目录创建或更新 `.env` 文件：

```env
# 后端配置（用于验证 Google token）
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# 前端配置（用于显示 Google 登录按钮）
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

**注意**：前端和后端使用同一个 `GOOGLE_CLIENT_ID`

### Vercel 生产环境

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 选择你的项目
3. 进入 **"Settings"** > **"Environment Variables"**
4. 添加以下变量：

| 名称 | 值 | 环境 |
|------|-----|------|
| `GOOGLE_CLIENT_ID` | `your-google-client-id.apps.googleusercontent.com` | Production, Preview, Development |
| `VITE_GOOGLE_CLIENT_ID` | `your-google-client-id.apps.googleusercontent.com` | Production, Preview, Development |

5. 点击 **"Save"**
6. 重新部署你的应用

## 第五步：测试 Google 登录

1. 启动本地开发服务器：
   ```bash
   npm run dev:full
   ```

2. 访问应用首页
3. 点击 **"Sign in"** 或 **"Create Account"**
4. 你应该能看到 **"使用 Google 登录"** 按钮
5. 点击该按钮并使用你的 Google 账号登录
6. 成功登录后，你应该被重定向回应用

## 故障排除

### 错误：idpiframe_initialization_failed

**原因**：你的应用域名未添加到已获授权的 JavaScript 来源

**解决方案**：
1. 返回 Google Cloud Console
2. 确保你的应用 URL 已添加到 **"已获授权的 JavaScript 来源"**
3. 等待几分钟让更改生效

### 错误：Invalid client ID

**原因**：环境变量中的 `GOOGLE_CLIENT_ID` 或 `VITE_GOOGLE_CLIENT_ID` 不正确

**解决方案**：
1. 检查 `.env` 文件中的客户端 ID 是否正确
2. 确保客户端 ID 格式为 `xxxxxx.apps.googleusercontent.com`
3. 重启开发服务器

### 错误：Access blocked: This app's request is invalid

**原因**：OAuth 同意屏幕配置不完整或应用处于测试模式但用户不在测试用户列表中

**解决方案**：
1. 返回 Google Cloud Console > OAuth 同意屏幕
2. 确保所有必填字段都已填写
3. 如果应用处于测试模式，将用户电子邮件添加到测试用户列表
4. 或将应用发布到生产环境（需要 Google 审核）

### Google 登录按钮不显示

**原因**：Google Sign-In 脚本加载失败或环境变量未设置

**解决方案**：
1. 检查浏览器控制台是否有错误
2. 确保 `VITE_GOOGLE_CLIENT_ID` 已在 `.env` 文件中设置
3. 检查网络是否可以访问 `https://accounts.google.com/gsi/client`
4. 清除浏览器缓存并重新加载页面

## 数据库注意事项

Google 登录实现会自动在数据库中创建或更新用户记录：

- 新用户：自动创建账户，`email_verified` 设为 `TRUE`
- 现有用户：如果之前通过邮箱注册，会关联 Google ID

用户表新增字段：
- `google_id`：用户的 Google 唯一标识符
- `avatar_url`：用户的 Google 头像 URL
- `display_name`：用户的 Google 显示名称
- `password`：现在可为 `NULL`（Google 登录用户无密码）

## 安全最佳实践

1. **永远不要提交 `.env` 文件到 Git**
2. **定期轮换客户端密钥**（如果使用）
3. **限制 OAuth 同意屏幕的作用域**只请求必要的权限
4. **监控 Google Cloud Console 的使用情况**检测异常活动
5. **在生产环境使用 HTTPS**

## 更多资源

- [Google Identity 官方文档](https://developers.google.com/identity/gsi/web/guides/overview)
- [OAuth 2.0 最佳实践](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [Google Cloud Console](https://console.cloud.google.com/)

