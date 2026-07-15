'use client';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Users, Vote, UserCheck, BarChart2,
  FileText, Settings, LogOut, Menu, X, Zap, Shield,
  ClipboardList, HelpCircle, ChevronRight, Send
} from 'lucide-react';

const navItems = [
  { href: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/admin/elections', icon: Vote, label: 'Elections' },
  { href: '/admin/students', icon: Users, label: 'Students' },
  { href: '/admin/credentials', icon: Send, label: 'Credentials' },
  { href: '/admin/candidates', icon: UserCheck, label: 'Candidates' },
  { href: '/admin/results', icon: BarChart2, label: 'Results' },
  { href: '/admin/audit', icon: ClipboardList, label: 'Audit Logs' },
  { href: '/admin/support', icon: HelpCircle, label: 'Support' },
  { href: '/admin/admins', icon: Shield, label: 'Admin Users', roles: ['super_admin'] },
  { href: '/admin/settings', icon: Settings, label: 'Settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [admin, setAdmin] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userType = localStorage.getItem('userType');
    const user = localStorage.getItem('user');

    if (!token || userType !== 'admin') {
      router.push('/admin/login');
      return;
    }
    if (user) setAdmin(JSON.parse(user));
  }, []);

  const logout = () => {
    localStorage.clear();
    router.push('/admin/login');
  };

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-6 border-b border-dark-500">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.3)' }}>
            <Zap className="w-5 h-5 text-primary-500" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-primary-500" style={{ fontFamily: 'var(--font-orbitron)' }}>
              Election
            </p>
            <p className="text-xs text-dark-700">Admin Portal</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems
          .filter(item => !item.roles || item.roles.includes(admin?.role))
          .map(item => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`nav-item ${active ? 'active' : ''}`}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span style={{ fontFamily: 'var(--font-syne)' }}>{item.label}</span>
              {active && <ChevronRight className="w-3 h-3 ml-auto" />}
            </Link>
          );
        })}
      </nav>

      {/* Admin info + logout */}
      <div className="p-4 border-t border-dark-500">
        {admin && (
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-black"
              style={{ background: '#00ff88' }}>
              {admin.fullName?.[0] || 'A'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{admin.fullName}</p>
              <p className="text-xs text-dark-700 capitalize">{admin.role?.replace('_', ' ')}</p>
            </div>
          </div>
        )}
        <button onClick={logout} className="nav-item w-full">
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-dark overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 flex-shrink-0 border-r border-dark-500 bg-dark-100">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-64 bg-dark-100 border-r border-dark-500 flex flex-col z-10">
            <button
              className="absolute top-4 right-4 p-2 text-dark-700 hover:text-white"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-dark-500 bg-dark-100">
          <button onClick={() => setSidebarOpen(true)} className="p-2 text-dark-700 hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-xs font-black uppercase tracking-widest text-primary-500" style={{ fontFamily: 'var(--font-orbitron)' }}>
            Election Admin
          </span>
          <div className="w-9" />
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
