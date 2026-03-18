import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  MailCheck,
  MailWarning,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { User } from '../types';
import * as authService from '../services/authService';

interface AccountSecurityPanelProps {
  user?: User | null;
  onClose?: () => void;
  onDeleted?: () => Promise<void> | void;
}

const AccountSecurityPanel: React.FC<AccountSecurityPanelProps> = ({ user, onClose: _onClose }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [loggingOutOthers, setLoggingOutOthers] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);

  useEffect(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setSuccess(null);
  }, [user?.id, user?.emailVerified]);

  if (!user || user.isGuest) {
    return null;
  }

  async function handleChangePassword(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('请完整填写当前密码、新密码和确认密码。');
      return;
    }

    if (newPassword.length < 6) {
      setError('新密码至少需要 6 位。');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致。');
      return;
    }

    if (currentPassword === newPassword) {
      setError('新密码不能与当前密码相同。');
      return;
    }

    setChangingPassword(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('密码已修改成功。');
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : '修改密码失败，请稍后重试。');
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleLogoutOtherSessions() {
    setError(null);
    setSuccess(null);
    setLoggingOutOthers(true);

    try {
      await authService.logoutOtherSessions();
      setSuccess('其他设备上的登录会话已经失效。');
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : '退出其他设备失败，请稍后重试。');
    } finally {
      setLoggingOutOthers(false);
    }
  }

  async function handleSendVerificationEmail() {
    setError(null);
    setSuccess(null);
    setSendingVerification(true);

    try {
      await authService.sendVerificationEmail();
      setSuccess('验证邮件已发送，请检查收件箱。');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : '发送验证邮件失败，请稍后重试。');
    } finally {
      setSendingVerification(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-remuse-border bg-[#101214]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-remuse-accent/25 bg-remuse-accent/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] text-remuse-accent">
            <ShieldCheck size={14} />
            Account Security
          </div>
          <h3 className="text-2xl font-display font-bold text-white md:text-3xl">账号安全</h3>
          <p className="mt-3 text-sm leading-7 text-neutral-400">
            当前登录邮箱为 {user.email || '未设置邮箱'}。你可以在这里验证邮箱、修改密码，并让其他设备上的会话失效。
          </p>
        </div>

        {_onClose && (
          <button
            type="button"
            onClick={_onClose}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/20 text-neutral-400 transition-colors hover:border-white/20 hover:text-white"
            aria-label="关闭账号安全弹窗"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <div
        className={`mt-6 rounded-[24px] border px-5 py-5 ${
          user.emailVerified
            ? 'border-emerald-500/20 bg-emerald-950/20 text-emerald-100'
            : 'border-amber-400/20 bg-amber-500/10 text-amber-50'
        }`}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            {user.emailVerified ? <MailCheck size={20} /> : <MailWarning size={20} />}
            <div>
              <p className="text-base font-semibold">{user.emailVerified ? '邮箱已验证' : '邮箱未验证'}</p>
              <p className="mt-2 text-sm leading-6 opacity-90">
                {user.emailVerified
                  ? '验证状态正常，后续可以直接通过邮箱找回密码。'
                  : '建议先完成邮箱验证，避免后续无法找回密码或恢复账号。'}
              </p>
            </div>
          </div>

          {!user.emailVerified && (
            <button
              type="button"
              onClick={handleSendVerificationEmail}
              disabled={sendingVerification}
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-amber-100/20 bg-black/20 px-4 py-2.5 text-sm font-medium text-amber-50 transition-colors hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingVerification ? <Loader2 size={16} className="animate-spin" /> : <MailCheck size={16} />}
              {sendingVerification ? '发送中...' : '重新发送验证邮件'}
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleChangePassword} className="mt-8">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <Field label="当前密码">
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className={inputClassName}
              placeholder="请输入当前密码"
            />
          </Field>

          <Field label="新密码">
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className={inputClassName}
              placeholder="至少 6 位"
            />
          </Field>

          <Field label="确认新密码">
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className={inputClassName}
              placeholder="再次输入新密码"
            />
          </Field>

          <button
            type="submit"
            disabled={changingPassword}
            className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-2xl bg-remuse-accent px-6 py-3 text-sm font-display font-bold text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            {changingPassword ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
            {changingPassword ? '保存中...' : '修改密码'}
          </button>
        </div>
      </form>

      <div className="mt-7 border-t border-white/8 pt-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h4 className="text-xl font-display font-bold text-white">设备会话管理</h4>
            <p className="mt-2 text-sm leading-7 text-neutral-400">
              如果你怀疑账号在其他设备上处于登录状态，可以立即让它们失效。
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogoutOtherSessions}
            disabled={loggingOutOthers}
            className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-2xl border border-neutral-700 bg-black/20 px-5 py-3 text-sm font-medium text-neutral-200 transition-colors hover:border-remuse-accent/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loggingOutOthers ? <Loader2 size={16} className="animate-spin" /> : <Smartphone size={16} />}
            {loggingOutOthers ? '处理中...' : '退出其他设备'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-remuse-accent/20 bg-remuse-accent/10 px-4 py-3 text-sm text-remuse-accent">
          <CheckCircle2 size={16} />
          {success}
        </div>
      )}
    </section>
  );
};

const inputClassName =
  'w-full rounded-2xl border border-neutral-700 bg-black/20 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-remuse-accent/50';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="mb-3 block text-xs font-mono uppercase tracking-[0.2em] text-neutral-500">{label}</span>
    {children}
  </label>
);

export default AccountSecurityPanel;
