"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Mail, UserPlus } from "lucide-react";
import { createSupabaseBrowserClient, getSupabaseBrowserConfigError } from "@/lib/auth/browser";

type AuthMode = "login" | "signup";

export function AuthForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const supabaseConfigError = useMemo(() => getSupabaseBrowserConfigError(), []);
  const supabase = useMemo(() => {
    if (supabaseConfigError) return null;

    try {
      return createSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, [supabaseConfigError]);
  const authConfigError = supabaseConfigError ?? (!supabase ? "Supabase login is not configured correctly yet." : null);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      if (!supabase) {
        throw new Error(authConfigError ?? "Supabase login is not configured correctly yet.");
      }

      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (signInError) throw signInError;
        router.push(nextPath || "/generate");
        router.refresh();
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath || "/generate")}`
        }
      });

      if (signUpError) throw signUpError;

      if (data.session) {
        router.push(nextPath || "/generate");
        router.refresh();
        return;
      }

      setMessage("Check your email to confirm your account, then come back and log in.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-mode-toggle" role="group" aria-label="Authentication mode">
        <button
          className={mode === "login" ? "primary-button compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setMode("login")}
        >
          <Lock aria-hidden="true" size={16} />
          Log in
        </button>
        <button
          className={mode === "signup" ? "primary-button compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setMode("signup")}
        >
          <UserPlus aria-hidden="true" size={16} />
          Sign up
        </button>
      </div>

      <div className="field-stack">
        <div className="field">
          <label htmlFor="email">Email</label>
          <div className="input-with-icon">
            <Mail aria-hidden="true" size={17} />
            <input
              id="email"
              className="text-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <div className="input-with-icon">
            <Lock aria-hidden="true" size={17} />
            <input
              id="password"
              className="text-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>
        </div>

        {error ? <div className="error-box">{error}</div> : null}
        {authConfigError ? <div className="error-box">{authConfigError}</div> : null}
        {message ? <div className="notice-box">{message}</div> : null}

        <button
          className="primary-button auth-submit"
          disabled={Boolean(authConfigError) || isSubmitting || !email || password.length < 6}
          onClick={submit}
          type="button"
        >
          {isSubmitting ? <Loader2 aria-hidden="true" size={18} className="spinner" /> : <Lock aria-hidden="true" size={18} />}
          {mode === "login" ? "Log in" : "Create account"}
        </button>
      </div>
    </div>
  );
}
