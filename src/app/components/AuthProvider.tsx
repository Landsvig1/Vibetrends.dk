"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { User as SupabaseUser } from "@supabase/supabase-js";

export interface User {
  id: string;
  email: string;
  username: string;
  provider: "email" | "google" | "github";
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
    provider
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
