import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider.jsx";
import { isHiddenAccount } from "../shared/roles.js";

export default function AppShell({ children }) {
  const { user, username, role, isAdmin, signOut } = useAuth();
  const hidden = isHiddenAccount(user?.uid);

  const links = [
    { to: "/", label: "Dashboard", show: true },
    { to: "/team", label: "Team", show: isAdmin },
  ].filter((l) => l.show);

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-white border-b border-line">
        <div className="max-w-5xl mx-auto px-4 flex items-center gap-6 h-16">
          <span className="font-display font-extrabold text-lg">Budget tracker</span>

          <nav className="flex gap-1 flex-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  `px-4 grid place-items-center rounded-full text-sm font-semibold ${
                    isActive ? "bg-sky text-primary" : "text-muted-foreground hover:text-ink"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {!hidden && (
              <span className="text-sm text-muted-foreground hidden sm:inline">
                @{username}{role !== "member" ? ` · ${role}` : ""}
              </span>
            )}
            <button onClick={signOut} className="text-sm font-semibold px-4 rounded-full border border-line">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">{children ?? <Outlet />}</main>
    </div>
  );
}
