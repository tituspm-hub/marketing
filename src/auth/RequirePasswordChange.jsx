import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider.jsx";
import FullScreenLoader from "../components/FullScreenLoader.jsx";

// The change-password screen reads user.email, so it must never render without a
// session. It is reachable both when forced and when someone chooses to change it.
export default function RequirePasswordChange({ children }) {
  const { status } = useAuth();

  if (status === "loading") return <FullScreenLoader label="Checking your session…" />;
  if (status === "signedOut") return <Navigate to="/login" replace />;
  return children;
}
