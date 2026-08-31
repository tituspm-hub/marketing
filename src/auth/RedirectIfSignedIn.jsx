import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider.jsx";
import FullScreenLoader from "../components/FullScreenLoader.jsx";

// Without this the sign-in screen stays on the page after a successful sign-in: the
// form has no idea the session changed, so the user sees nothing happen at all.
export default function RedirectIfSignedIn({ children }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullScreenLoader label="Checking your session…" />;
  if (status === "needsPasswordChange") return <Navigate to="/change-password" replace />;
  if (status === "ready") return <Navigate to={location.state?.from ?? "/"} replace />;
  return children;
}
