import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  House, PaperPlaneTilt, FileText, FileDoc, ClockCounterClockwise,
  UsersThree, Key, Code, SignOut,
} from "@phosphor-icons/react";

const NAV = [
  { to: "/", label: "Dashboard", icon: House, end: true },
  { to: "/compose", label: "Compose", icon: PaperPlaneTilt },
  { to: "/email-templates", label: "Email Templates", icon: FileText },
  { to: "/word-templates", label: "Word Templates", icon: FileDoc },
  { to: "/history", label: "History", icon: ClockCounterClockwise },
  { to: "/api-keys", label: "API Keys", icon: Key },
  { to: "/api-docs", label: "API Docs", icon: Code },
];

const ADMIN_NAV = [
  { to: "/users", label: "Users", icon: UsersThree },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex bg-[#F8F9FA]" data-testid="app-layout">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-[#E2E8F0] flex flex-col">
        <div className="px-6 py-6 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#002FA7] flex items-center justify-center">
              <PaperPlaneTilt size={18} color="white" weight="fill" />
            </div>
            <div>
              <div className="font-display text-base leading-none">MAILMERGE</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] mt-1">Control Room</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#002FA7] text-white"
                    : "text-[#4B5563] hover:bg-[#F8F9FA] hover:text-[#111827]"
                }`
              }
            >
              <item.icon size={18} weight="regular" />
              <span>{item.label}</span>
            </NavLink>
          ))}
          {user?.role === "admin" && (
            <>
              <div className="mt-6 px-3 text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF]">Admin</div>
              {ADMIN_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-[#002FA7] text-white"
                        : "text-[#4B5563] hover:bg-[#F8F9FA] hover:text-[#111827]"
                    }`
                  }
                >
                  <item.icon size={18} weight="regular" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="border-t border-[#E2E8F0] p-4">
          <div className="text-xs text-[#9CA3AF] uppercase tracking-wider mb-1">Signed in</div>
          <div className="text-sm font-medium text-[#111827] truncate" data-testid="current-user-email">{user?.email}</div>
          <div className="text-xs text-[#4B5563] mb-3">{user?.role === "admin" ? "Administrator" : "User"}</div>
          <button
            onClick={handleLogout}
            data-testid="logout-button"
            className="w-full flex items-center justify-center gap-2 border border-[#111827] text-[#111827] py-2 text-sm font-semibold hover:bg-[#111827] hover:text-white transition-colors"
          >
            <SignOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
