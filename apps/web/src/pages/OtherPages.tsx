import { Link } from "react-router";

import { useAppAuth } from "../auth";
import { Spinner } from "../components/bits";

export function LoginPage() {
  const auth = useAppAuth();
  return (
    <main className="login">
      <div className="login-card">
        <svg viewBox="0 0 32 32" aria-hidden="true" className="login-logo">
          <path d="M10 5h12v22l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z" fill="currentColor" />
        </svg>
        <h1>Receipt Box</h1>
        <p>Snap your receipts, check what was read, and export GST-ready totals for your return.</p>
        {auth.loading ? (
          <Spinner label="Signing in" />
        ) : (
          <button type="button" className="btn btn-primary btn-big" onClick={auth.signIn}>
            {auth.mode === "dev" ? "Continue as demo user" : "Sign in"}
          </button>
        )}
        {auth.mode === "dev" && <p className="muted small">Local mode: no account needed, data stays on this computer.</p>}
      </div>
    </main>
  );
}

export function NotFound() {
  return (
    <div className="center">
      <h1>Page not found</h1>
      <Link to="/">Back to receipts</Link>
    </div>
  );
}
