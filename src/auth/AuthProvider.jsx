import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { onAuthStateChanged, signOut as fbSignOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../lib/firebase.js";
import { effectiveRole } from "../shared/roles.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => onAuthStateChanged(auth, (next) => {
    setUser(next);
    if (!next) {
      setProfile(null);
      setStatus("signedOut");
    } else {
      setStatus("loading");
    }
  }), []);

  useEffect(() => {
    if (!user) return undefined;
    // Live subscription, not a one-off read: a disable or role change lands immediately.
    return onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (!snap.exists()) {
          fbSignOut(auth);
          return;
        }
        const data = snap.data();
        if (data.disabled === true) {
          fbSignOut(auth);
          return;
        }
        setProfile(data);
        setStatus(data.mustChangePassword ? "needsPasswordChange" : "ready");
      },
      () => fbSignOut(auth)
    );
  }, [user]);

  const signOut = useCallback(() => fbSignOut(auth), []);

  const role = user ? effectiveRole(user.uid, profile?.role) : null;
  const value = {
    status,
    user,
    profile,
    role,
    username: profile?.username ?? null,
    isAdmin: role === "admin" || role === "superadmin",
    isSuper: role === "superadmin",
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
