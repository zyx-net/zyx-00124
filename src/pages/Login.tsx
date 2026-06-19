import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  GraduationCap,
  User,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Shield,
  UserCircle2,
} from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useToast } from '@/components/Toast';

const demoAccounts = [
  { role: 'admin', username: 'admin', password: 'admin123', label: '管理员', icon: Shield, name: '系统管理员' },
  { role: 'student', username: 'student01', password: '123456', label: '学生', icon: UserCircle2, name: '张三' },
  { role: 'student', username: 'student02', password: '123456', label: '学生', icon: UserCircle2, name: '李四' },
];

export default function Login() {
  const { login } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname || '/dashboard';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      show('error', '请输入用户名和密码');
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password);
      show('success', '登录成功');
      navigate(from, { replace: true });
    } catch (err: any) {
      show('error', err?.error || '登录失败，请检查账号密码');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (account: typeof demoAccounts[0]) => {
    setUsername(account.username);
    setPassword(account.password);
    setLoading(true);
    try {
      await login(account.username, account.password);
      show('success', '登录成功');
      navigate(from, { replace: true });
    } catch (err: any) {
      show('error', err?.error || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-600 via-brand-500 to-teal-400 p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent-500/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/3 w-60 h-60 bg-white/5 rounded-full blur-2xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm mb-4 shadow-lg">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">自习室预约系统</h1>
          <p className="text-white/80 text-sm">请登录以继续使用</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8 animate-fadeIn">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">用户名</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入用户名"
                  className="input pl-10"
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="label">密码</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  className="input pl-10 pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 text-base"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  登录中...
                </>
              ) : (
                '登 录'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-zinc-100">
            <p className="text-xs text-zinc-500 mb-3 text-center">示例账号（点击快速登录）</p>
            <div className="space-y-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.username}
                  onClick={() => handleQuickLogin(account)}
                  disabled={loading}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-zinc-200 hover:border-brand-300 hover:bg-brand-50 transition group disabled:opacity-50"
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      account.role === 'admin'
                        ? 'bg-amber-100 text-amber-600 group-hover:bg-amber-200'
                        : 'bg-brand-100 text-brand-600 group-hover:bg-brand-200'
                    } transition`}
                  >
                    <account.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-zinc-800">{account.name}</div>
                    <div className="text-xs text-zinc-500">
                      <span className="badge bg-zinc-100 text-zinc-600 mr-1">{account.label}</span>
                      {account.username} / {account.password}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-white/60 text-xs mt-6">
          © {new Date().getFullYear()} 自习室预约系统. All rights reserved.
        </p>
      </div>
    </div>
  );
}
