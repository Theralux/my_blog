import { defineSiteConfig } from 'valaxy'

export default defineSiteConfig({
  // 上线时替换为正式网址；这里只用于本地预览。
  url: 'http://localhost:4859/',
  lang: 'zh-CN',
  languages: ['zh-CN'],
  timezone: 'Asia/Shanghai',
  title: 'luxの手札',
  subtitle: 'Theralux 的个人手札',
  description: '记录与分享，留下一些值得回看的片段。',
  author: {
    name: 'Theralux',
    avatar: '/images/avatar.jpg',
    email: '',
    link: '',
    intro: '欢迎来到 luxの手札。',
    status: {
      emoji: '✍️',
      message: '写下一些日常。',
    },
  },
  favicon: '/favicon.svg',
  feed: {
    favicon: '/favicon.svg',
  },
  // 确定自己的公开账号后，在这里添加社交链接。
  social: [],
  search: {
    enable: true,
    provider: 'fuse',
  },
  fuse: {
    options: {
      keys: ['title', 'tags', 'categories', 'excerpt'],
    },
  },
  comment: {
    enable: false,
  },
  sponsor: {
    enable: false,
    methods: [],
  },
  license: {
    enabled: false,
  },
})
