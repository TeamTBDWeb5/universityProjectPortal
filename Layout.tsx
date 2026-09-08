import React, { useEffect, useState } from 'react';
import {
  Bell,
  Search,
  LogOut,
  User,
  BookOpen,
  LayoutDashboard,
  FileText,
  List,
  Users,
  BarChart,
  CheckSquare,
  ClipboardList,
  MessageSquare
} from 'lucide-react';
import { getCurrentProfile } from '../../services/authService';
import { getMyNotifications, markAllNotificationsAsRead } from '../../services/notificationService';

interface LayoutProps {
  role: 'student' | 'lecturer' | 'admin';
  currentScreen: string;
  onNavigate: (screen: string) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export function Layout({ role, currentScreen, onNavigate, onLogout, children }: LayoutProps) {
  const [profile, setProfile] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  async function loadHeaderData() {
    try {
      const [p, notifications] = await Promise.all([getCurrentProfile(), getMyNotifications()]);
      setProfile(p);
      setUnreadCount(notifications.filter((n: any) => !n.is_read).length);
    } catch (error) {
      console.error('Unable to load header data:', error);
    }
  }

  useEffect(() => { loadHeaderData(); }, []);
  const getNavItems = () => {
    switch (role) {
      case 'student':
        return [
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'topic-selection', label: 'Project Topics', icon: List },
          { id: 'submission', label: 'Submissions', icon: FileText },
          { id: 'progress', label: 'Progress Tracking', icon: BarChart },
          { id: 'messages', label: 'Messages', icon: MessageSquare },
        ];
      case 'lecturer':
        return [
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'topic-upload', label: 'Upload Topics', icon: FileText },
          { id: 'view-students', label: 'My Students', icon: Users },
          { id: 'workload', label: 'Workload Tracking', icon: BarChart },
          { id: 'messages', label: 'Messages', icon: MessageSquare },
        ];
      case 'admin':
        return [
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'topic-approval', label: 'Topic Approval', icon: CheckSquare },
          { id: 'supervisor-allocation', label: 'Allocate Supervisors', icon: Users },
          { id: 'report-generation', label: 'Reports', icon: ClipboardList },
        ];
      default:
        return [];
    }
  };

  const navItems = getNavItems();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#EEEDFB] rounded-md flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-[#312DC4]" />
          </div>
          <span className="font-semibold text-lg text-gray-800 hidden sm:block">UniManage Portal</span>
        </div>

        <div className="flex-1 max-w-md mx-4 hidden md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="w-full bg-gray-100 border-none rounded-md py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#312DC4]/30"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={async () => { try { await markAllNotificationsAsRead(); setUnreadCount(0); } catch (error) { console.error(error); } }} className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-full" title="Mark notifications as read">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-[#312DC4] text-white text-[10px] rounded-full flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
          <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
            <div className="w-8 h-8 bg-[#EEEDFB] rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-[#312DC4]" />
            </div>
            <div className="hidden sm:block text-sm">
              <p className="font-medium text-gray-700">{profile?.full_name || `${role} User`}</p>
            </div>
          </div>
          <button onClick={onLogout} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full ml-2" title="Logout">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 hidden lg:block overflow-y-auto">
          <nav className="p-4 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-md text-left text-sm font-medium transition-colors ${
                  currentScreen === item.id
                    ? 'bg-[#EEEDFB] text-[#312DC4] border-l-4 border-[#312DC4]'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
