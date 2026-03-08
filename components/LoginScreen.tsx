import React, { useState } from 'react';

interface LoginScreenProps {
  onGuestLogin: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, nickname: string) => Promise<void>;
  loading?: boolean;
  error?: string | null;
}

const LoginScreen: React.FC<LoginScreenProps> = ({
  onGuestLogin,
  onLogin,
  onRegister,
  loading = false,
  error = null,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const displayError = error || localError;

  const validate = () => {
    if (!email.trim() || !password.trim()) {
      setLocalError('请填写邮箱和密码');
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setLocalError('邮箱格式不正确');
      return false;
    }
    if (password.length < 6) {
      setLocalError('密码至少 6 位');
      return false;
    }
    if (mode === 'register' && !nickname.trim()) {
      setLocalError('请填写昵称');
      return false;
    }
    setLocalError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      if (mode === 'login') {
        await onLogin(email, password);
      } else {
        await onRegister(email, password, nickname || '馆长');
      }
    } catch (err: any) {
      setLocalError(err.message || '操作失败');
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-gradient-to-br from-stone-900 via-stone-800 to-amber-900 overflow-auto">
      {/* 背景装饰 */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute top-10 left-10 w-32 h-32 rounded-full bg-amber-400 blur-3xl" />
        <div className="absolute bottom-20 right-10 w-40 h-40 rounded-full bg-orange-500 blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-24 h-24 rounded-full bg-yellow-300 blur-2xl" />
      </div>

      {/* Logo 区域 */}
      <div className="relative z-10 text-center mb-8">
        <div className="text-5xl mb-3">🏛️</div>
        <h1 className="text-2xl font-bold text-amber-100 tracking-wider">再生博物馆</h1>
        <p className="text-sm text-amber-200/60 mt-1">Re-Museum · 万物重生</p>
      </div>

      {/* 表单卡片 */}
      <div className="relative z-10 w-[90%] max-w-sm bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-2xl">
        {/* 标签切换 */}
        <div className="flex gap-1 mb-6 bg-black/20 rounded-xl p-1">
          <button
            type="button"
            onClick={() => { setMode('login'); setLocalError(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200
              ${mode === 'login'
                ? 'bg-amber-600/80 text-white shadow-md'
                : 'text-amber-200/60 hover:text-amber-200'
              }`}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setLocalError(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200
              ${mode === 'register'
                ? 'bg-amber-600/80 text-white shadow-md'
                : 'text-amber-200/60 hover:text-amber-200'
              }`}
          >
            注册
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs text-amber-200/70 mb-1.5">昵称</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="你的馆长称号"
                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border border-white/10 text-amber-100 placeholder-amber-200/30 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-all text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-amber-200/70 mb-1.5">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-4 py-2.5 rounded-xl bg-black/20 border border-white/10 text-amber-100 placeholder-amber-200/30 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-all text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-amber-200/70 mb-1.5">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? '至少 6 位' : '••••••'}
              className="w-full px-4 py-2.5 rounded-xl bg-black/20 border border-white/10 text-amber-100 placeholder-amber-200/30 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-all text-sm"
            />
          </div>

          {/* 错误提示 */}
          {displayError && (
            <div className="bg-red-900/30 border border-red-500/30 rounded-xl px-3 py-2 text-red-300 text-xs">
              {displayError}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white font-semibold text-sm shadow-lg hover:shadow-amber-600/30 hover:from-amber-500 hover:to-orange-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                处理中…
              </span>
            ) : (
              mode === 'login' ? '登录' : '创建账号'
            )}
          </button>
        </form>

        {/* 分隔线 */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-amber-200/40">或者</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* 游客入场 */}
        <button
          type="button"
          onClick={onGuestLogin}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-amber-200/80 text-sm font-medium hover:bg-white/10 hover:text-amber-100 transition-all duration-200 disabled:opacity-50 active:scale-[0.98]"
        >
          🎫 游客快速入场
        </button>

        <p className="text-center text-[11px] text-amber-200/30 mt-3">
          游客数据会保存，随时可注册升级
        </p>
      </div>

      {/* 版权信息 */}
      <p className="relative z-10 text-[10px] text-amber-200/20 mt-8">
        © 2025 Re-Museum · 万物皆可再生
      </p>
    </div>
  );
};

export default LoginScreen;
