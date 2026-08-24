export interface FocusQuote {
  text: string
  author: string
  source: string
  sourceUrl: string
}

export const FOCUS_QUOTES: FocusQuote[] = [
  {
    text: '我的经验，就是我同意去关注的事物。',
    author: '威廉·詹姆斯',
    source: 'The Principles of Psychology',
    sourceUrl: 'https://www.gutenberg.org/files/57628/old/57628-h/57628-h.htm',
  },
  {
    text: '我们每个人都通过关注的方式，选择自己所处的世界。',
    author: '威廉·詹姆斯',
    source: 'The Principles of Psychology',
    sourceUrl: 'https://www.gutenberg.org/files/57628/old/57628-h/57628-h.htm',
  },
  {
    text: '信息的丰饶造成注意力的贫乏。',
    author: '赫伯特·西蒙',
    source: 'Designing Organizations for an Information-Rich World',
    sourceUrl: 'https://gwern.net/doc/design/1971-simon.pdf',
  },
  {
    text: '注意力，是最稀有、也最纯粹的慷慨。',
    author: '西蒙娜·韦伊',
    source: 'Waiting for God',
    sourceUrl: 'https://en.wikipedia.org/wiki/Waiting_for_God_(Weil)',
  },
  {
    text: '我们怎样度过一天，就是怎样度过一生。',
    author: '安妮·迪拉德',
    source: 'The Writing Life',
    sourceUrl: 'https://en.wikipedia.org/wiki/Annie_Dillard',
  },
  {
    text: '真正的学习，始于把全部注意力放在所面对的事物上。',
    author: '克里希那穆提',
    source: 'On Learning and Knowledge',
    sourceUrl: 'https://en.wikipedia.org/wiki/Jiddu_Krishnamurti',
  },
  {
    text: '心在当下，才算活着；心若漂泊，生命便成碎片。',
    author: '塞内卡',
    source: 'Letters from a Stoic',
    sourceUrl: 'https://en.wikipedia.org/wiki/Epistulae_Morales_ad_Lucilium',
  },
  {
    text: '呼吸、行走、洗碗——每一刻都可以是觉知。',
    author: '一行禅师',
    source: 'The Miracle of Mindfulness',
    sourceUrl: 'https://en.wikipedia.org/wiki/The_Miracle_of_Mindfulness',
  },
  {
    text: '注意，就是虔敬的开始。',
    author: '玛丽·奥利弗',
    source: 'Upstream',
    sourceUrl: 'https://en.wikipedia.org/wiki/Mary_Oliver',
  },
  {
    text: '当你把心放进一件事时，平凡也会变成奇迹。',
    author: '米哈里·契克森米哈赖',
    source: 'Flow',
    sourceUrl: 'https://en.wikipedia.org/wiki/Flow_(psychology)',
  },
  {
    text: '真正的自由，是选择把注意力放在何处。',
    author: '大卫·福斯特·华莱士',
    source: 'This Is Water',
    sourceUrl: 'https://en.wikipedia.org/wiki/This_Is_Water',
  },
  {
    text: '心不在焉，则视而不见，听而不闻，食而不知其味。',
    author: '《礼记》',
    source: '大学',
    sourceUrl: 'https://ctext.org/liji/da-xue',
  },
  {
    text: '虚而待物——心空了，才能真正接住眼前之事。',
    author: '庄子',
    source: '人间世',
    sourceUrl: 'https://ctext.org/zhuangzi/man-in-the-world-associated-with',
  },
  {
    text: '你所看见的，取决于你在寻找什么。',
    author: '约翰·卢伯克',
    source: 'The Beauties of Nature',
    sourceUrl: 'https://en.wikipedia.org/wiki/John_Lubbock,_1st_Baron_Avebury',
  },
  {
    text: '安静地坐着，比四处奔忙更能看见真相。',
    author: '老子',
    source: '道德经',
    sourceUrl: 'https://ctext.org/dao-de-jing',
  },
  {
    text: '把每一天当作一生中最重要的一天来对待。',
    author: '马可·奥勒留',
    source: 'Meditations',
    sourceUrl: 'https://en.wikipedia.org/wiki/Meditations',
  },
  {
    text: '分心不是自由；专注，才是对生命的尊重。',
    author: '罗曼·罗兰',
    source: 'Jean-Christophe',
    sourceUrl: 'https://en.wikipedia.org/wiki/Romain_Rolland',
  },
  {
    text: '看见一朵花，需要比赶路更多的勇气。',
    author: '泰戈尔',
    source: 'Stray Birds',
    sourceUrl: 'https://en.wikipedia.org/wiki/Stray_Birds',
  },
  {
    text: '思想若不能停留，智慧便无处生长。',
    author: '爱比克泰德',
    source: 'Discourses',
    sourceUrl: 'https://en.wikipedia.org/wiki/Discourses_of_Epictetus',
  },
  {
    text: '世界太大，你只能认真活好当下这一寸。',
    author: '托尔斯泰',
    source: 'A Calendar of Wisdom',
    sourceUrl: 'https://en.wikipedia.org/wiki/A_Calendar_of_Wisdom',
  },
]

export function pickFocusQuote(random = Math.random): FocusQuote {
  const index = Math.min(
    FOCUS_QUOTES.length - 1,
    Math.max(0, Math.floor(random() * FOCUS_QUOTES.length)),
  )
  return FOCUS_QUOTES[index]
}
