import { useState, useEffect, createContext, useContext, useCallback, type ReactNode } from 'react';
import { CheckCircle2, XCircle, AlertCircle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastCtx {
  show: (type: ToastType, message: string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((type: ToastType, message: string) => {
    const id = Date.now();
    setToasts((ts) => [...ts, { id, type, message }]);
    setTimeout(() => remove(id), 3500);
  }, [remove]);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border animate-fadeIn min-w-[280px] ${
              t.type === 'success'
                ? 'bg-white border-green-200 text-green-800'
                : t.type === 'error'
                ? 'bg-white border-red-200 text-red-800'
                : 'bg-white border-brand-200 text-brand-800'
            }`}
          >
            {t.type === 'success' && <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-green-500" />}
            {t.type === 'error' && <XCircle className="w-5 h-5 flex-shrink-0 text-red-500" />}
            {t.type === 'info' && <AlertCircle className="w-5 h-5 flex-shrink-0 text-brand-500" />}
            <span className="text-sm flex-1">{t.message}</span>
            <button onClick={() => remove(t.id)} className="text-zinc-400 hover:text-zinc-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
