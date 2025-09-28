# 阿里云邮件推送问题诊断

## 当前问题
邮件发送失败，错误信息：`Missing credentials for "PLAIN"`

## 可能的原因和解决方案

### 1. 发信地址配置问题
**检查项目：**
- 登录阿里云控制台 → 邮件推送
- 确认发信地址 `admin@capra.design` 状态为"验证通过"
- 如果状态不是"验证通过"，需要重新验证

### 2. SMTP密码问题
**解决步骤：**
1. 在阿里云控制台中找到发信地址 `admin@capra.design`
2. 点击"设置SMTP密码"
3. 重新生成SMTP密码
4. 将新密码更新到 `.env` 文件中的 `EMAIL_PASS`

### 3. 域名配置问题
**检查项目：**
- 确认域名 `capra.design` 在阿里云邮件推送中已添加并验证
- 检查域名的SPF、DKIM记录是否正确配置

### 4. 网络连接问题
**检查项目：**
- 确认服务器能访问 `smtpdm.aliyun.com:80`
- 检查防火墙是否阻止了80端口的出站连接

## 当前配置对比

### Java配置（工作正常）
```java
props.put("mail.smtp.host", "smtpdm.aliyun.com");
props.put("mail.smtp.port", "80");
props.put("mail.smtp.from", "admin@capra.design");
props.put("mail.user", "admin@capra.design");
props.put("mail.password", "YAng1991007");
```

### Node.js配置（当前）
```javascript
host: 'smtpdm.aliyun.com',
port: 80,
secure: false,
auth: {
  user: 'admin@capra.design',
  pass: 'YAng1991007'
}
```

## 建议的排查顺序

1. **首先检查阿里云控制台**
   - 发信地址状态
   - SMTP密码是否正确
   - 域名验证状态

2. **测试网络连接**
   ```bash
   telnet smtpdm.aliyun.com 80
   ```

3. **如果以上都正常，尝试其他端口**
   - 端口25（如果80不工作）
   - 端口465（SSL模式）

## 临时解决方案

如果邮件发送仍然有问题，可以：
1. 暂时禁用邮件验证，允许用户直接注册
2. 使用其他邮件服务商（如163、QQ邮箱）进行测试
3. 联系阿里云技术支持获取帮助

## 下一步行动

请按照以上步骤检查阿里云控制台的配置，特别是：
1. 重新生成SMTP密码
2. 确认发信地址状态
3. 更新 `.env` 文件中的密码

