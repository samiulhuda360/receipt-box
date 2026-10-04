import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { App, RemovalPolicy } from "aws-cdk-lib";

import { GithubOidcStack } from "../lib/github-oidc-stack";
import { ReceiptBoxStack } from "../lib/receipt-box-stack";

const app = new App();
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? "ap-southeast-2" };

new ReceiptBoxStack(app, "ReceiptBox", {
  env,
  root,
  alarmEmail: app.node.tryGetContext("alarmEmail"),
  budgetUsd: Number(app.node.tryGetContext("budgetUsd") ?? 5),
  // A demo deploy should be removable with `cdk destroy`; pass -c keepData=true for real data.
  dataRemovalPolicy: app.node.tryGetContext("keepData") === "true" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
});

const repo = app.node.tryGetContext("githubRepo") as string | undefined;
if (repo) new GithubOidcStack(app, "ReceiptBoxGithub", { env, repo });
