import { createContext, lazy, type ReactNode, Suspense, useContext, useMemo, useState } from "react";

import type { AppConfig } from "./config";

/** What the rest of the app needs from auth, whichever provider is behind it. */
export type AppAuth = {
  mode: "dev" | "cognito";
  loading: boolean;
  signedIn: boolean;
  userLabel: string;
  /** Headers that prove who the user is on API calls. */
  headers: () => Record<string, string>;
  signIn: () => void;
  signOut: () => void;
};

export const AuthContext = createContext<AppAuth | null>(null);

export function useAppAuth(): AppAuth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAppAuth must be used inside <AuthProvider>");
  return auth;
}

/** Local mode: a fixed demo user, remembered in localStorage. The API trusts the header only in local mode. */
function DevAuth({ children }: { children: ReactNode }) {
  const [user, setUser] = useState(() => localStorage.getItem("rb.devUser"));
  const value = useMemo<AppAuth>(
    () => ({
      mode: "dev",
      loading: false,
      signedIn: !!user,
      userLabel: user ? "Demo user" : "",
      headers: (): Record<string, string> => (user ? { "x-dev-user": user } : {}),
      signIn: () => {
        localStorage.setItem("rb.devUser", "demo");
        setUser("demo");
      },
      signOut: () => {
        localStorage.removeItem("rb.devUser");
        setUser(null);
      },
    }),
    [user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The OIDC client is only downloaded on AWS deployments; local mode never loads it.
const CognitoAuth = lazy(() => import("./auth-cognito"));

export function AuthProvider({ config, children }: { config: AppConfig; children: ReactNode }) {
  if (config.authMode === "dev") return <DevAuth>{children}</DevAuth>;
  return (
    <Suspense fallback={null}>
      <CognitoAuth config={config}>{children}</CognitoAuth>
    </Suspense>
  );
}

/** For tests: a signed-in user without any provider. */
export function TestAuth({ children }: { children: ReactNode }) {
  const value: AppAuth = { mode: "dev", loading: false, signedIn: true, userLabel: "Test", headers: () => ({}), signIn() {}, signOut() {} };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
