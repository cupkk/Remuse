
import React, { useState, useRef } from 'react';
import { CollectedItem, ExhibitionHall } from '../types';
import { Recycle, ArrowLeft, Box, Plus, X, Image as ImageIcon, Check } from 'lucide-react';

interface GalleryProps {
  items: CollectedItem[];
  halls: ExhibitionHall[];
  onSelectItem: (item: CollectedItem) => void;
  onAddHall: (name: string, imageUrl: string) => void;
}

const Gallery: React.FC<GalleryProps> = ({ items, halls, onSelectItem, onAddHall }) => {
  // State to track if we are in the main Lobby or inside a specific Hall
  const [selectedHallId, setSelectedHallId] = useState<string | null>(null);
  const [animatingHallId, setAnimatingHallId] = useState<string | null>(null);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newHallName, setNewHallName] = useState('');
  const [newHallImage, setNewHallImage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Group items by category (hall id) to display counts
  const categoryCounts = items.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleHallClick = (hallId: string) => {
    setAnimatingHallId(hallId);
    setTimeout(() => {
        setSelectedHallId(hallId);
        setAnimatingHallId(null);
    }, 400);
  };

  const handleCreateHall = (e: React.FormEvent) => {
    e.preventDefault();
    if (newHallName.trim() && newHallImage) {
      onAddHall(newHallName.trim(), newHallImage);
      setShowAddModal(false);
      setNewHallName('');
      setNewHallImage('');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      // Revoke previous blob URL to prevent memory leak
      if (newHallImage && newHallImage.startsWith('blob:')) {
        URL.revokeObjectURL(newHallImage);
      }
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setNewHallImage(url);
    }
  };

  // --- RENDER: INSIDE HALL (Item Grid) ---
  if (selectedHallId) {
    const currentHall = halls.find(h => h.id === selectedHallId);
    const filteredItems = items.filter(i => i.category === selectedHallId);
    
    return (
      <div className="p-4 md:p-8 h-full overflow-y-auto pb-24 bg-remuse-dark">
         <div className="mb-8 flex items-center gap-4">
            <button 
              onClick={() => setSelectedHallId(null)}
              className="p-2 bg-neutral-800 hover:bg-white hover:text-black transition-colors rounded-full"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
                <h2 className="text-2xl font-bold text-white font-display flex items-center gap-2">
                    {currentHall?.name || selectedHallId} <span className="text-remuse-accent">展厅</span>
                </h2>
                <p className="text-xs text-neutral-500 font-mono">
                    收录: {filteredItems.length.toString().padStart(2, '0')}
                </p>
            </div>
         </div>

         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-fade-in">
            {filteredItems.map((item) => (
              <div 
                key={item.id}
                onClick={() => onSelectItem(item)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectItem(item); } }}
                role="button"
                tabIndex={0}
                aria-label={`查看藏品: ${item.name}`}
                className="group relative bg-remuse-panel border border-remuse-border hover:border-remuse-accent transition-all cursor-pointer overflow-hidden flex flex-col focus:outline-none focus:ring-2 focus:ring-remuse-accent"
              >
                <div className="relative aspect-square overflow-hidden bg-black/50">
                  <img 
                    src={item.imageUrl} 
                    alt={item.name} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 opacity-80 group-hover:opacity-100"
                  />
                  <div className="absolute top-2 right-2">
                     {item.status === 'remused' && (
                       <div className="bg-remuse-accent text-black p-1">
                         <Recycle size={14} />
                       </div>
                     )}
                  </div>
                  <div className="absolute bottom-0 left-0 w-full p-3 bg-gradient-to-t from-black to-transparent pt-10">
                    <p className="font-mono text-xs text-remuse-accent mb-0.5">{item.material}</p>
                    <h3 className="font-display font-bold text-lg leading-tight text-white">{item.name}</h3>
                  </div>
                </div>
                <div className="p-3 border-t border-remuse-border bg-neutral-900/50 flex-1">
                  <p className="text-xs text-neutral-400 line-clamp-2 font-mono">"{item.story}"</p>
                </div>
              </div>
            ))}
            {filteredItems.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-20 border border-dashed border-neutral-800 text-neutral-500 rounded">
                    <Box size={48} strokeWidth={1} />
                    <p className="mt-4 font-mono">展厅筹备中...</p>
                    <p className="text-xs mt-2 text-neutral-400">请在扫描或编辑时选择此分类</p>
                </div>
            )}
         </div>
      </div>
    );
  }

  // --- RENDER: MUSEUM LOBBY (Hall Selection) ---
  return (
    <div className="p-6 md:p-12 h-full overflow-y-auto pb-32 relative">
        {/* Header Greeting */}
        <div className="text-center mb-12 animate-fade-in">
            <h1 className="text-xl md:text-2xl font-display text-white tracking-wide mb-2">
                <span className="text-neutral-500">::</span> 馆长，日安 <span className="text-neutral-500">::</span>
            </h1>
            <p className="text-[10px] text-neutral-400 uppercase tracking-widest">
                Select Exhibition Hall
            </p>
        </div>

        {/* Hall Grid */}
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-x-4 gap-y-8 md:gap-x-8 md:gap-y-12">
            {halls.map((hall, index) => {
                const count = categoryCounts[hall.id] || 0;
                const isAnimating = animatingHallId === hall.id;

                return (
                    <div 
                        key={hall.id}
                        onClick={() => handleHallClick(hall.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleHallClick(hall.id); } }}
                        role="button"
                        tabIndex={0}
                        aria-label={`进入${hall.name}展厅，已收录 ${count} 件藏品`}
                        className={`flex flex-col items-center group cursor-pointer focus:outline-none focus:ring-2 focus:ring-remuse-accent rounded-lg ${isAnimating ? 'z-50' : 'z-10'}`}
                        style={{ animationDelay: `${index * 50}ms` }}
                    >
                        {/* House Shape Card Container */}
                        <div className={`relative w-full aspect-[4/5] drop-shadow-[0_0_1px_rgba(255,255,255,0.3)] transition-all duration-300 group-hover:drop-shadow-[0_0_8px_rgba(204,255,0,0.5)] ${isAnimating ? 'animate-expand-hall' : 'hover:-translate-y-2'}`}>
                            
                            {/* The Actual House Shape */}
                            <div className="w-full h-full bg-white clip-house relative overflow-hidden">
                                {/* Cover Image Area (Top 75%) */}
                                <div className="absolute top-0 left-0 w-full h-[75%] bg-neutral-200 overflow-hidden">
                                    <img 
                                        src={hall.imageUrl} 
                                        alt={hall.name}
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 saturate-100" 
                                    />
                                    {/* Inner Shine Effect */}
                                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent to-white/30 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                </div>

                                {/* Text Area (Bottom 25%) */}
                                <div className="absolute bottom-0 left-0 w-full h-[25%] bg-white flex flex-col justify-center items-center px-2 z-20">
                                    <h3 className="text-black font-bold font-display text-sm md:text-base leading-tight truncate w-full text-center">
                                        {hall.name}
                                    </h3>
                                    <span className="text-[10px] text-neutral-400 font-mono mt-0.5">
                                        No.{count.toString().padStart(3, '0')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* Add New Hall Button */}
            <div 
              onClick={() => setShowAddModal(true)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowAddModal(true); } }}
              role="button"
              tabIndex={0}
              aria-label="创建新展馆"
              className="flex flex-col items-center group cursor-pointer z-10 focus:outline-none focus:ring-2 focus:ring-remuse-accent rounded-lg"
            >
               <div className="relative w-full aspect-[4/5] transition-all duration-300 hover:-translate-y-2">
                 <div className="w-full h-full bg-transparent clip-house relative overflow-hidden border border-neutral-800 group-hover:border-remuse-accent/70 transition-colors">
                    <div className="absolute inset-[10%] border-2 border-dashed border-neutral-700 group-hover:border-remuse-accent flex flex-col items-center justify-center gap-4 transition-colors">
                      <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center group-hover:bg-remuse-accent group-hover:text-black transition-colors">
                        <Plus size={24} />
                      </div>
                      <span className="font-display text-xs text-neutral-400 group-hover:text-remuse-accent">创建新展馆</span>
                    </div>
                 </div>
               </div>
            </div>
        </div>

        {/* Create Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
             <div className="bg-remuse-panel border border-remuse-border w-full max-w-sm p-6 relative clip-corner">
                <button 
                  onClick={() => {
                    // Revoke blob URL when cancelling (hall NOT created)
                    if (newHallImage && newHallImage.startsWith('blob:')) {
                      URL.revokeObjectURL(newHallImage);
                    }
                    setShowAddModal(false);
                    setNewHallName('');
                    setNewHallImage('');
                  }}
                  className="absolute top-4 right-4 text-neutral-500 hover:text-white"
                >
                  <X size={20} />
                </button>
                
                <h2 className="text-xl font-bold text-white font-display mb-6">新增展馆档案</h2>
                
                <form onSubmit={handleCreateHall} className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono text-neutral-500 mb-2">展馆名称</label>
                    <input 
                      type="text" 
                      value={newHallName}
                      onChange={(e) => setNewHallName(e.target.value)}
                      placeholder="例如：我的旅行收藏"
                      className="w-full bg-neutral-900 border border-neutral-700 p-3 text-white focus:border-remuse-accent outline-none font-mono text-sm"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-neutral-500 mb-2">封面图片</label>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
                      role="button"
                      tabIndex={0}
                      aria-label="点击上传封面图"
                      className="w-full h-32 border-2 border-dashed border-neutral-700 hover:border-remuse-accent cursor-pointer flex flex-col items-center justify-center overflow-hidden bg-neutral-900 relative focus:outline-none focus:ring-2 focus:ring-remuse-accent"
                    >
                       {newHallImage ? (
                         <img src={newHallImage} alt="Preview" className="w-full h-full object-cover" />
                       ) : (
                         <div className="text-center text-neutral-500">
                           <ImageIcon size={24} className="mx-auto mb-2" />
                           <span className="text-[10px]">点击上传封面图</span>
                         </div>
                       )}
                       <input 
                          type="file" 
                          ref={fileInputRef} 
                          className="hidden" 
                          accept="image/*"
                          onChange={handleImageUpload}
                       />
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={!newHallName || !newHallImage}
                    className={`w-full py-3 mt-4 font-bold font-display flex items-center justify-center gap-2 transition-colors
                      ${(!newHallName || !newHallImage) 
                        ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' 
                        : 'bg-remuse-accent text-black hover:bg-white'}
                    `}
                  >
                    <Check size={18} /> 确认创建
                  </button>
                </form>
             </div>
          </div>
        )}
    </div>
  );
};

export default Gallery;
