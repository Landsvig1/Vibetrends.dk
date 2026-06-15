"use client";

import { createContext, useContext, useState, useEffect } from "react";

interface User {
  email: string;
  username: string;
  provider: "email" | "google" | "github";
}

interface AuthContextType {
  user: User | null;
  login: (email: string, provider: "email" | "google" | "github") => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("vt_user");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Use setTimeout to avoid synchronous setState in effect warning/error
        setTimeout(() => setUser(parsed), 0);
      } catch {
        localStorage.removeItem("vt_user");
      }
    }
  }, []);

  const login = (email: string, provider: "email" | "google" | "github") => {
    // Generate username from email
    const baseName = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "_");
    const username = `${baseName}_vibe`;
    const newUser: User = { email, username, provider };
    setUser(newUser);
    localStorage.setItem("vt_user", JSON.stringify(newUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("vt_user");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
