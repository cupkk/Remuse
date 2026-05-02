export interface NfcGiftPalette {
  glow: string;
  spotlight: string;
  panelTint: string;
}

export interface NfcGiftShowcaseCopy {
  title: string;
  subtitle: string;
  stickerCaption: string;
  tags: string[];
}

export interface NfcGiftShowcaseBlueprintEntry {
  slug: string;
  capsuleLabel: string;
  archiveCode: string;
  sourceItemId: string;
  palette: NfcGiftPalette;
  copy: NfcGiftShowcaseCopy;
}

export const NFC_GIFT_SHOWCASE_BLUEPRINT: NfcGiftShowcaseBlueprintEntry[] = [
  {
    slug: 'campus-cup',
    capsuleLabel: 'NFC 档案 01',
    archiveCode: 'RM-GIFT-213-01',
    sourceItemId: '73befc1b-a704-440b-a973-086198f604b9',
    palette: {
      glow: 'rgba(255, 188, 92, 0.26)',
      spotlight: '#ffcd7b',
      panelTint: 'rgba(255, 193, 124, 0.08)',
    },
    copy: {
      title: '夏午珍珠奶茶',
      subtitle: '这杯奶茶把夏天最轻的一阵风留在了杯底。轻触 NFC，先看真实原图，再看它被重新写成展页封面后的样子。',
      stickerCaption: '夏天的甜，今天也陪你出场。',
      tags: ['夏日旧物', '奶茶记忆', '午后微甜'],
    },
  },
  {
    slug: 'denim-pocket',
    capsuleLabel: 'NFC 档案 02',
    archiveCode: 'RM-GIFT-213-02',
    sourceItemId: '0339f4b2-e549-4bd7-900d-bf9c56dd4f3a',
    palette: {
      glow: 'rgba(102, 215, 255, 0.26)',
      spotlight: '#7fe8ff',
      panelTint: 'rgba(114, 214, 255, 0.08)',
    },
    copy: {
      title: '陪我四年的牛仔外套',
      subtitle: '袖口磨起的毛边、口袋里遗落的票根，都还留在这件旧外套里。轻触 NFC，就能把这段穿了四年的旧时光，完整地收进这页档案里。',
      stickerCaption: '旧口袋还记得那场演唱会。',
      tags: ['校园旧衣', '单宁记忆', '演唱会票根'],
    },
  },
  {
    slug: 'midnight-ticket',
    capsuleLabel: 'NFC 档案 03',
    archiveCode: 'RM-GIFT-213-03',
    sourceItemId: '80322af9-4441-4d92-8d78-b49e6be1e577',
    palette: {
      glow: 'rgba(204, 255, 0, 0.26)',
      spotlight: '#ccff00',
      panelTint: 'rgba(204, 255, 0, 0.08)',
    },
    copy: {
      title: '放课后的秘密色纸',
      subtitle: '这张色纸像被课本夹住的一小段青春，安静，却一直没有褪色。轻触 NFC，把那段没说出口的心事重新翻出来看看。',
      stickerCaption: '放课后的心事，我替你先收好。',
      tags: ['青春收藏', '纸品档案', '放课后'],
    },
  },
  {
    slug: 'bottlecap-badge',
    capsuleLabel: 'NFC 档案 04',
    archiveCode: 'RM-GIFT-213-04',
    sourceItemId: '86a761da-9a52-418b-9d58-223b3c6b5e49',
    palette: {
      glow: 'rgba(255, 124, 102, 0.24)',
      spotlight: '#ff9c7c',
      panelTint: 'rgba(255, 145, 122, 0.08)',
    },
    copy: {
      title: '复古玻璃汽水瓶',
      subtitle: '它原本只是旧货店货架上的一只玻璃瓶，现在成了装住季节碎片的小容器。轻触 NFC，看看这件真实旧物怎样被重新整理成一页可以分享出去的好物档案。',
      stickerCaption: '这一瓶，装的是慢慢攒下来的旧时光。',
      tags: ['玻璃器物', '复古小店', '桌面收藏'],
    },
  },
  {
    slug: 'metro-pass',
    capsuleLabel: 'NFC 档案 05',
    archiveCode: 'RM-GIFT-213-05',
    sourceItemId: 'c33746bd-9c63-4fa8-b189-d4d951b803d9',
    palette: {
      glow: 'rgba(255, 167, 128, 0.24)',
      spotlight: '#ffc18a',
      panelTint: 'rgba(255, 181, 142, 0.08)',
    },
    copy: {
      title: '排排站的小伙伴',
      subtitle: '它们挨在一起站好的样子，很像把今天的小小开心也排整齐了。轻触 NFC，看看我怎样把这一排软乎乎的陪伴，整理成一张可以分享出去的好物卡。',
      stickerCaption: '把今天的好心情，也一起递给你。',
      tags: ['毛绒收藏', '小伙伴', '治愈时刻'],
    },
  },
  {
    slug: 'sweater-button',
    capsuleLabel: 'NFC 档案 06',
    archiveCode: 'RM-GIFT-213-06',
    sourceItemId: '0e850be0-328f-4b1a-8c4c-99495699e9c4',
    palette: {
      glow: 'rgba(255, 166, 200, 0.22)',
      spotlight: '#ffc0dd',
      panelTint: 'rgba(255, 184, 217, 0.08)',
    },
    copy: {
      title: '云端入梦小像',
      subtitle: '小小的睡脸像把噪音按下静音键，让人一眼就慢下来。轻触 NFC，看看它怎样从桌角摆件变成一页柔软的公开展页。',
      stickerCaption: '今晚的好梦，我帮你先守着。',
      tags: ['治愈摆件', '云朵小像', '柔软时刻'],
    },
  },
  {
    slug: 'cassette-ribbon',
    capsuleLabel: 'NFC 档案 07',
    archiveCode: 'RM-GIFT-213-07',
    sourceItemId: '54001625-8ff9-486e-b1a8-a89a0e01f760',
    palette: {
      glow: 'rgba(196, 133, 255, 0.24)',
      spotlight: '#d4b2ff',
      panelTint: 'rgba(206, 155, 255, 0.08)',
    },
    copy: {
      title: '库迪×柯南联名纸袋',
      subtitle: '一只纸袋也可以被认真收藏，因为它背后站着一整段熟悉的角色记忆。轻触 NFC，看看这份联名周边怎样被重新装进一张轻巧的好物卡里。',
      stickerCaption: '今日份推理能量，已经替你装袋。',
      tags: ['联名周边', '角色收藏', '咖啡纸袋'],
    },
  },
  {
    slug: 'paper-crane',
    capsuleLabel: 'NFC 档案 08',
    archiveCode: 'RM-GIFT-213-08',
    sourceItemId: '6aac3038-9b21-4993-8387-198e5e339c7f',
    palette: {
      glow: 'rgba(194, 255, 124, 0.22)',
      spotlight: '#ddff9a',
      panelTint: 'rgba(203, 255, 145, 0.08)',
    },
    copy: {
      title: '童话毛绒小队',
      subtitle: '这组玩偶像从旧童话里一起走出来，负责把人重新带回软软的安全区。轻触 NFC，看看它们的真实照片、封面和贴纸怎样被串成同一页好物体验。',
      stickerCaption: '童话入口开着，欢迎你靠近一点。',
      tags: ['毛绒收藏', '童话感', '治愈玩偶'],
    },
  },
  {
    slug: 'film-roll',
    capsuleLabel: 'NFC 档案 09',
    archiveCode: 'RM-GIFT-213-09',
    sourceItemId: '85a97c78-8d39-4d8b-9afd-23318a53f7f9',
    palette: {
      glow: 'rgba(255, 206, 118, 0.22)',
      spotlight: '#ffd889',
      panelTint: 'rgba(255, 214, 136, 0.08)',
    },
    copy: {
      title: '城市限定咖啡杯',
      subtitle: '旅行结束之后，最容易留下来的往往不是照片，而是一只每天还会继续使用的杯子。轻触 NFC，看看这件城市限定周边如何把一个下午重新端回眼前。',
      stickerCaption: '那个午后，我还替你暖着。',
      tags: ['旅行纪念', '咖啡杯', '城市限定'],
    },
  },
  {
    slug: 'concert-band',
    capsuleLabel: 'NFC 档案 10',
    archiveCode: 'RM-GIFT-213-10',
    sourceItemId: 'e2134695-f205-43bf-8797-f1fefef6a93e',
    palette: {
      glow: 'rgba(95, 255, 216, 0.22)',
      spotlight: '#9effe9',
      panelTint: 'rgba(118, 255, 220, 0.08)',
    },
    copy: {
      title: '瑞幸万店纪念套装',
      subtitle: '深蓝色包材把一次品牌庆典变成了能拿在手里的具体时刻。轻触 NFC，看看这套纪念周边怎样被整理成一张能直接分享给朋友的数字好物卡。',
      stickerCaption: '万店同庆这一站，我替你留了位置。',
      tags: ['品牌周边', '纪念套装', '蓝色包装'],
    },
  },
];
