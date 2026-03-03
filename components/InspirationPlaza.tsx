import React, { useState } from 'react';
import { InspirationPost } from '../types';
import { Heart, MessageCircle, Share2, Zap, ArrowRight } from 'lucide-react';

// Mock Data
const MOCK_POSTS: InspirationPost[] = [
  {
    id: '1', author: 'EcoArtist_99', avatar: 'https://i.pravatar.cc/150?u=1',
    image: 'https://images.unsplash.com/photo-1416339411116-62e1226aacd8?ixid=M3wxMjA3fDB8MXxzZWFyY2h8Mnx8dGVycmFyaXVtfGVufDB8fHx8MTc3MjUyMDMyNXww&ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=600',
    title: '废旧灯泡变身微景观，把春天装进瓶子', tags: ['#瓶罐艺术', '#微景观'],
    likes: 1240, comments: 45, imageAspect: '3/4'
  },
  {
    id: '2', author: 'RemuseMaster', avatar: 'https://i.pravatar.cc/150?u=2',
    image: 'https://images.unsplash.com/photo-1617646160236-db27e21e4efe?ixid=M3wxMjA3fDB8MXxzZWFyY2h8Mnx8aGFuZG1hZGUlMjBiYWd8ZW58MHx8fHwxNzcyNTIwMzI1fDA&ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=600',
    title: '只用一个下午，把旧牛仔裤改成了百搭托特包！', tags: ['#旧衣改造', '#缝纫'],
    likes: 892, comments: 23, imageAspect: '4/5'
  },
  {
    id: '3', author: 'GreenLife', avatar: 'https://i.pravatar.cc/150?u=3',
    image: 'https://images.unsplash.com/photo-1760842543713-108c3cadbba1?ixid=M3wxMjA3fDB8MXxzZWFyY2h8Mnx8bWFjcm8lMjBwYyUyMGJvYXJkfGVufDB8fHx8MTc3MjUyMDMyNnww&ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=600',
    title: '燃起来了！废旧主板制作的赛博朋克相框', tags: ['#电子再生', '#赛博手工'],
    likes: 2300, comments: 112, imageAspect: '1/1'
  },
  {
    id: '4', author: 'TeaLover', avatar: 'https://i.pravatar.cc/150?u=4',
    image: 'https://images.unsplash.com/photo-1758210480590-b46dee0a2a0a?ixid=M3wxMjA3fDB8MXxzZWFyY2h8Mnx8YnJvd24lMjBwYXBlciUyMHBhY2thZ2luZ3xlbnwwfHx8fDE3NzI1MjAzMjd8MA&ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=600',
    title: '霸王茶姬纸袋千万别扔，教你做三层收纳挂件', tags: ['#包装艺术', '#收纳'],
    likes: 567, comments: 12, imageAspect: '4/3'
  },
  {
    id: '5', author: 'WildChild', avatar: 'https://i.pravatar.cc/150?u=5',
    image: 'https://images.unsplash.com/photo-1619808799783-db68de98fbe0?ixid=M3wxMjA3fDB8MXxzZWFyY2h8Mnx8bWFjcmFtZXxlbnwwfHx8fDE3NzI1MjAzMjd8MA&ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=600',
    title: '捡回来的枯树枝，加上毛线就是北欧风墙饰', tags: ['#自然系', '#墙饰'],
    likes: 342, comments: 8, imageAspect: '3/5'
  },
  {
    id: '6', author: 'Luna_M', avatar: 'https://i.pravatar.cc/150?u=6',
    image: 'https://images.unsplash.com/photo-1687202163645-8be2de10ba7a?ixid=M3wxMjA3fDB8MXxzZWFyY2h8Mnx8cGVyZnVtZSUyMGJvdHRsZSUyMGFlc3RoZXRpY3xlbnwwfHx8fDE3NzI1MjAzMjd8MA&ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=600',
    title: '香水空瓶别丢？加点石膏做成高级香薰扩香石', tags: ['#瓶罐艺术', '#香薰'],
    likes: 1890, comments: 88, imageAspect: '2/3'
  },
  {
    id: '7', author: 'VintageHunter', avatar: 'https://i.pravatar.cc/150?u=7',
    image: 'https://images.unsplash.com/photo-1669725830523-0877270ee151?ixid=M3wxMjA3fDB8MXxzZWFyY2h8Mnx8a25pdHRpbmclMjB0aHJlYWR8ZW58MHx8fHwxNzcyNTIwMzI4fDA&ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=600',
    title: '闲置衬衫爆改零钱包，附带详细裁剪图纸', tags: ['#旧衣改造', '#手工'],
    likes: 456, comments: 34, imageAspect: '1/1'
  },
  {
    id: '8', author: 'CoffeeAddict', avatar: 'https://i.pravatar.cc/150?u=8',
    image: 'https://images.unsplash.com/photo-1603917847900-a99a99263fe4?ixid=M3wxMjA3fDB8MXxzZWFyY2h8Mnx8c21hbGwlMjBwbGFudCUyMHBvdHxlbnwwfHx8fDE3NzI1MjAzMjh8MA&ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=600',
    title: '外卖咖啡杯清洗后做的多肉小盆栽', tags: ['#包装艺术', '#植物'],
    likes: 1205, comments: 67, imageAspect: '4/5'
  },
  {
    id: '9', author: 'TechGeek', avatar: 'https://i.pravatar.cc/150?u=9',
    image: 'https://images.unsplash.com/photo-1626958390898-162d3577f293?ixid=M3wxMjA3fDB8MXxzZWFyY2h8Mnx8bWVjaGFuaWNhbCUyMGtleWJvYXJkfGVufDB8fHx8MTc3MjUyMDMyOXww&ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=600',
    title: '不要的键盘键帽扣下来！做一个专属解压魔方', tags: ['#电子再生', '#解压'],
    likes: 3410, comments: 201, imageAspect: '3/4'
  },
  {
    id: '10', author: 'WoodWorker', avatar: 'https://i.pravatar.cc/150?u=10',
    image: 'https://images.unsplash.com/photo-1650770028842-d9bd0fbc94f6?ixid=M3wxMjA3fDB8MXxzZWFyY2h8Mnx8ZHJpZWQlMjBmbG93ZXIlMjBuYXR1cmV8ZW58MHx8fHwxNzcyNTIwMzMwfDA&ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=600',
    title: '公园捡的落叶和松果，滴胶封存做成项链坠', tags: ['#自然系', '#首饰'],
    likes: 789, comments: 45, imageAspect: '4/3'
  },
  {
    id: '11', author: 'Nana_Handcraft', avatar: 'https://i.pravatar.cc/150?u=11',
    image: 'https://images.unsplash.com/photo-1685682589531-8d4fefb0fbd3?ixid=M3wxMjA3fDB8MXxzZWFyY2h8Mnx8dmludGFnZSUyMGJveGVzfGVufDB8fHx8MTc3MjUyMDMzMHww&ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=600',
    title: '铁皮糖盒的奇妙变身：桌面迷你收纳抽屉', tags: ['#瓶罐艺术', '#桌面改造'],
    likes: 2156, comments: 145, imageAspect: '1/1'
  },
  {
    id: '12', author: 'PaperWizard', avatar: 'https://i.pravatar.cc/150?u=12',
    image: 'https://images.unsplash.com/photo-1771809041469-72081343a32a?ixid=M3wxMjA3fDB8MXxzZWFyY2h8Mnx8Y2F0JTIwaW5zaWRlJTIwY2FyZGJvYXJkJTIwYm94fGVufDB8fHx8MTc3MjUyMDMzMXww&ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=600',
    title: '快递纸箱剪一剪，零成本拥有一面猫抓板墙', tags: ['#包装艺术', '#宠物'],
    likes: 5430, comments: 890, imageAspect: '3/4'
  }
];

const InspirationPlaza: React.FC = () => {
  const [activeTag, setActiveTag] = useState('全部');

  const tags = ['全部', '#旧衣改造', '#瓶罐艺术', '#电子再生', '#自然系', '#包装艺术'];

  const filteredPosts = activeTag === '全部' 
    ? MOCK_POSTS 
    : MOCK_POSTS.filter(post => post.tags.some(t => t.includes(activeTag) || activeTag.includes(t.replace('#', ''))));

  return (
    <div className="h-full overflow-y-auto pb-24 bg-remuse-dark">
      
      {/* 1. Weekly Challenge Banner */}
      <div className="relative w-full h-48 md:h-64 overflow-hidden mb-6 group cursor-pointer">
        <div className="absolute inset-0 bg-gradient-to-r from-remuse-accent via-green-400 to-remuse-secondary opacity-90 clip-corner-top z-10"></div>
        <img 
            src="https://images.unsplash.com/photo-1530541930197-ff16ac917b0e?auto=format&fit=crop&q=80&w=1000" 
            className="absolute inset-0 w-full h-full object-cover mix-blend-overlay grayscale group-hover:grayscale-0 transition-all duration-700"
            alt="Challenge BG"
        />
        
        {/* Geometric Decor */}
        <div className="absolute top-0 right-0 w-32 h-full bg-black/20 transform -skew-x-12 translate-x-10"></div>
        <div className="absolute bottom-0 left-10 w-20 h-2 bg-white/30"></div>

        <div className="absolute inset-0 z-20 flex flex-col justify-center px-6 md:px-12">
            <div className="inline-flex items-center gap-2 bg-black/80 text-white px-3 py-1 font-mono text-xs mb-2 self-start transform -skew-x-12">
                <Zap size={12} className="text-remuse-accent fill-current" />
                <span className="skew-x-12">本周挑战</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-black italic tracking-tighter drop-shadow-sm mb-2">
                #零废弃生活
            </h1>
            <p className="text-black font-bold text-sm md:text-base max-w-md">
                挑战规则：展示你如何将生活中的一次性塑料转化为永久性艺术品。
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs font-bold font-display bg-white text-black px-4 py-2 self-start rounded-full hover:scale-105 transition-transform">
                接受挑战 <ArrowRight size={14} />
            </div>
        </div>
      </div>

      {/* 2. Tag Filter - Horizontal Scroll */}
      <div className="px-4 mb-6 overflow-x-auto no-scrollbar">
        <div className="flex gap-3">
            {tags.map((tag, i) => (
                <button 
                    key={tag}
                    onClick={() => setActiveTag(tag)}
                    className={`
                        px-4 py-2 text-xs font-bold whitespace-nowrap transition-all transform hover:-translate-y-1
                        ${activeTag === tag 
                            ? 'bg-remuse-secondary text-black clip-corner' 
                            : 'bg-neutral-800 text-neutral-400 border border-neutral-700 clip-corner hover:border-remuse-secondary hover:text-white'}
                    `}
                >
                    {tag}
                </button>
            ))}
        </div>
      </div>

      {/* 3. Waterfall Content Flow */}
      <div className="px-4 columns-2 md:columns-3 xl:columns-4 gap-3 md:gap-4">
         {filteredPosts.map((post) => (
             <div key={post.id} className="bg-white group overflow-hidden hover:shadow-[0_0_15px_rgba(204,255,0,0.3)] transition-shadow duration-300 relative break-inside-avoid rounded-sm mb-3 md:mb-4">
                 {/* Image */}
                 <div className="relative overflow-hidden" style={{ aspectRatio: post.imageAspect || '3/4' }}>
                     <img 
                        src={post.image} 
                        alt={post.title} 
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                     />
                     <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-white text-[10px] px-2 py-1 font-mono rounded-full">
                         {post.tags[0]}
                     </div>
                 </div>

                 {/* Content Body */}
                 <div className="p-3 md:p-4">
                     <h3 className="text-black font-bold text-sm md:text-lg mb-2 md:mb-3 leading-tight group-hover:text-remuse-border transition-colors line-clamp-2">
                        {post.title}
                     </h3>
                     
                     <div className="flex items-center justify-between">
                         <div className="flex items-center gap-2">
                             <img src={post.avatar} alt={post.author} className="w-6 h-6 rounded-full border border-neutral-200" />
                             <span className="text-xs text-neutral-500 font-mono truncate max-w-[100px]">{post.author}</span>
                         </div>
                         
                         {/* Action Buttons - Energy Color */}
                         <div className="flex items-center gap-3">
                             <button className="flex items-center gap-1 text-black hover:text-remuse-secondary transition-colors group/btn">
                                 <Heart size={16} className="group-hover/btn:fill-current" />
                                 <span className="text-xs font-bold">{post.likes}</span>
                             </button>
                             <button className="text-black hover:text-remuse-secondary transition-colors">
                                 <MessageCircle size={16} />
                             </button>
                         </div>
                     </div>
                 </div>

                 {/* Decorative Corner */}
                 <div className="absolute bottom-0 right-0 w-3 h-3 bg-remuse-accent clip-corner-top"></div>
             </div>
         ))}
      </div>

      {/* Loading Sentinel */}
      <div className="py-8 text-center text-neutral-400 font-mono text-xs animate-pulse">
          LOADING STREAM...
      </div>
    </div>
  );
};

export default InspirationPlaza;
