import { aws_iam as iam, CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";

/**
 * Lets GitHub Actions deploy without stored AWS keys. GitHub signs a short-lived OIDC token for each
 * workflow run; AWS trusts it only for this repository's main branch and swaps it for temporary
 * credentials. The role can do one thing: assume the CDK bootstrap roles, which perform the deploy.
 */
export class GithubOidcStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { repo: string }) {
    super(scope, id, props);

    const github = new iam.OpenIdConnectProvider(this, "GitHub", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    const role = new iam.Role(this, "DeployRole", {
      description: `GitHub Actions deploys for ${props.repo} (main branch only)`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(github.openIdConnectProviderArn, {
        StringEquals: { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
        StringLike: { "token.actions.githubusercontent.com:sub": `repo:${props.repo}:ref:refs/heads/main` },
      }),
    });
    role.addToPolicy(new iam.PolicyStatement({ actions: ["sts:AssumeRole"], resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-*`] }));

    new CfnOutput(this, "DeployRoleArn", { value: role.roleArn, description: "Set as the AWS_DEPLOY_ROLE_ARN repository variable" });
  }
}
