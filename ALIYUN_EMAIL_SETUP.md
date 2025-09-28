# 阿里云邮件推送配置指南

## 配置步骤

### 1. 阿里云邮件推送服务设置

1. 登录阿里云控制台
2. 搜索并进入"邮件推送"服务
3. 创建发信域名（需要域名备案）
4. 配置发信地址（如：noreply@yourdomain.com）
5. 获取SMTP密码

### 2. 环境变量配置

在项目根目录的 `.env` 文件中添加以下配置：

```env
# 服务器配置
PORT=3001

# JWT 密钥（请在生产环境中更改为强密码）
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# 阿里云邮件服务配置
EMAIL_HOST=smtpdm.aliyun.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=noreply@yourdomain.com
EMAIL_PASS=your-smtp-password
EMAIL_FROM_NAME=Media Magnet

# 前端地址（用于CORS）
FRONTEND_URL=http://localhost:5173
```

### 3. 配置说明

- `EMAIL_HOST`: 阿里云SMTP服务器地址，固定为 `smtpdm.aliyun.com`
- `EMAIL_PORT`: SMTP端口，使用SSL时为465
- `EMAIL_SECURE`: 是否使用SSL，设置为true
- `EMAIL_USER`: 在阿里云邮件推送中配置的发信地址
- `EMAIL_PASS`: 阿里云邮件推送提供的SMTP密码（不是阿里云账户密码）
- `EMAIL_FROM_NAME`: 发件人显示名称

### 4. 测试配置

启动服务器后，可以访问以下接口测试邮件配置：

```
GET http://localhost:3001/api/auth/test-email-config
```

### 5. 常见问题

#### 问题1: 发送邮件失败
- 检查发信地址是否在阿里云邮件推送中正确配置
- 确认SMTP密码是否正确
- 验证域名是否已备案并通过验证

#### 问题2: 邮件被拒收
- 确保发信域名已完成SPF、DKIM等配置
- 检查邮件内容是否符合反垃圾邮件规范

#### 问题3: 连接超时
- 检查服务器网络是否能访问阿里云SMTP服务器
- 确认端口465是否被防火墙阻止

### 6. 生产环境注意事项

1. 使用强密码作为JWT_SECRET
2. 定期更换SMTP密码
3. 监控邮件发送量，避免超出配额
4. 配置邮件发送频率限制，防止滥用

## 支持的邮件服务商

除了阿里云，本系统还支持其他邮件服务商：

- **腾讯企业邮箱**: `EMAIL_HOST=smtp.exmail.qq.com`
- **网易邮箱**: `EMAIL_HOST=smtp.163.com`
- **Gmail**: `EMAIL_HOST=smtp.gmail.com`

只需修改相应的HOST和PORT配置即可。

