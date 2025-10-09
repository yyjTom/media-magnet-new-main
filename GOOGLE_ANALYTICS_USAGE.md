# Google Analytics 使用示例

本文档展示如何在项目中使用 Google Analytics 跟踪用户行为。

## 🎯 已配置的跟踪函数

所有跟踪函数都在 `src/lib/googleAnalytics.ts` 中定义。

## 📝 使用示例

### 1. 跟踪记者列表生成

在 `src/components/JournalistList.tsx` 中：

```typescript
import { trackJournalistListGenerated } from '@/lib/googleAnalytics';

// 当成功加载记者列表时
useEffect(() => {
  if (data?.journalists.length === 10) {
    trackJournalistListGenerated(10, companyName);
  }
}, [data]);
```

### 2. 跟踪 Outreach 生成

在 `src/components/JournalistList.tsx` 中：

```typescript
import { trackOutreachGenerated } from '@/lib/googleAnalytics';

// 当 outreach 生成成功时
const result = await getEmailBody({
  journalist,
  companyName,
  companyDescription,
  website
});

trackOutreachGenerated(journalist.name, journalist.outlet);
```

### 3. 跟踪用户登录

在 `src/components/auth/LoginModal.tsx` 中：

```typescript
import { trackLogin } from '@/lib/googleAnalytics';

// Google 登录成功后
const handleGoogleResponse = async (response: any) => {
  try {
    const result = await authService.googleLogin(response.credential);
    trackLogin('Google');
    // ...
  } catch (error) {
    // ...
  }
};

// 邮箱登录成功后
const onSubmit = async (values: LoginFormValues) => {
  try {
    await authService.login(values.email, values.password);
    trackLogin('Email');
    // ...
  } catch (error) {
    // ...
  }
};
```

### 4. 跟踪用户注册

在 `src/components/auth/RegisterModal.tsx` 中：

```typescript
import { trackSignUp } from '@/lib/googleAnalytics';

// Google 注册成功后
const handleGoogleResponse = async (response: any) => {
  try {
    const result = await authService.googleLogin(response.credential);
    trackSignUp('Google');
    // ...
  } catch (error) {
    // ...
  }
};

// 邮箱注册成功后
const onSubmit = async (values: RegisterFormValues) => {
  try {
    await authService.register(values.email, values.password, values.name);
    trackSignUp('Email');
    // ...
  } catch (error) {
    // ...
  }
};
```

### 5. 跟踪按钮点击

在 `src/components/HeroSection.tsx` 中：

```typescript
import { trackButtonClick } from '@/lib/googleAnalytics';

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  
  trackButtonClick('Find Journalists', 'hero_section');
  
  onWebsiteSubmit({
    companyName: companyNameValue,
    companyDescription: companyDescriptionValue,
    website: websiteValue
  });
};
```

### 6. 跟踪外部链接点击

在 `src/components/JournalistList.tsx` 中：

```typescript
import { trackOutboundLink } from '@/lib/googleAnalytics';

const handleGoogleSearch = () => {
  const searchQuery = `${journalist.name} journalist`;
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
  
  trackOutboundLink(googleUrl, `Search: ${journalist.name}`);
  
  window.open(googleUrl, '_blank', 'noopener,noreferrer');
};
```

### 7. 跟踪错误

在错误处理中：

```typescript
import { trackError } from '@/lib/googleAnalytics';

try {
  // ... 某些操作
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  trackError(errorMessage, 'JournalistList/generateOutreach');
  
  // 显示错误给用户
}
```

### 8. 跟踪页面浏览（React Router）

在 `src/App.tsx` 中：

```typescript
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '@/lib/googleAnalytics';

function App() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location]);

  return (
    // ...
  );
}
```

## 🎯 推荐跟踪的事件

根据你的业务需求，建议跟踪以下关键事件：

### ✅ 高优先级（已实现）

- ✅ 用户注册（Email、Google）
- ✅ 用户登录（Email、Google）
- ✅ 记者列表生成
- ✅ Outreach 生成
- ✅ Google 搜索点击
- ✅ 按钮点击

### 📋 中优先级（建议添加）

- 📋 查看历史记录
- 📋 复制 Outreach 内容
- 📋 点击 "View Message" 按钮
- 📋 切换不同的 Outreach 渠道（Email、X、LinkedIn）
- 📋 点击记者的 LinkedIn/X 链接

### 🔮 低优先级（可选）

- 🔮 页面停留时间
- 🔮 滚动深度
- 🔮 表单字段填写时间
- 🔮 错误发生频率

## 📊 在 Google Analytics 中查看数据

1. 登录 [Google Analytics](https://analytics.google.com/)
2. 选择你的媒体资源
3. 查看关键报告：

### 实时报告
- **报告 > 实时** - 查看当前活跃用户

### 事件报告
- **报告 > 参与度 > 事件** - 查看所有自定义事件
  - `journalist_list_generated` - 记者列表生成次数
  - `outreach_generated` - Outreach 生成次数
  - `login` - 登录次数（按方式分组）
  - `sign_up` - 注册次数
  - `button_click` - 按钮点击次数

### 转化报告
1. 在 **配置 > 事件** 中，将关键事件标记为转化
2. 在 **报告 > 转化** 中查看转化漏斗

## 🔍 调试 Google Analytics

### 方法 1：使用浏览器控制台

所有跟踪函数都会在控制台输出日志（以 📊 开头），方便调试：

```
📊 GA Event: journalist_list_generated { event_category: 'engagement', journalist_count: 10, company_name: 'Acme Corp' }
```

### 方法 2：使用 Google Analytics DebugView

1. 安装 [Google Analytics Debugger](https://chrome.google.com/webstore/detail/google-analytics-debugger/) Chrome 扩展
2. 启用扩展后访问你的网站
3. 在 GA4 中打开 **配置 > DebugView**
4. 实时查看所有事件

### 方法 3：使用 Chrome DevTools Network 面板

1. 打开 Chrome DevTools
2. 切换到 **Network** 标签
3. 过滤 `google-analytics.com` 或 `gtag`
4. 查看发送的请求和参数

## ⚡ 性能优化建议

1. **延迟加载 GA 脚本**：在 `index.html` 中已使用 `async` 属性
2. **批量发送事件**：GA 会自动批量处理事件
3. **避免过度跟踪**：只跟踪对业务有意义的事件

## 🔒 隐私合规

如果你的用户在欧盟或其他有隐私法规的地区，建议：

1. 添加 Cookie 同意横幅（推荐使用 [CookieYes](https://www.cookieyes.com/) 或 [OneTrust](https://www.onetrust.com/)）
2. 在隐私政策中说明使用 Google Analytics
3. 提供用户选择退出跟踪的选项

### 条件加载 GA（基于用户同意）

```typescript
// src/lib/googleAnalytics.ts
export const initGoogleAnalytics = (userConsent: boolean) => {
  if (userConsent && typeof window !== 'undefined') {
    // 动态加载 GA 脚本
    const script = document.createElement('script');
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX';
    script.async = true;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function() {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', 'G-XXXXXXXXXX');
  }
};
```

## 📈 成功指标示例

根据你的业务目标，设置这些关键指标：

1. **注册转化率**：访问者中注册的比例
2. **生成记者列表成功率**：搜索中成功生成列表的比例
3. **Outreach 生成率**：查看记者中生成 outreach 的比例
4. **Google 搜索点击率**：用户点击搜索按钮的频率

---

**注意**：记得在 `index.html` 和 `src/lib/googleAnalytics.ts` 中将 `G-XXXXXXXXXX` 替换为你的真实 GA 测量 ID！

