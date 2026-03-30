export const DEFAULT_WORKFLOW_TEMPLATES = [
  {
    slug: 'amazon-monitor',
    title: '亚马逊商品监控',
    description: '自动打开目标商品页，提取价格和标题，并保留截图供后续复盘。',
    category: '电商',
    tags: ['电商', '数据抓取'],
    authorName: 'CloudFlow 官方',
    published: true,
    featured: true,
    installCount: 12450,
    rating: 4.9,
    definition: {
      nodes: [
        {
          clientNodeId: '1',
          type: 'open_page',
          url: 'https://example.com/product',
        },
        {
          clientNodeId: '2',
          type: 'extract',
          selector: 'h1',
          property: 'text',
        },
        {
          clientNodeId: '3',
          type: 'extract',
          selector: '.price',
          property: 'text',
        },
        {
          clientNodeId: '4',
          type: 'screenshot',
          scope: 'viewport',
        },
      ],
    },
  },
  {
    slug: 'daily-briefing',
    title: '每日新闻摘要推送',
    description: '抓取首页标题和摘要块，保存截图，适合作为日报类自动化模板。',
    category: '效率',
    tags: ['效率', '通知'],
    authorName: 'CloudFlow 官方',
    published: true,
    featured: false,
    installCount: 5100,
    rating: 4.8,
    definition: {
      nodes: [
        {
          clientNodeId: '1',
          type: 'open_page',
          url: 'https://news.ycombinator.com/',
        },
        {
          clientNodeId: '2',
          type: 'extract',
          selector: '.titleline a',
          property: 'text',
        },
        {
          clientNodeId: '3',
          type: 'scroll',
          direction: 'down',
          distance: 600,
        },
        {
          clientNodeId: '4',
          type: 'screenshot',
          scope: 'full',
        },
      ],
    },
  },
  {
    slug: 'site-change-monitor',
    title: '竞品网站变动监控',
    description: '定时打开竞品页面，滚动抓取首屏后全页截图，适合改版监控和视觉巡检。',
    category: '监控',
    tags: ['监控', '竞品分析'],
    authorName: 'CloudFlow 官方',
    published: true,
    featured: true,
    installCount: 3600,
    rating: 4.6,
    definition: {
      nodes: [
        {
          clientNodeId: '1',
          type: 'open_page',
          url: 'https://example.com',
        },
        {
          clientNodeId: '2',
          type: 'wait',
          time: 1500,
        },
        {
          clientNodeId: '3',
          type: 'scroll',
          direction: 'down',
          distance: 800,
        },
        {
          clientNodeId: '4',
          type: 'screenshot',
          scope: 'full',
        },
      ],
    },
  },
] as const;
