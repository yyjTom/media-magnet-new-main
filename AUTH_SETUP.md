# 用户认证系统设置指南

## 功能概述

已为 Media Magnet 项目添加了完整的用户认证系统，包括：

- ✅ 用户注册（邮箱验证）
- ✅ 用户登录
- ✅ 邮箱验证码发送
- ✅ 用户状态管理
- ✅ MySQL 数据库存储

## 数据库配置

### MySQL 连接信息
- **服务器**: 39.105.14.29
- **端口**: 13306
- **密码**: i7zac5na8ecckE8H
- **数据库**: media_magnet_users（自动创建）

### 数据表结构

#### users 表
```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  verification_code VARCHAR(6) NULL,
  verification_expires DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### user_sessions 表
```sql
CREATE TABLE user_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(500) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## 环境变量配置

请在 `.env` 文件中配置以下变量：

```env
# OpenAI API 密钥
VITE_OPENAI_API_KEY=sk-your-openai-api-key-here

# 后端服务器配置
PORT=3001
JWT_SECRET=your-very-secure-jwt-secret-key-change-this

# 邮件服务配置（用于发送验证码）
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-email-password-or-app-password
```

### 邮件服务设置

为了发送验证码邮件，您需要：

1. **使用 Gmail**：
   - 开启两步验证
   - 生成应用专用密码
   - 将应用专用密码填入 `EMAIL_PASS`

2. **或使用其他邮件服务**：
   - 修改 `server/services/emailService.ts` 中的配置
   - 参考 nodemailer 文档配置其他邮件服务商

## 启动方式

### 方式1：分别启动前后端
```bash
# 启动后端服务器
npm run dev:server

# 新开终端，启动前端
npm run dev
```

### 方式2：同时启动（推荐）
```bash
npm run dev:full
```

## API 接口

### 注册
```
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "password123"
}
```

### 验证邮箱
```
POST /api/auth/verify-email
{
  "email": "user@example.com",
  "code": "123456"
}
```

### 登录
```
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}
```

### 重发验证码
```
POST /api/auth/resend-verification
{
  "email": "user@example.com"
}
```

## 前端组件

- `LoginModal`: 登录模态框
- `RegisterModal`: 注册和邮箱验证模态框
- `UserMenu`: 用户菜单（头像下拉菜单）
- `authService`: 认证服务管理类

## 使用流程

1. 用户点击"注册"按钮
2. 填写邮箱和密码
3. 系统发送验证码到邮箱
4. 用户输入验证码完成验证
5. 自动登录，显示用户菜单

## 注意事项

1. **安全性**：
   - 密码使用 bcrypt 加密存储
   - JWT token 有效期7天
   - 验证码10分钟过期

2. **邮件发送**：
   - 需要正确配置邮件服务
   - 建议使用应用专用密码而非真实密码

3. **数据库**：
   - 首次运行会自动创建数据库和表
   - 确保MySQL服务器可访问

## 故障排除

- **数据库连接失败**：检查MySQL服务器状态和连接信息
- **邮件发送失败**：检查邮件服务配置和网络连接
- **JWT错误**：检查JWT_SECRET配置
- **CORS错误**：确保前后端端口配置正确
