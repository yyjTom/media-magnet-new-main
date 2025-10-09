# Google Analytics 设置指南

## 📊 如何获取 Google Analytics ID

### 1. 创建 Google Analytics 账户

1. 访问 [Google Analytics](https://analytics.google.com/)
2. 使用你的 Google 账户登录
3. 点击 "开始测量"（Start measuring）

### 2. 创建账户和媒体资源

1. **账户名称**：输入你的公司或项目名称（例如：Press Club）
2. **媒体资源名称**：输入网站名称（例如：Press Club App）
3. **时区和货币**：选择适合你的设置
4. **行业类别**：选择 "Technology" 或相关类别

### 3. 设置数据流

1. 选择 **"网站"** 作为平台
2. **网站 URL**：
   - 开发环境：`http://localhost:8080`
   - 生产环境：`https://你的域名.com`
3. **数据流名称**：例如 "Press Club Website"
4. 点击 **"创建数据流"**

### 4. 获取测量 ID

创建数据流后，你会看到：
- **测量 ID**（格式：`G-XXXXXXXXXX`）
- 这就是你需要的 Google Analytics ID

示例：`G-ABC123DEF4`

## 🔧 配置项目

### 方法 1：直接在 `index.html` 中替换

1. 打开 `index.html` 文件
2. 找到这两行：
   ```html
   <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
   ```
   和
   ```javascript
   gtag('config', 'G-XXXXXXXXXX');
   ```
3. 将 `G-XXXXXXXXXX` 替换为你的真实测量 ID

### 方法 2：使用环境变量（推荐）

如果你想要更灵活的配置（开发/生产环境使用不同的 ID）：

1. 在 Vercel 项目设置中添加环境变量：
   - 变量名：`VITE_GA_MEASUREMENT_ID`
   - 值：你的 GA 测量 ID（例如：`G-ABC123DEF4`）

2. 修改代码以使用环境变量（参考高级配置部分）

## 📈 验证设置

### 实时测试

1. 部署网站后，打开 Google Analytics
2. 进入 **报告 > 实时**
3. 在新标签页打开你的网站
4. 几秒钟后，你应该能在"实时"报告中看到你的访问

### 调试模式

在浏览器控制台中运行：
```javascript
gtag('event', 'test_event', { 'debug_mode': true });
```

然后在 Google Analytics 的 **DebugView** 中查看事件。

## 🎯 自定义事件跟踪

你可以在代码中添加自定义事件来跟踪特定的用户行为：

### 示例 1：跟踪按钮点击

```typescript
// 在按钮点击事件中
const handleFindJournalists = () => {
  // Google Analytics 事件
  if (window.gtag) {
    window.gtag('event', 'find_journalists', {
      event_category: 'engagement',
      event_label: 'hero_section_button'
    });
  }
  
  // 你的原有逻辑...
};
```

### 示例 2：跟踪 Outreach 生成

```typescript
// 当 outreach 生成成功时
if (window.gtag) {
  window.gtag('event', 'outreach_generated', {
    event_category: 'conversion',
    journalist_name: journalist.name,
    outlet: journalist.outlet
  });
}
```

### 示例 3：跟踪 Google 登录

```typescript
// 在 Google 登录成功后
if (window.gtag) {
  window.gtag('event', 'login', {
    method: 'Google'
  });
}
```

## 🚀 常用事件类型

Google Analytics 4 推荐的事件：

- **页面浏览**（自动跟踪）
- `login` - 用户登录
- `sign_up` - 用户注册
- `search` - 搜索操作
- `share` - 分享内容
- `purchase` - 购买（如果你添加支付功能）

## 🔒 隐私合规

根据 GDPR 和其他隐私法规，你可能需要：

1. **添加 Cookie 同意横幅**
2. **更新隐私政策**，说明你使用 Google Analytics
3. **配置数据保留设置**（在 GA 管理界面）

### IP 匿名化（可选）

在 GA4 中，IP 地址默认是匿名的，但你可以在配置中明确指定：

```javascript
gtag('config', 'G-XXXXXXXXXX', {
  'anonymize_ip': true
});
```

## 📱 高级配置

### 跟踪单页应用路由变化

如果你使用 React Router，可以手动发送页面浏览事件：

```typescript
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    if (window.gtag) {
      window.gtag('config', 'G-XXXXXXXXXX', {
        page_path: location.pathname + location.search
      });
    }
  }, [location]);
}

// 在 App.tsx 中使用
function App() {
  usePageTracking();
  // ...
}
```

## 🛠️ TypeScript 类型定义

在 `src/vite-env.d.ts` 中添加：

```typescript
interface Window {
  gtag: (
    command: 'config' | 'event' | 'js' | 'set',
    targetId: string | Date,
    config?: Record<string, any>
  ) => void;
  dataLayer: any[];
}
```

## 📊 有用的报告

设置完成后，查看这些报告：

1. **实时** - 当前访问者
2. **用户获取** - 用户从哪里来
3. **参与度 > 事件** - 用户执行的操作
4. **参与度 > 网页和屏幕** - 最受欢迎的页面
5. **转化** - 设置目标转化（如注册、生成记者列表）

## 🎯 设置转化目标

1. 在 GA4 中，进入 **配置 > 事件**
2. 找到你想作为转化的事件（如 `sign_up`）
3. 切换 **"标记为转化"**

这样你就可以跟踪关键业务指标了！

## 🔗 有用的资源

- [Google Analytics 4 官方文档](https://support.google.com/analytics/answer/10089681)
- [GA4 事件参考](https://support.google.com/analytics/answer/9267735)
- [GA4 测量协议](https://developers.google.com/analytics/devguides/collection/protocol/ga4)

---

**注意**：替换 `index.html` 中的 `G-XXXXXXXXXX` 为你的真实测量 ID 后，即可开始收集数据！

