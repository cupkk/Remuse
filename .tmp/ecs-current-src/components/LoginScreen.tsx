import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, LockKeyhole, Mail, Sparkles, UserRound, X } from 'lucide-react';
import LegalDocumentModal from './LegalDocumentModal';
import { LegalDocumentKey } from '../services/legalDocuments';

type AuthMode = 'login' | 'register' | 'forgotPassword' | 'resetPassword' | 'verifyEmail';

interface LoginScreenProps {
  onGuestLogin: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, nickname: string, acceptPolicies: boolean) => Promise<void>;
  onForgotPassword: (email: string) => Promise<string | void>;
  onResetPassword: (token: string, newPassword: string) => Promise<void>;
  onVerifyEmail: (token: string) => Promise<string | void>;
  loading?: boolean;
  error?: string | null;
  initialMode?: AuthMode;
  actionToken?: string | null;
  allowGuestLogin?: boolean;
  isGuestUpgrade?: boolean;
  onClose?: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({
  onGuestLogin,
  onLogin,
  onRegister,
  onForgotPassword,
  onResetPassword,
  onVerifyEmail,
  loading = false,
  error = null,
  initialMode = 'login',
  actionToken = null,
  allowGuestLogin = true,
  isGuestUpgrade = false,
  onClose,
}) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [legalDocument, setLegalDocument] = useState<LegalDocumentKey | null>(null);
  const verifiedTokenRef = useRef<string | null>(null);

  const displayError = error || localError;
  const showTabs = mode === 'login' || mode === 'register';
  const allowGuestEntry = allowGuestLogin && (mode === 'login' || mode === 'register');
  const headerMeta = useMemo(() => getHeaderMeta(mode, isGuestUpgrade), [mode, isGuestUpgrade]);

  useEffect(() => {
    setMode(initialMode);
    setLocalError(null);
    setNotice(null);
    setPassword('');
    setConfirmPassword('');
    setAgreed(false);

    if (initialMode !== 'forgotPassword') {
      setEmail('');
    }

    if (initialMode !== 'register') {
      setNickname('');
    }

    if (initialMode !== 'verifyEmail') {
      setVerifyStatus('idle');
    }
  }, [initialMode]);

  useEffect(() => {
    if (mode !== 'verifyEmail') {
      return;
    }

    if (!actionToken) {
      setVerifyStatus('error');
      setLocalError('验证链接无效，请返回登录后重新发送。');
      return;
    }

    if (verifiedTokenRef.current === actionToken) {
      return;
    }

    let cancelled = false;
    verifiedTokenRef.current = actionToken;
    setVerifyStatus('loading');
    setLocalError(null);
    setNotice(null);

    onVerifyEmail(actionToken)
      .then((message) => {
        if (cancelled) {
          return;
        }
        setVerifyStatus('success');
        setNotice(message || '邮箱验证成功，现在可以正常登录。');
      })
      .catch((verifyError: unknown) => {
        if (cancelled) {
          return;
        }
        setVerifyStatus('error');
        setLocalError(verifyError instanceof Error ? verifyError.message : '邮箱验证失败，请稍后重试。');
      });

    return () => {
      cancelled = true;
    };
  }, [actionToken, mode, onVerifyEmail]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLocalError(null);
    setNotice(null);

    const trimmedEmail = email.trim();
    const trimmedNickname = nickname.trim();

    try {
      if (mode === 'login') {
        if (!trimmedEmail || !password.trim()) {
          setLocalError('请输入邮箱和密码。');
          return;
        }
        if (!isValidEmail(trimmedEmail)) {
          setLocalError('请输入有效的邮箱地址。');
          return;
        }

        await onLogin(trimmedEmail, password);
        return;
      }

      if (mode === 'register') {
        if (!trimmedNickname) {
          setLocalError('请输入昵称。');
          return;
        }
        if (!trimmedEmail || !password.trim()) {
          setLocalError('请输入邮箱和密码。');
          return;
        }
        if (!isValidEmail(trimmedEmail)) {
          setLocalError('请输入有效的邮箱地址。');
          return;
        }
        if (password.length < 6) {
          setLocalError('密码至少需要 6 位。');
          return;
        }
        if (!agreed) {
          setLocalError('请先同意用户协议、隐私政策与 AI 生成说明。');
          return;
        }

        await onRegister(trimmedEmail, password, trimmedNickname, agreed);
        return;
      }

      if (mode === 'forgotPassword') {
        if (!trimmedEmail) {
          setLocalError('请输入注册邮箱。');
          return;
        }
        if (!isValidEmail(trimmedEmail)) {
          setLocalError('请输入有效的邮箱地址。');
          return;
        }

        const message = await onForgotPassword(trimmedEmail);
        setNotice(message || '重置链接已发送，请检查邮箱。');
        return;
      }

      if (mode === 'resetPassword') {
        if (!actionToken) {
          setLocalError('重置链接无效，请重新申请找回密码。');
          return;
        }
        if (!password.trim() || !confirmPassword.trim()) {
          setLocalError('请输入并确认新密码。');
          return;
        }
        if (password.length < 6) {
          setLocalError('新密码至少需要 6 位。');
          return;
        }
        if (password !== confirmPassword) {
          setLocalError('两次输入的密码不一致。');
          return;
        }

        await onResetPassword(actionToken, password);
      }
    } catch (submitError: unknown) {
      setLocalError(submitError instanceof Error ? submitError.message : '操作失败，请稍后重试。');
    }
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setLocalError(null);
    setNotice(null);
    if (nextMode !== 'register') {
      setAgreed(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[90] overflow-auto bg-[#050607] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(198,255,0,0.11),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(0,212,255,0.08),_transparent_28%),linear-gradient(180deg,_rgba(255,255,255,0.02),_rgba(255,255,255,0))]" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.16)_1px,transparent_1px)] [background-size:42px_42px]" />

        <div className="relative z-10 mx-auto flex min-h-screen w-full items-center justify-center px-4 py-8">
          <div className="w-full" style={{ maxWidth: 560 }}>
            <section
              className="relative w-full overflow-hidden rounded-[34px] border border-white/10 bg-[#0d1012]/94 p-6 shadow-[0_28px_120px_rgba(0,0,0,0.62)] backdrop-blur-xl sm:p-8"
              style={{ width: '100%', maxWidth: 560 }}
            >
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute left-[-12%] top-[-8%] h-44 w-44 rounded-full bg-remuse-accent/10 blur-3xl" />
              <div className="absolute bottom-[-14%] right-[-10%] h-36 w-36 rounded-full bg-cyan-400/10 blur-3xl" />
            </div>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="absolute right-5 top-5 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/35 text-neutral-300 transition-all duration-200 hover:border-white/20 hover:text-white"
                aria-label="关闭登录窗口"
              >
                <X size={18} />
              </button>
            )}

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-remuse-accent/25 bg-remuse-accent/10 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.32em] text-remuse-accent">
                <Sparkles size={14} />
                Re-Museum Access
              </div>

              <div className="mt-7">
                <p className="text-[11px] font-mono uppercase tracking-[0.34em] text-remuse-accent/90">{headerMeta.kicker}</p>
                <div className="mt-3 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-[34px] font-display font-black tracking-[-0.04em] text-white sm:text-[40px]">
                      {headerMeta.title}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">{headerMeta.subtitle}</p>
                  </div>

                  {(mode === 'forgotPassword' || mode === 'resetPassword' || mode === 'verifyEmail') && (
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-neutral-300 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                    >
                      <ArrowLeft size={14} />
                      返回
                    </button>
                  )}
                </div>
              </div>

              {showTabs && (
                <div className="mt-7 rounded-[24px] border border-white/8 bg-black/25 p-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <TabButton active={mode === 'login'} label="登录" onClick={() => switchMode('login')} />
                    <TabButton active={mode === 'register'} label="注册" onClick={() => switchMode('register')} />
                  </div>
                </div>
              )}

              {isGuestUpgrade && mode === 'register' && (
                <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/8 px-4 py-3 text-sm leading-6 text-amber-100/85">
                  当前游客数据会保留到升级后的正式账号中。
                </div>
              )}

              {mode === 'verifyEmail' ? (
                <div className="mt-8 space-y-4">
                  <StatusPanel
                    tone={verifyStatus === 'success' ? 'success' : verifyStatus === 'error' ? 'error' : 'neutral'}
                    content={
                      verifyStatus === 'loading'
                        ? '正在验证邮箱，请稍候。'
                        : verifyStatus === 'success'
                          ? notice || '邮箱验证成功。'
                          : displayError || '验证链接无效，请重新发送验证邮件。'
                    }
                  />

                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className={`w-full rounded-2xl px-4 py-3 text-sm font-display font-bold transition-all duration-200 ${
                      verifyStatus === 'success'
                        ? 'bg-remuse-accent text-black hover:bg-white'
                        : 'border border-white/10 bg-white/[0.04] text-neutral-200 hover:bg-white/[0.08]'
                    }`}
                  >
                    返回登录
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                  {mode === 'register' && (
                    <Field label="昵称" icon={<UserRound size={16} />}>
                      <input
                        type="text"
                        value={nickname}
                        onChange={(event) => setNickname(event.target.value)}
                        placeholder="输入你的昵称"
                        className={inputClassName}
                        data-testid="auth-nickname-input"
                      />
                    </Field>
                  )}

                  {(mode === 'login' || mode === 'register' || mode === 'forgotPassword') && (
                    <Field label="邮箱" icon={<Mail size={16} />}>
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="name@example.com"
                        className={inputClassName}
                        data-testid="auth-email-input"
                      />
                    </Field>
                  )}

                  {(mode === 'login' || mode === 'register' || mode === 'resetPassword') && (
                    <Field label={mode === 'resetPassword' ? '新密码' : '密码'} icon={<LockKeyhole size={16} />}>
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={mode === 'login' ? '输入密码' : '至少 6 位'}
                        className={inputClassName}
                        data-testid={
                          mode === 'login'
                            ? 'auth-login-password-input'
                            : mode === 'resetPassword'
                              ? 'auth-reset-password-input'
                              : 'auth-register-password-input'
                        }
                      />
                    </Field>
                  )}

                  {mode === 'resetPassword' && (
                    <Field label="确认新密码" icon={<LockKeyhole size={16} />}>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="再次输入新密码"
                        className={inputClassName}
                        data-testid="auth-reset-password-confirm-input"
                      />
                    </Field>
                  )}

                  {mode === 'register' && (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                      <label className="flex items-start gap-3 text-sm leading-6 text-neutral-300">
                        <input
                          type="checkbox"
                          checked={agreed}
                          onChange={(event) => setAgreed(event.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent text-remuse-accent focus:ring-remuse-accent"
                          data-testid="auth-accept-policies"
                        />
                        <span>
                          我已阅读并同意
                          <PolicyLink label="用户协议" onClick={() => setLegalDocument('terms')} />
                          <PolicyLink label="隐私政策" onClick={() => setLegalDocument('privacy')} />
                          与
                          <PolicyLink label="AI 生成说明" onClick={() => setLegalDocument('ai')} />
                        </span>
                      </label>
                    </div>
                  )}

                  {mode === 'login' && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => switchMode('forgotPassword')}
                        className="text-xs text-neutral-500 transition-colors duration-200 hover:text-white"
                        data-testid="auth-forgot-password-trigger"
                      >
                        忘记密码
                      </button>
                    </div>
                  )}

                  {displayError && <StatusPanel tone="error" content={displayError} />}
                  {!displayError && notice && <StatusPanel tone="success" content={notice} />}

                  <button
                    type="submit"
                    disabled={loading || verifyStatus === 'loading'}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-remuse-accent px-4 py-3.5 text-sm font-display font-bold text-black transition-all duration-200 hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
                    data-testid={`auth-submit-${mode}`}
                  >
                    {loading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : mode === 'register' ? (
                      <UserRound size={16} />
                    ) : (
                      <LockKeyhole size={16} />
                    )}
                    {getSubmitLabel(mode)}
                  </button>

                  {(mode === 'forgotPassword' || mode === 'resetPassword') && (
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-neutral-200 transition-all duration-200 hover:bg-white/[0.08]"
                    >
                      返回登录
                    </button>
                  )}
                </form>
              )}

              {allowGuestEntry && (
                <>
                  <div className="my-6 flex items-center gap-3">
                    <div className="h-px flex-1 bg-white/10" />
                    <span className="text-[11px] font-mono uppercase tracking-[0.32em] text-neutral-500">or</span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>

                  <button
                    type="button"
                    onClick={onGuestLogin}
                    disabled={loading}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-sm text-neutral-100 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.07] disabled:opacity-50"
                    data-testid="auth-guest-entry"
                  >
                    以游客身份进入
                  </button>

                  <p className="mt-3 text-center text-[11px] tracking-[0.16em] text-neutral-500">
                    游客数据后续可直接继承到正式账号。
                  </p>
                </>
              )}
            </div>
            </section>
          </div>
        </div>
      </div>

      <LegalDocumentModal documentKey={legalDocument} onClose={() => setLegalDocument(null)} />
    </>
  );
};

const inputClassName =
  'w-full rounded-[20px] border border-white/10 bg-[#111417] px-4 py-3.5 pl-11 text-sm text-white outline-none transition-all duration-200 placeholder:text-neutral-500 focus:border-remuse-accent/45 focus:bg-[#14181b]';

const Field: React.FC<{ label: string; icon: React.ReactNode; children: React.ReactNode }> = ({ label, icon, children }) => (
  <label className="block">
    <span className="mb-2 block text-[11px] font-mono uppercase tracking-[0.28em] text-neutral-500">{label}</span>
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">{icon}</span>
      {children}
    </div>
  </label>
);

const TabButton: React.FC<{ active: boolean; label: string; onClick: () => void }> = ({ active, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-[18px] px-4 py-3 text-sm font-medium transition-all duration-200 ${
      active
        ? 'bg-remuse-accent text-black shadow-[0_0_0_1px_rgba(198,255,0,0.16)]'
        : 'text-neutral-300 hover:bg-white/[0.05] hover:text-white'
    }`}
  >
    {label}
  </button>
);

const PolicyLink: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="mx-1 text-remuse-accent transition-colors duration-200 hover:text-white"
  >
    {label}
  </button>
);

const StatusPanel: React.FC<{ tone: 'success' | 'error' | 'neutral'; content: string }> = ({ tone, content }) => (
  <div
    className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
      tone === 'success'
        ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
        : tone === 'error'
          ? 'border-red-400/20 bg-red-500/10 text-red-100'
          : 'border-white/10 bg-white/[0.04] text-neutral-200'
    }`}
  >
    {content}
  </div>
);

function getHeaderMeta(mode: AuthMode, isGuestUpgrade: boolean) {
  if (isGuestUpgrade && mode === 'register') {
    return {
      kicker: 'Guest Upgrade',
      title: '升级账号',
      subtitle: '把当前游客数据完整带入正式账号。',
    };
  }

  switch (mode) {
    case 'register':
      return {
        kicker: 'Create Account',
        title: '注册',
        subtitle: '创建你的再生博物馆账户。',
      };
    case 'forgotPassword':
      return {
        kicker: 'Password Reset',
        title: '找回密码',
        subtitle: '输入注册邮箱，我们会发送重置链接。',
      };
    case 'resetPassword':
      return {
        kicker: 'New Password',
        title: '重置密码',
        subtitle: '设置一个新的登录密码。',
      };
    case 'verifyEmail':
      return {
        kicker: 'Verify Email',
        title: '验证邮箱',
        subtitle: '正在确认你的邮箱状态。',
      };
    case 'login':
    default:
      return {
        kicker: 'Welcome Back',
        title: '登录',
        subtitle: '进入你的馆藏、贴纸与记忆工作区。',
      };
  }
}

function getSubmitLabel(mode: AuthMode) {
  switch (mode) {
    case 'register':
      return '注册';
    case 'forgotPassword':
      return '发送重置邮件';
    case 'resetPassword':
      return '确认新密码';
    default:
      return '登录';
  }
}

function isValidEmail(value: string): boolean {
  return /\S+@\S+\.\S+/.test(value);
}

export default LoginScreen;
