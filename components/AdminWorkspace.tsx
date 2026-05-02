import React from 'react';
import { ArrowLeftRight, LogOut, Shield, Sparkles } from 'lucide-react';
import { User } from '../types';
import AdminConsole from './AdminConsole';

interface AdminWorkspaceProps {
  user: User;
  onLogout?: () => Promise<void> | void;
  onEnterProduct?: () => void;
}

const AdminWorkspace: React.FC<AdminWorkspaceProps> = ({
  user,
  onLogout,
  onEnterProduct,
}) => (
  <div className="min-h-dvh overflow-hidden bg-remuse-dark text-white">
    <div className="border-b border-remuse-border bg-remuse-panel/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6 px-5 py-6 md:px-8 lg:px-10">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-remuse-accent/30 bg-remuse-accent/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.28em] text-remuse-accent">
              <Shield size={14} />
              Remuse Admin
            </div>
            <h1 className="mt-4 font-display text-3xl font-black tracking-tight text-white md:text-5xl">
              独立管理后台
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-400 md:text-base">
              当前登录账号为 {user.email || user.nickname}。这里集中查看平台运行状态、用户规模、模型消耗、用户行为和反馈处理。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {onEnterProduct ? (
              <button
                type="button"
                onClick={onEnterProduct}
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-5 py-3 text-sm font-semibold text-neutral-200 transition-colors hover:border-white/20 hover:text-white"
              >
                <ArrowLeftRight size={16} />
                进入用户前台
              </button>
            ) : null}
            {onLogout ? (
              <button
                type="button"
                onClick={() => void onLogout()}
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border border-red-800/40 bg-red-900/30 px-5 py-3 text-sm font-semibold text-red-200 transition-colors hover:bg-red-900/50"
              >
                <LogOut size={16} />
                退出登录
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <InfoCard
            icon={<Sparkles size={16} />}
            label="Monitoring"
            className="text-remuse-accent"
            text="总调用量、成功率、耗时趋势、功能分布与异常高频账号集中在这里查看。"
          />
          <InfoCard
            icon={<Shield size={16} />}
            label="User Detail"
            className="text-cyan-300"
            text="支持按邮箱、昵称、用户 ID 搜索，查看单用户最近行为与风险标记状态。"
          />
          <InfoCard
            icon={<Sparkles size={16} />}
            label="Feedback Queue"
            className="text-remuse-secondary"
            text="反馈列表与处理状态集中管理，不再和馆长办公室或内容模块混在一起。"
          />
        </div>
      </div>
    </div>

    <div className="h-[calc(100dvh-212px)] overflow-y-auto px-4 py-6 md:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1680px]">
        <AdminConsole standalone />
      </div>
    </div>
  </div>
);

const InfoCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  className: string;
  text: string;
}> = ({ icon, label, className, text }) => (
  <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-4">
    <div className={`flex items-center gap-2 ${className}`}>
      {icon}
      <span className="text-[11px] font-mono uppercase tracking-[0.24em]">{label}</span>
    </div>
    <p className="mt-3 text-sm text-neutral-300">{text}</p>
  </div>
);

export default AdminWorkspace;
