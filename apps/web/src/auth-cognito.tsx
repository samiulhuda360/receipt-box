import type { ReactNode } from "react";
import { useMemo } from "react";
import { AuthProvider as OidcProvider, useAuth as useOidc } from "react-oidc-context";

import { type AppAuth, AuthContext } from "./auth";
import type { AppConfig } from "./config";

type CognitoConfig = Extract<AppConfig, { authMode: "cognito" }>;

/** AWS: Cognito Hosted UI with the authorization code flow + PKCE (no client secret in the browser). */
function CognitoBridge({ config, children }: { config: CognitoConfig; children: ReactNode }) {
  const oidc = useOidc();
  const value = useMemo<AppAuth>(
    () => ({
      mode: "cognito",
      loading: oidc.isLoading,
      signedIn: oidc.isAuthenticated,
      userLabel: (oidc.user?.profile.email as string | undefined) ?? "",
      headers: (): Record<string, string> => (oidc.user?.access_token ? { authorization: `Bearer ${oidc.user.access_token}` } : {}),
      signIn: () => void oidc.signinRedirect(),
      signOut: () => {
        void oidc.removeUser();
        const back = encodeURIComponent(window.location.origin + "/");
        window.location.href = `${config.domain}/logout?client_id=${config.clientId}&logout_uri=${back}`;
      },
    }),
    [oidc, config],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}


export default function CognitoAuth({ config, children }: { config: CognitoConfig; children: ReactNode }) {
  return (
    <OidcProvider
      authority={config.authority}
      client_id={config.clientId}
      redirect_uri={window.location.origin + "/"}
      scope="openid email"
      automaticSilentRenew
      // Remove ?code=...&state=... from the address bar after sign-in.
      onSigninCallback={() => window.history.replaceState({}, document.title, window.location.pathname)}
    >
      <CognitoBridge config={config}>{children}</CognitoBridge>
    </OidcProvider>
  );
}
