import { Component, type ErrorInfo, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router";

import type { Api } from "../api";
import { useAppAuth } from "../auth";

export function AppShell() {
  const auth = useAppAuth();
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <NavLink to="/" className="brand" aria-label="Receipt Box home">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M10 5h12v22l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z" fill="currentColor" />
            </svg>
            Receipt Box
          </NavLink>
          <nav aria-label="Main">
            <NavLink to="/" end>
              Receipts
            </NavLink>
            <NavLink to="/export">Export</NavLink>
          </nav>
          <div className="who">
            <span className="muted">{auth.userLabel}</span>
            <button type="button" className="btn btn-small btn-ghost" onClick={auth.signOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="wrap">
        <Outlet />
      </main>
    </>
  );
}

/** Catches render errors, reports them with the last API request id, and offers a way back. */
export class ErrorBoundary extends Component<{ api: Api; children: ReactNode }, { error?: Error }> {
  override state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.api.reportError({ message: error.message, stack: `${error.stack ?? ""}\n${info.componentStack ?? ""}` });
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="wrap center">
        <h1>Something broke on this page</h1>
        <p className="muted">It has been reported. Your receipts are safe.</p>
        <button type="button" className="btn btn-primary" onClick={() => (window.location.href = "/")}>
          Back to receipts
        </button>
      </main>
    );
  }
}
