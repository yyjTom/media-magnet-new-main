/**
 * Google Analytics 工具函数
 * 
 * 使用方法：
 * 1. 在 index.html 中替换 G-XXXXXXXXXX 为你的真实 GA 测量 ID
 * 2. 在组件中导入这些函数并调用
 */

/**
 * 发送自定义事件到 Google Analytics
 * @param eventName 事件名称
 * @param eventParams 事件参数
 */
export const trackEvent = (
  eventName: string,
  eventParams?: Record<string, any>
) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, eventParams);
    console.log('📊 GA Event:', eventName, eventParams);
  }
};

/**
 * 跟踪页面浏览
 * @param pagePath 页面路径
 * @param pageTitle 页面标题
 */
export const trackPageView = (pagePath: string, pageTitle?: string) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('config', 'G-GFXGJNK1XZ', {
      page_path: pagePath,
      page_title: pageTitle,
    });
    console.log('📊 GA Page View:', pagePath, pageTitle);
  }
};

/**
 * 跟踪用户登录
 * @param method 登录方式（Google、Email 等）
 */
export const trackLogin = (method: string) => {
  trackEvent('login', {
    method,
  });
};

/**
 * 跟踪用户注册
 * @param method 注册方式
 */
export const trackSignUp = (method: string) => {
  trackEvent('sign_up', {
    method,
  });
};

/**
 * 跟踪搜索操作
 * @param searchTerm 搜索词
 */
export const trackSearch = (searchTerm: string) => {
  trackEvent('search', {
    search_term: searchTerm,
  });
};

/**
 * 跟踪记者列表生成
 * @param count 生成的记者数量
 * @param companyName 公司名称
 */
export const trackJournalistListGenerated = (count: number, companyName?: string) => {
  trackEvent('journalist_list_generated', {
    event_category: 'engagement',
    journalist_count: count,
    company_name: companyName,
  });
};

/**
 * 跟踪 Outreach 生成
 * @param journalistName 记者姓名
 * @param outlet 媒体机构
 */
export const trackOutreachGenerated = (journalistName: string, outlet?: string) => {
  trackEvent('outreach_generated', {
    event_category: 'engagement',
    journalist_name: journalistName,
    outlet,
  });
};

/**
 * 跟踪按钮点击
 * @param buttonName 按钮名称
 * @param location 按钮位置
 */
export const trackButtonClick = (buttonName: string, location: string) => {
  trackEvent('button_click', {
    event_category: 'engagement',
    button_name: buttonName,
    location,
  });
};

/**
 * 跟踪外部链接点击
 * @param url 链接地址
 * @param linkText 链接文本
 */
export const trackOutboundLink = (url: string, linkText?: string) => {
  trackEvent('click', {
    event_category: 'outbound',
    event_label: linkText,
    transport_type: 'beacon',
    url,
  });
};

/**
 * 跟踪错误
 * @param errorMessage 错误信息
 * @param errorLocation 错误位置
 */
export const trackError = (errorMessage: string, errorLocation: string) => {
  trackEvent('exception', {
    description: errorMessage,
    fatal: false,
    location: errorLocation,
  });
};

