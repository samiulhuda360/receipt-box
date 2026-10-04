import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";

import { GithubOidcStack } from "../lib/github-oidc-stack";
import { ReceiptBoxStack } from "../lib/receipt-box-stack";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const env = { account: "123456789012", region: "ap-southeast-2" };
let t: Template;

beforeAll(() => {
  // Skip esbuild bundling in unit tests; CI runs a real `cdk synth` separately.
  const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
  t = Template.fromStack(new ReceiptBoxStack(app, "Test", { env, root, alarmEmail: "ops@example.com" }));
});

const policyActions = (roleIdFragment: string) =>
  Object.entries(t.findResources("AWS::IAM::Policy"))
    .filter(([id]) => id.includes(roleIdFragment))
    .flatMap(([, p]) => p.Properties.PolicyDocument.Statement as Array<{ Action: string | string[]; Resource: unknown }>);

describe("storage", () => {
  it("keeps every bucket private, encrypted and TLS-only", () => {
    const buckets = Object.values(t.findResources("AWS::S3::Bucket"));
    expect(buckets.length).toBe(2);
    for (const b of buckets) {
      expect(b.Properties.PublicAccessBlockConfiguration).toEqual({ BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true });
      expect(b.Properties.BucketEncryption).toBeDefined();
    }
    const policies = Object.values(t.findResources("AWS::S3::BucketPolicy"));
    expect(policies.every((p) => JSON.stringify(p).includes('"aws:SecureTransport":"false"'))).toBe(true);
  });

  it("sends new uploads (and only uploads) to the processor", () => {
    t.hasResourceProperties("Custom::S3BucketNotifications", {
      NotificationConfiguration: {
        LambdaFunctionConfigurations: [Match.objectLike({ Events: ["s3:ObjectCreated:*"], Filter: { Key: { FilterRules: [{ Name: "prefix", Value: "uploads/" }] } } })],
      },
    });
  });

  it("uses one table with backups, TTL and two sparse indexes", () => {
    t.hasResourceProperties("AWS::DynamoDB::GlobalTable", {
      BillingMode: "PAY_PER_REQUEST",
      TimeToLiveSpecification: { AttributeName: "expiresAt", Enabled: true },
      GlobalSecondaryIndexes: [Match.objectLike({ IndexName: "GSI1" }), Match.objectLike({ IndexName: "GSI2" })],
      Replicas: [Match.objectLike({ PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true } })],
    });
  });
});

describe("compute", () => {
  it("runs both functions on Node 22, ARM, with X-Ray tracing", () => {
    const app = Object.values(t.findResources("AWS::Lambda::Function")).filter((f) => f.Properties.Runtime === "nodejs22.x");
    expect(app).toHaveLength(2);
    for (const f of app) {
      expect(f.Properties.Architectures).toEqual(["arm64"]);
      expect(f.Properties.TracingConfig).toEqual({ Mode: "Active" });
    }
  });

  it("retries failed receipts twice, then parks them in a dead-letter queue", () => {
    t.hasResourceProperties("AWS::Lambda::EventInvokeConfig", {
      MaximumRetryAttempts: 2,
      DestinationConfig: { OnFailure: { Destination: Match.anyValue() } },
    });
  });

  it("gives each function only what it needs", () => {
    const api = policyActions("ApiFunction");
    const proc = policyActions("ProcessFunction");
    const s3 = (stmts: typeof api) => stmts.filter((s) => JSON.stringify(s.Action).includes("s3:"));
    expect(s3(api).flatMap((s) => s.Action)).toEqual(["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]);
    expect(s3(proc).flatMap((s) => s.Action)).toEqual(["s3:GetObject"]);
    expect(JSON.stringify(s3(api)[0]!.Resource)).toContain("/uploads/*");
    expect(proc.some((s) => s.Action === "textract:AnalyzeExpense")).toBe(true);
    expect(api.some((s) => JSON.stringify(s.Action).includes("textract"))).toBe(false);
    expect(JSON.stringify([...api, ...proc])).not.toMatch(/"s3:\*"|"dynamodb:\*"/);
  });
});

describe("API and web", () => {
  it("requires a Cognito token on every route except the health check", () => {
    t.hasResourceProperties("AWS::ApiGatewayV2::Authorizer", { AuthorizerType: "JWT" });
    const routes = Object.values(t.findResources("AWS::ApiGatewayV2::Route")).map((r) => [r.Properties.RouteKey, r.Properties.AuthorizationType ?? "NONE"]);
    expect(routes).toHaveLength(5);
    for (const [key, auth] of routes) expect(auth).toBe(key === "GET /health" ? "NONE" : "JWT");
  });

  it("throttles the API and writes access logs", () => {
    t.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      DefaultRouteSettings: { ThrottlingRateLimit: 20, ThrottlingBurstLimit: 40 },
      AccessLogSettings: { DestinationArn: Match.anyValue(), Format: Match.stringLikeRegexp("requestId") },
    });
  });

  it("serves the app and the API from one CloudFront origin with security headers", () => {
    t.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: "redirect-to-https", ResponseHeadersPolicyId: Match.anyValue() }),
        CacheBehaviors: [Match.objectLike({ PathPattern: "/api/*" }), Match.objectLike({ PathPattern: "/graphql" })],
      }),
    });
  });

  it("uses the code flow with no client secret", () => {
    t.hasResourceProperties("AWS::Cognito::UserPoolClient", { GenerateSecret: false, AllowedOAuthFlows: ["code"], PreventUserExistenceErrors: "ENABLED" });
  });
});

describe("operations", () => {
  it("alarms on dead letters, errors, 5xx and latency, and caps spend", () => {
    expect(Object.keys(t.findResources("AWS::CloudWatch::Alarm"))).toHaveLength(5);
    t.hasResourceProperties("AWS::CloudWatch::Alarm", { MetricName: "ApproximateNumberOfMessagesVisible", Threshold: 1 });
    t.hasResourceProperties("AWS::SNS::Subscription", { Protocol: "email", Endpoint: "ops@example.com" });
    t.hasResourceProperties("AWS::Budgets::Budget", { Budget: Match.objectLike({ BudgetLimit: { Amount: 5, Unit: "USD" } }) });
    t.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
  });
});

describe("GitHub deploys", () => {
  it("trusts only this repository's main branch, and can only hand over to the CDK roles", () => {
    const g = Template.fromStack(new GithubOidcStack(new App(), "Gh", { env, repo: "owner/receipt-box" }));
    g.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
              StringEquals: { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
              StringLike: { "token.actions.githubusercontent.com:sub": "repo:owner/receipt-box:ref:refs/heads/main" },
            },
          }),
        ],
      },
    });
    const [policy] = Object.values(g.findResources("AWS::IAM::Policy"));
    const statements = policy!.Properties.PolicyDocument.Statement as Array<{ Action: string; Resource: unknown }>;
    expect(statements).toHaveLength(1);
    expect(statements[0]!.Action).toBe("sts:AssumeRole");
    expect(JSON.stringify(statements[0]!.Resource)).toContain(":role/cdk-hnb659fds-*");
  });
});
