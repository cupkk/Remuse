import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Loader2, MessageCircle, Shield, Trash2, X } from 'lucide-react';
import { User } from '../types';
import LegalDocumentModal from './LegalDocumentModal';
import { LegalDocumentKey } from '../services/legalDocuments';
import * as authService from '../services/authService';

interface AccountSettingsModalProps {
  user?: User | null;
  supportContactLabel?: string;
  supportContactValue?: string;
  onClose: () => void;
  onDeleted?: () => Promise<void> | void;
}

const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({
  user,
  supportContactLabel = '微信',
  supportContactValue = 'MTtin999',
  onClose,
  onDeleted,
}) => {
  const [legalDocument, setLegalDocument] = useState<LegalDocumentKey | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const agreementRows = useMemo(() => {
    if (!user) {
      return [];
    }

    return [
      {
        label: '用户协议',
        accepted: user.agreements.termsVersionAccepted,
        current: user.agreements.currentTermsVersion,
        documentKey: 'terms' as LegalDocumentKey,
      },
      {
        label: '隐私政策',
        accepted: user.agreements.privacyVersionAccepted,
        current: user.agreements.currentPrivacyVersion,
        documentKey: 'privacy' as LegalDocumentKey,
      },
      {
        label: 'AI 生成说明',
        accepted: user.agreements.aiNoticeVersionAccepted,
        current: user.agreements.currentAiNoticeVersion,
        documentKey: 'ai' as LegalDocumentKey,
      },
    ];
  }, [user]);

  if (!user || user.isGuest) {
    return null;
  }

  async function handleDeleteAccount(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!password.trim()) {
      setError('请输入当前密码后再删除账号。');
      return;
    }

    setDeleting(true);
    try {
      await authService.deleteAccount(password.trim());
      setSuccess('账号删除请求已完成。');
      await onDeleted?.();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除账号失败，请稍后重试。');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="relative max-h-[92vh] overflow-hidden rounded-[32px] border border-white/10 bg-[#101214]/95 shadow-[0_30px_100px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between gap-4 border-b border-remuse-border px-6 py-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-remuse-secondary/25 bg-remuse-secondary/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.26em] text-remuse-secondary">
              <Shield size={14} />
              Account Settings
            </div>
            <h3 className="mt-3 text-2xl font-display font-bold text-white">账户设置与隐私</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
              在这里查看协议版本、联系客服，并处理账号注销等隐私相关操作。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/20 text-neutral-300 transition-colors hover:border-white/20 hover:text-white"
            aria-label="关闭账户设置弹窗"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[calc(92vh-92px)] overflow-y-auto px-6 py-5">
          <div className="space-y-6">
            <section className="rounded-[24px] border border-remuse-border bg-remuse-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-neutral-500">Account</p>
                  <h4 className="mt-3 text-xl font-display font-bold text-white">{user.nickname || 'Re-Museum User'}</h4>
                  <p className="mt-2 text-sm text-neutral-400">{user.email || '未绑定邮箱'}</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm text-neutral-300">
                  <p>同意时间：{user.agreements.consentAcceptedAt || '未记录'}</p>
                  <p className="mt-2">邮箱状态：{user.emailVerified ? '已验证' : '未验证'}</p>
                </div>
              </div>
            </section>

            <section className="rounded-[24px] border border-remuse-border bg-remuse-panel p-5">
              <div className="flex items-center gap-2 text-remuse-accent">
                <FileText size={16} />
                <p className="text-[11px] font-mono uppercase tracking-[0.24em]">Policies</p>
              </div>
              <h4 className="mt-3 text-xl font-display font-bold text-white">协议与说明</h4>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {agreementRows.map((row) => (
                  <div key={row.label} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                    <p className="text-sm font-semibold text-white">{row.label}</p>
                    <p className="mt-2 text-xs leading-6 text-neutral-500">
                      已同意版本：{row.accepted || '未记录'}
                    </p>
                    <p className="text-xs leading-6 text-neutral-500">
                      当前版本：{row.current}
                    </p>
                    <button
                      type="button"
                      onClick={() => setLegalDocument(row.documentKey)}
                      className="mt-4 inline-flex min-h-[40px] items-center justify-center rounded-full border border-remuse-accent/25 bg-remuse-accent/10 px-4 py-2 text-sm text-remuse-accent transition-colors hover:bg-remuse-accent/20"
                    >
                      查看全文
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[24px] border border-remuse-border bg-remuse-panel p-5">
              <div className="flex items-center gap-2 text-remuse-secondary">
                <MessageCircle size={16} />
                <p className="text-[11px] font-mono uppercase tracking-[0.24em]">Support</p>
              </div>
              <h4 className="mt-3 text-xl font-display font-bold text-white">联系与数据问题反馈</h4>
              <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-4 text-sm leading-7 text-neutral-300">
                <p>{supportContactLabel}：{supportContactValue}</p>
                <p className="mt-2">如果你需要处理数据问题、账户恢复、商业合作或合规咨询，可以通过这个入口联系团队。</p>
              </div>
            </section>

            <section className="rounded-[24px] border border-red-500/20 bg-red-950/10 p-5">
              <div className="flex items-center gap-2 text-red-300">
                <AlertTriangle size={16} />
                <p className="text-[11px] font-mono uppercase tracking-[0.24em]">Danger Zone</p>
              </div>
              <h4 className="mt-3 text-xl font-display font-bold text-white">账号注销</h4>
              <p className="mt-2 text-sm leading-7 text-neutral-300">
                注销后，与当前账号直接绑定的藏品、贴纸、记忆会话和会话凭据会被删除或匿名化处理。此操作不可恢复。
              </p>

              <form onSubmit={handleDeleteAccount} className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <label className="block">
                  <span className="mb-3 block text-xs font-mono uppercase tracking-[0.2em] text-neutral-500">当前密码</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-2xl border border-red-500/20 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-red-400/40"
                    placeholder="输入当前密码确认注销"
                  />
                </label>

                <button
                  type="submit"
                  disabled={deleting}
                  className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-red-500 px-5 py-3 text-sm font-display font-bold text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                >
                  {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {deleting ? '注销中...' : '删除账号'}
                </button>
              </form>

              {error && (
                <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              {success && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">
                  <CheckCircle2 size={16} />
                  {success}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      <LegalDocumentModal documentKey={legalDocument} onClose={() => setLegalDocument(null)} />
    </>
  );
};

export default AccountSettingsModal;
