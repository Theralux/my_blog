import type { UserThemeConfig } from 'valaxy-theme-yun'
import { defineValaxyConfig } from 'valaxy'

export default defineValaxyConfig<UserThemeConfig>({
  theme: 'yun',

  themeConfig: {
    type: 'nimbo',
    colors: {
      primary: '#0078E7',
    },
    // 首页大字与浏览器标题分别配置。
    banner: {
      enable: true,
      title: ['lux', 'の', '手札'],
    },
    nav: [
      { text: '文章', link: '/posts/', icon: 'i-ri-article-line' },
      { text: '归档', link: '/archives/', icon: 'i-ri-archive-line' },
      { text: '分类', link: '/categories/', icon: 'i-ri-folder-2-line' },
      { text: '标签', link: '/tags/', icon: 'i-ri-price-tag-3-line' },
      { text: '关于', link: '/about/', icon: 'i-ri-user-line' },
    ],
    pages: [
      { name: '归档', url: '/archives/', icon: 'i-ri-archive-line' },
      { name: '分类', url: '/categories/', icon: 'i-ri-folder-2-line' },
      { name: '标签', url: '/tags/', icon: 'i-ri-price-tag-3-line' },
      { name: '关于', url: '/about/', icon: 'i-ri-user-line' },
      {
        name: '友情链接',
        url: '/links/',
        icon: 'i-ri-links-line',
      },
    ],
    postCard: {
      titleClass: '',
    },
    // 有自己的插画后，放到 public/images/ 并在这里填写 url。
    bg_image: {
      enable: false,
    },
    say: {
      enable: false,
      api: '',
      hitokoto: {
        enable: false,
        api: '',
      },
    },
    fireworks: {
      enable: false,
    },
    footer: {
      since: 2026,
      icon: {
        enable: false,
      },
      beian: {
        enable: false,
        icp: '',
      },
    },
  },

  unocss: {
    safelist: [
      'i-ri-home-line',
      'i-ri-article-line',
      'i-ri-archive-line',
      'i-ri-folder-2-line',
      'i-ri-price-tag-3-line',
      'i-ri-user-line',
      'i-ri-links-line',
    ],
  },
})
