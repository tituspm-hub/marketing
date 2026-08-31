import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./auth/AuthProvider.jsx";
import RequireAuth from "./auth/RequireAuth.jsx";
import RedirectIfSignedIn from "./auth/RedirectIfSignedIn.jsx";
import RequirePasswordChange from "./auth/RequirePasswordChange.jsx";
import LoginPage from "./auth/LoginPage.jsx";
import ChangePasswordPage from "./auth/ChangePasswordPage.jsx";
import AppShell from "./components/AppShell.jsx";
import DashboardPlaceholder from "./features/dashboard/DashboardPlaceholder.jsx";
import TeamPage from "./features/admin/TeamPage.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<RedirectIfSignedIn><LoginPage /></RedirectIfSignedIn>} />
          <Route
            path="/change-password"
            element={<RequirePasswordChange><ChangePasswordPage /></RequirePasswordChange>}
          />
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route path="/" element={<DashboardPlaceholder />} />
          </Route>
          <Route
            path="/team"
            element={<RequireAuth adminOnly><AppShell><TeamPage /></AppShell></RequireAuth>}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="bottom-center" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}
