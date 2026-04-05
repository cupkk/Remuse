import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { reportClientError } from '../services/clientErrorReporter';
import { isDynamicImportChunkError } from '../services/lazyWithChunkRetry';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[REMUSE] \u9519\u8bef\u8fb9\u754c', error, info.componentStack);
    reportClientError({
      source: 'error-boundary',
      message: error.message,
      stack: error.stack || null,
      componentStack: info.componentStack || null,
    });
  }

  handleReset = () => {
    if (this.state.error && typeof window !== 'undefined' && isDynamicImportChunkError(this.state.error)) {
      window.location.reload();
      return;
    }

    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center bg-remuse-dark p-6">
          <div className="w-full max-w-md rounded-lg border border-red-900/40 bg-remuse-panel p-8 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
              <AlertTriangle size={32} className="text-red-400" />
            </div>
            <h2 className="mb-2 text-xl font-display font-bold text-white">
              系统出错了
            </h2>
            <p className="mb-2 text-sm text-neutral-400">
              REMUSE 遇到了一个意外错误，但别担心，你的数据是安全的。
            </p>
            {this.state.error && (
              <div className="mb-6 rounded border border-neutral-800 bg-neutral-900 p-3 text-left">
                <p className="break-all text-xs font-mono text-red-400">
                  {this.state.error.message}
                </p>
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 rounded bg-remuse-accent px-6 py-3 font-display font-bold text-black transition-colors hover:bg-white"
            >
              <RefreshCw size={16} />
              重新加载
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
