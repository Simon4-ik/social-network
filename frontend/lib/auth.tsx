"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "./api";

type User = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  nickname?: string;
  avatar_path?: string;
  is_public: boolean;
} | null;

type Ctx = {
  user: User;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({ user: null, loading: true, refresh: async () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const u = await api("/api/auth/me");
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  };

  useEffect(() => { refresh(); }, []);

  return <AuthCtx.Provider value={{ user, loading, refresh, logout }}>{children}</AuthCtx.Provider>;
}

export function useAuth() { return useContext(AuthCtx); }
