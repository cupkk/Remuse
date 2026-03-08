// ============================================================
// Sample Data — 示例藏品，让新用户快速体验产品
// ============================================================

import { CollectedItem, Difficulty, RemuseIdea } from '../types';
import { createItemOnServer } from './dataService';

interface SampleItemDef {
  name: string;
  category: string;
  material: string;
  imageUrl: string;
  story: string;
  tags: string[];
  ideas: RemuseIdea[];
  status: 'raw' | 'in-progress' | 'remused';
}

const SAMPLE_ITEMS: SampleItemDef[] = [
  {
    name: '星巴克城市限定杯',
    category: '奶茶周边',
    material: '陶瓷',
    imageUrl: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&q=80&w=400',
    story: '去年和闺蜜去旅行，在当地星巴克入手的城市限定杯。虽然杯子已经小磕了一块釉，但每次看到它都会想起那个阳光明媚的下午，我们坐在街角的咖啡店里笑到肚子疼。',
    tags: ['限定', '旅行纪念', '星巴克', '收藏'],
    ideas: [
      {
        title: '多肉微型花园',
        description: '将有缺陷的杯子改造成独一无二的多肉花园，让旅行的记忆在绿意中继续生长。',
        difficulty: Difficulty.EASY,
        materials: ['多肉植物', '营养土', '小石子', '苔藓'],
        steps: ['在杯底铺一层小石子作为排水层', '填入适量多肉营养土', '将 2-3 株小型多肉植物种入', '用苔藓和小石子装饰表面', '放在有散射光的窗台上'],
      },
      {
        title: '手工香薰蜡烛杯',
        description: '把限定杯变成香薰蜡烛，每次点燃都是一次旅行的回味。',
        difficulty: Difficulty.MEDIUM,
        materials: ['大豆蜡', '棉烛芯', '精油', '干花'],
        steps: ['将大豆蜡隔水加热至 65°C 使其融化', '在杯底用热熔胶固定棉烛芯', '待蜡液降温至 55°C 时加入喜欢的精油', '缓慢倒入杯中，可放入几片干花装饰', '静置 24 小时完全凝固后即可使用'],
      },
    ],
    status: 'raw',
  },
  {
    name: '复古玻璃汽水瓶',
    category: '瓶瓶罐罐',
    material: '玻璃',
    imageUrl: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&q=80&w=400',
    story: '从学校旁边的复古小店淘到的汽水瓶，瓶身上印着 80 年代的广告标语。老板说这是他爸爸年轻时候喝汽水攒下来的，一攒就是三十年。现在它在我的书桌上，装着来自不同季节的小物件。',
    tags: ['复古', '玻璃', '怀旧', '收藏'],
    ideas: [
      {
        title: '星空许愿瓶',
        description: '把玻璃瓶变成梦幻星空许愿瓶，装满你的小心愿和星光。',
        difficulty: Difficulty.EASY,
        materials: ['LED 铜线灯串', '棉花', '星星亮片', '彩色纸条'],
        steps: ['把 LED 灯串塞进瓶子里', '用棉花填充，制造云朵效果', '撒入星星亮片', '把心愿写在彩色纸条上卷好放入', '用麻绳和小标签装饰瓶口'],
      },
      {
        title: '时间胶囊瓶',
        description: '将瓶子做成时间胶囊，存入当下的美好，留给未来拆封。',
        difficulty: Difficulty.EASY,
        materials: ['照片', '小纸条', '贴纸', '干燥剂', '封蜡'],
        steps: ['打印几张最近的照片（缩小尺寸）', '写下此刻的心情和对未来的期许', '放入一些有意义的小物件（车票、花瓣等）', '加一包干燥剂防潮', '用封蜡密封瓶口，贴上开启日期'],
      },
    ],
    status: 'raw',
  },
  {
    name: '旧牛仔外套',
    category: '其他',
    material: '牛仔布 / 棉',
    imageUrl: 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?auto=format&fit=crop&q=80&w=400',
    story: '大学时期最爱的那一件牛仔外套，穿了整整四年。袖口磨出了毛边，口袋里好像还能找到当年偷偷塞进去的演唱会票根。现在虽然穿不下了，但每一道褶皱都记录着那些无忧无虑的日子。',
    tags: ['牛仔', '复古', '改造', '大学回忆'],
    ideas: [
      {
        title: '牛仔拼布托特包',
        description: '将旧牛仔外套裁剪拼接，做成独一无二的日常通勤包。',
        difficulty: Difficulty.HARD,
        materials: ['缝纫机', '剪刀', '内衬布', '包带', '针线'],
        steps: ['将外套拆分为若干布片，保留口袋和有趣的细节', '设计包身形状，裁剪布料', '用缝纫机将布片拼接成包的正反面', '加入内衬布和内袋', '缝合包体，安装包带', '保留原有的扣子做装饰'],
      },
      {
        title: '牛仔布相框',
        description: '用牛仔布包裹旧相框，让大学时光定格在最有温度的材质中。',
        difficulty: Difficulty.EASY,
        materials: ['旧相框', '热熔胶枪', '剪刀', '照片'],
        steps: ['量好相框尺寸，裁剪牛仔布料', '用热熔胶将牛仔布包裹在相框表面', '将口袋部分巧妙地装饰在角落', '放入大学时代的照片', '在角落插入一些干花作为装饰'],
      },
    ],
    status: 'raw',
  },
];

export async function loadSampleData(): Promise<CollectedItem[]> {
  const createdItems: CollectedItem[] = [];

  for (const def of SAMPLE_ITEMS) {
    try {
      const saved = await createItemOnServer({
        name: def.name,
        hallId: def.category,
        category: def.category,
        material: def.material,
        imageUrl: def.imageUrl,
        story: def.story,
        tags: def.tags,
        ideas: def.ideas,
        status: def.status,
        isSample: true,
        dateCollected: new Date().toISOString(),
      });
      createdItems.push(saved);
    } catch (err) {
      console.error(`创建示例物品「${def.name}」失败:`, err);
    }
  }

  return createdItems;
}

export async function clearSampleData(
  items: CollectedItem[],
  deleteItem: (id: string) => Promise<void>,
): Promise<void> {
  const sampleItems = items.filter((item) => item.isSample);

  for (const item of sampleItems) {
    try {
      await deleteItem(item.id);
    } catch (err) {
      console.error(`删除示例物品 ${item.id} 失败:`, err);
    }
  }
}
