import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider.jsx";
import FullScreenLoader from "../components/FullScreenLoader.jsx";

export default function RequireAuth({ children, adminOnly = false }) {
  const { status, isAdmin } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullScreenLoader />;
  if (status === "signedOut") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  // Checked before anything else renders, so no route can be reached around it.
  if (status === "needsPasswordChange") {
    return <Navigate to="/change-password" replace />;
  }
  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }
  return children;
}
