import { NavLink, Outlet, useSearchParams } from "react-router-dom";
import { LayoutGrid, ReceiptText, Users, LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthProvider.jsx";
import { isHiddenAccount } from "../shared/roles.js";

export default function AppShell({ children }) {
  const { user, username, role, isAdmin, signOut } = useAuth();
  const [params] = useSearchParams();
  const hidden = isHiddenAccount(user?.uid);

  // Overview and Ledger are two views of one month, so moving between them carries it.
  const month = params.get("m");
  const keepMonth = month ? `?m=${month}` : "";

  const links = [
    { to: "/", label: "Overview", icon: LayoutGrid, end: true, search: keepMonth },
    { to: "/ledger", label: "Ledger", icon: ReceiptText, search: keepMonth },
    { to: "/team", label: "Team", icon: Users, show: isAdmin },
  ].filter((l) => l.show !== false);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden lg:flex flex-col border-r border-line bg-white/70 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-line">
          <img src="/logo.png" alt="Hire3x" className="size-14 rounded-2xl shrink-0" />
          <div className="min-w-0">
            <div className="font-display font-extrabold text-lg leading-none tracking-tight">Budget</div>
            <div className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground mt-1.5">
              HIRE3X MARKETING
            </div>
          </div>
        </div>

        <nav className="p-3 flex-1" data-tour="nav">
          <p className="px-3 pt-3 pb-2 text-[10px] font-bold tracking-[0.14em] text-muted-foreground">
            WORKSPACE
          </p>
          {links.map(({ to, label, icon: Icon, end, search }) => (
            <NavLink key={to} to={{ pathname: to, search }} end={end} className={navClass}>
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
          <img src="/logo.png" alt="Hire3x" className="size-9 rounded-xl shrink-0" />
          <nav className="flex gap-1 flex-1 overflow-x-auto">
            {links.map(({ to, label, end, search }) => (
              <NavLink key={to} to={{ pathname: to, search }} end={end} className={navClass}>
                {label}
              </NavLink>
            ))}
          </nav>
          <button onClick={signOut} data-compact
                  className="text-sm font-semibold text-muted-foreground px-3 py-2">
            Sign out
          </button>
        </header>

        <main className="flex-1 min-w-0 px-5 sm:px-8 lg:px-10 py-6 lg:py-8">
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
