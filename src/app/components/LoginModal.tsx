"use client";

import { useState } from "react";
import { X, Mail, Loader2 } from "lucide-react";
import { useAuth } from "./AuthProvider";

export default function LoginModal({ onClose }: { onClose: () => void }) {
  const { loginWithEmail, loginWithOAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setMessage("");
    try {
      await loginWithEmail(email);
      setMessage("Vi har sendt et logind-link (magic link) til din e-mail. Tjek venligst din indbakke!");
    } catch (error) {
      console.error(error);
      setMessage("Kunne ikke sende logind-link. Prøv igen.");
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "github") => {
    setLoading(true);
    setMessage("");
    try {
      await loginWithOAuth(provider);
    } catch (error) {
      console.error(error);
      setMessage(`Logind med ${provider} fejlede. Prøv igen.`);
      setLoading(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Log ind" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-xl border border-card-border bg-background p-6 shadow-2xl animate-in fade-in duration-200">
        <button
          onClick={onClose}
          aria-label="Luk"
          className="absolute top-4 right-4 p-1.5 text-text-secondary hover:text-foreground hover:bg-card-border rounded-lg transition-colors cursor-pointer"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="space-y-6">
          <div className="text-center space-y-2">
            <span className="text-xs font-bold text-accent-primary uppercase tracking-wider">Log ind</span>
            <h3 className="text-xl font-bold text-foreground">Velkommen til vibetrends.dk</h3>
            <p className="text-xs text-text-secondary max-w-xs mx-auto">
              Log ind for at få dit eget profilnavn, oprette tråde, indsende projekter eller slette dine bidrag.
            </p>
          </div>

          {message && (
            <div role="status" aria-live="polite" className={`p-3 rounded-lg text-xs font-medium text-center ${message.includes("Tjek") || message.includes("sendt") ? "bg-accent-primary/10 text-accent-primary" : "bg-red-500/10 text-red-500"}`}>
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="login-email" className="text-xs font-semibold text-text-secondary">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" aria-hidden="true" />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="eksempel@vibe.dk"
                  disabled={loading}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-slate-600 focus:outline-none focus:border-accent-primary/20 text-sm disabled:opacity-50"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 rounded-lg btn-primary text-foreground font-bold text-sm shadow cursor-pointer transition flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Sender…</span>
                </>
              ) : (
                <span>Fortsæt med E-mail</span>
              )}
            </button>
          </form>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-card-border"></div>
            <span className="flex-shrink mx-4 text-text-secondary text-[10px] uppercase font-bold tracking-wider">Eller log ind med</span>
            <div className="flex-grow border-t border-card-border"></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleOAuth("google")}
              disabled={loading}
              className="flex items-center justify-center space-x-2 py-2 rounded-lg bg-background border border-card-border hover:bg-card-border text-foreground text-xs font-semibold transition cursor-pointer disabled:opacity-50"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-4 w-4 text-accent-primary"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="4" />
                <line x1="21.17" y1="8" x2="12" y2="8" />
                <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
                <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
              </svg>
              <span>Google</span>
            </button>
            <button
              onClick={() => handleOAuth("github")}
              disabled={loading}
              className="flex items-center justify-center space-x-2 py-2 rounded-lg bg-background border border-card-border hover:bg-card-border text-foreground text-xs font-semibold transition cursor-pointer disabled:opacity-50"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-4 w-4 text-text-secondary"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                <path d="M9 18c-4.51 2-5-2-7-2" />
              </svg>
              <span>GitHub</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
