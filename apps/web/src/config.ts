/**
 * Runtime configuration, fetched from /config.json at start-up. The same build runs locally
 * (authMode "dev") and on AWS, where the deployment writes the Cognito details into config.json.
 */
export type AppConfig =
  | { authMode: "dev" }
  | {
      authMode: "cognito";
      /** https://cognito-idp.<region>.amazonaws.com/<userPoolId> */
      authority: string;
      clientId: string;
      /** https://<prefix>.auth.<region>.amazoncognito.com, for sign-out */
      domain: string;
    };

export async function loadConfig(): Promise<AppConfig> {
  const res = await fetch("/config.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`config.json: ${res.status}`);
  return (await res.json()) as AppConfig;
}
