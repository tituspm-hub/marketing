import { NavLink, Outlet } from "react-router-dom";
import { LayoutGrid, Users, LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthProvider.jsx";
import { isHiddenAccount } from "../shared/roles.js";

export default function AppShell({ children }) {
  const { user, username, role, isAdmin, signOut } = useAuth();
  const hidden = isHiddenAccount(user?.uid);

  const links = [
    { to: "/", label: "Overview", icon: LayoutGrid, end: true },
    { to: "/team", label: "Team", icon: Users, show: isAdmin },
  ].filter((l) => l.show !== false);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden lg:flex flex-col border-r border-line bg-white/70 backdrop-blur-sm">
        <div className="h-[72px] flex items-center gap-2.5 px-6 border-b border-line">
          <img src="/logo.png" alt="" className="size-7" />
          <div className="leading-none">
            <div className="font-display font-extrabold text-[15px] tracking-tight">Budget</div>
            <div className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground mt-1">
              HIRE3X MARKETING
            </div>
          </div>
        </div>

        <nav className="p-3 flex-1">
          <p className="px-3 pt-3 pb-2 text-[10px] font-bold tracking-[0.14em] text-muted-foreground">
            WORKSPACE
          </p>
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={navClass}>
              {({ isActive }) => (
                <>
                  <Icon className={`size-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-line">
          {!hidden && (
            <div className="px-3 py-2 mb-1">
              <div className="text-sm font-semibold truncate">@{username}</div>
              <div className="text-[11px] text-muted-foreground capitalize">
                {role === "superadmin" ? "Owner" : role}
              </div>
            </div>
          )}
          <button onClick={signOut} className={`${navClassBase} w-full text-muted-foreground hover:text-ink`}>
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex flex-col min-w-0">
        <header className="lg:hidden h-16 flex items-center gap-3 px-4 border-b border-line bg-white/80 backdrop-blur-sm sticky top-0 z-30">
          <img src="/logo.png" alt="" className="size-6" />
          <nav className="flex gap-1 flex-1">
            {links.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end} className={navClass}>{label}</NavLink>
            ))}
          </nav>
          <button onClick={signOut} data-compact
                  className="text-sm font-semibold text-muted-foreground px-3 py-2">
            Sign out
          </button>
        </header>

        <main className="flex-1 min-w-0 px-5 sm:px-8 lg:px-10 py-8 lg:py-10">
          <div className="mx-auto w-full max-w-[1180px]">{children ?? <Outlet />}</div>
        </main>
      </div>
    </div>
  );
}

const navClassBase =
  "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors";
const navClass = ({ isActive }) =>
  `${navClassBase} ${isActive ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted hover:text-ink"}`;
