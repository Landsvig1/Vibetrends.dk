"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { User as SupabaseUser } from "@supabase/supabase-js";
import { ADMIN_EMAIL, ADMIN_GITHUB_USERNAME } from "@/lib/permissions";

export interface User {
  id: string;
  email: string;
  username: string;
  provider: "email" | "google" | "github";
  isAdmin: boolean;
}

function checkIsAdmin(u: SupabaseUser): boolean {
  const email = (u.email || "").toLowerCase();
  const githubUsername = u.user_metadata?.user_name;
  return email === ADMIN_EMAIL || githubUsername === ADMIN_GITHUB_USERNAME;
}

interface AuthContextType {
  user: User | null;
  loginWithEmail: (email: string) => Promise<void>;
  loginWithOAuth: (provider: "google" | "github") => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapSupabaseUser(u: SupabaseUser): User {
  const email = u.email || '';
  const baseName = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "_");
  const username = u.user_metadata?.full_name || `${baseName}_vibe`;
  
  let provider: "email" | "google" | "github" = "email";
  const rawProvider = u.app_metadata?.provider;
  if (rawProvider === "google" || rawProvider === "github") {
    provider = rawProvider;
  }

  return {
    id: u.id,
    email,
    username,
    provider,
    isAdmin: checkIsAdmin(u)
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(mapSupabaseUser(session.user));
      }
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(mapSupabaseUser(session.user));
      } else {
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const loginWithEmail = async (email: string) => {
    // TEST-LOGIN FALLBACK (E2E/dev only). Sets a client-side mock user with no
    // real Supabase session — server mutations re-check the real cookie and will
    // no-op for this user, so it grants no privileges. It does currently ship to
    // production, though. DEFERRED: gate behind an explicit env flag
    // (e.g. NEXT_PUBLIC_E2E_TEST_LOGIN) so it never reaches prod builds.
    if (email === 'testuser@vibetrends.dk' || email.endsWith('@test.dk')) {
      const mockUser = {
        id: '00000000-0000-0000-0000-000000000000',
        email: email,
        user_metadata: { full_name: email.split('@')[0] + '_vibe' },
        app_metadata: { provider: 'email' }
      };
      setUser(mapSupabaseUser(mockUser as unknown as SupabaseUser));
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      }
    });
    if (error) throw error;
  };

  const loginWithOAuth = async (provider: "google" | "github") => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      }
    });
    if (error) throw error;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loginWithEmail, loginWithOAuth, logout }}>
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
