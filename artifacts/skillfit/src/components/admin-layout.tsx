import { useLocation, Link } from "wouter";
import { useGetAdminMe, useAdminLogout, getGetAdminMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ReactNode, useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { LANGUAGES } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n";
import { useAdminLanguage } from "@/hooks/use-admin-language";

function getNavItems(t: (key: string) => string) {
  return [{
    href: "/admin",
    label: t("admin.dashboard"),
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    href: "/admin/candidates",
    label: t("admin.candidates"),
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  }];
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: me } = useGetAdminMe({ query: { queryKey: getGetAdminMeQueryKey() } });
  const logoutMutation = useAdminLogout();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [adminLanguage, setAdminLanguage] = useAdminLanguage();
  const { t } = useTranslation(adminLanguage);
  const navItems = getNavItems(t);

  // Close sidebar on navigation on mobile
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location]);

  async function handleLogout() {
    await logoutMutation.mutateAsync();
    await queryClient.invalidateQueries({ queryKey: getGetAdminMeQueryKey() });
    navigate("/admin/login");
  }

  if (!me) {
    return null;
  }

  return (
    <div className="flex h-screen bg-background relative overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed md:relative z-50 h-full w-64 md:w-56 bg-sidebar border-r border-sidebar-border flex flex-col flex-shrink-0 transition-transform duration-300 ease-in-out md:translate-x-0 ${isSidebarOpen ? "translate-x-0 shadow-xl" : "-translate-x-full shadow-none"}`}>
        {/* Mobile Close Button */}
        <button 
          className="absolute top-4 right-4 md:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground"
          onClick={() => setIsSidebarOpen(false)}
        >
          <X size={20} />
        </button>

        {/* Logo */}
        <div className="px-4 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-[#7b241c]">KA</span>
            </div>
            <div>
              <p className="text-xs font-bold text-sidebar-foreground leading-tight">AI SkillFit</p>
              <p className="text-xs text-sidebar-foreground/60 leading-tight">{t("admin.portal")}</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/admin" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-sidebar-border shrink-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-[#7b241c]">{me.username[0].toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate">{me.username}</p>
              <p className="text-xs text-sidebar-foreground/60 capitalize">{me.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-xs font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent py-2 rounded text-left px-2 transition-colors"
          >
            {t("admin.signOut")}
          </button>
          <select
            value={adminLanguage}
            onChange={(event) => setAdminLanguage(event.target.value as typeof adminLanguage)}
            className="mt-2 h-8 w-full rounded bg-sidebar-accent px-2 text-xs text-sidebar-foreground outline-none"
          >
            {LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>{language.name}</option>
            ))}
          </select>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden w-full">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center p-4 border-b border-[#d9c7ac] bg-[#7b241c] text-white shadow-sm z-10 shrink-0">
          <button 
            className="p-2 -ml-2 mr-2 text-white/80 hover:bg-white/10 rounded-md transition-colors"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-white flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-[#7b241c]">KA</span>
            </div>
            <h1 className="font-semibold text-sm">AI SkillFit {t("admin.portal")}</h1>
          </div>
        </header>
        
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto w-full relative">
          {children}
        </div>
      </main>
    </div>
  );
}
