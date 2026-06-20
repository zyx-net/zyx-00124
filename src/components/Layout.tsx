import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarPlus,
  LogIn,
  History,
  FileCheck,
  Settings2,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  GraduationCap,
  Shield,
  Ban,
} from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useToast } from './Toast';
import { cn } from '@/lib/utils';

const studentMenu = [
  { path: '/dashboard', label: '仪表盘', icon: LayoutDashboard },
  { path: '/reserve', label: '预约申请', icon: CalendarPlus },
  { path: '/checkin', label: '签到签退', icon: LogIn },
  { path: '/history', label: '历史记录', icon: History },
];

const adminMenu = [
  { path: '/dashboard', label: '仪表盘', icon: LayoutDashboard },
  { path: '/approvals', label: '审批管理', icon: FileCheck },
  { path: '/suspensions', label: '停用计划', icon: Ban },
  { path: '/classrooms', label: '教室配置', icon: Settings2 },
  { path: '/history', label: '历史记录', icon: History },
  { path: '/statistics', label: '统计导出', icon: BarChart3 },
];

export default function Layout({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const menu = user?.role === 'admin' ? adminMenu : studentMenu;

  const handleLogout = async () => {
    await logout();
    show('success', '已退出登录');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      <aside
        className={cn(
          'bg-white border-r border-zinc-200 flex flex-col transition-all duration-300',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-zinc-100">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-zinc-800">自习室预约</span>
            </div>
          )}
          {collapsed && (
            <div className="w-full flex justify-center">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded-md hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {menu.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                  'hover:bg-brand-50 hover:text-brand-700',
                  isActive
                    ? 'bg-brand-50 text-brand-700 shadow-sm'
                    : 'text-zinc-600',
                  collapsed && 'justify-center px-0'
                )
              }
            >
              <item.icon className={cn('w-5 h-5 flex-shrink-0')} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-zinc-100">
          {!collapsed && user && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-zinc-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
                  {user.role === 'admin' ? (
                    <Shield className="w-4 h-4 text-brand-600" />
                  ) : (
                    <User className="w-4 h-4 text-brand-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-800 truncate">{user.name}</div>
                  <div className="text-xs text-zinc-500 truncate">
                    {user.role === 'admin' ? '管理员' : user.studentId || '学生'}
                  </div>
                </div>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-600 hover:bg-red-50 hover:text-red-600 transition',
              collapsed && 'justify-center px-0'
            )}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>退出登录</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-6">
          <div>
            <h1 className="text-lg font-semibold text-zinc-800">
              {menu.find((m) => location.pathname.startsWith(m.path))?.label || '自习室预约系统'}
            </h1>
          </div>

          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-zinc-50 transition"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-sm font-medium">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-zinc-800">{user?.name}</div>
                <div className="text-xs text-zinc-500">
                  {user?.role === 'admin' ? '管理员' : '学生'}
                </div>
              </div>
            </button>

            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-zinc-100 py-1 z-20">
                  <div className="px-4 py-2 border-b border-zinc-100">
                    <div className="text-sm font-medium text-zinc-800">{user?.name}</div>
                    <div className="text-xs text-zinc-500">{user?.username}</div>
                  </div>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      handleLogout();
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition"
                  >
                    <LogOut className="w-4 h-4" />
                    退出登录
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
}
