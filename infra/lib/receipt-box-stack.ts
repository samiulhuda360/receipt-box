import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  aws_apigatewayv2 as apigw,
  aws_apigatewayv2_authorizers as authorizers,
  aws_apigatewayv2_integrations as integrations,
  aws_budgets as budgets,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_cloudwatch as cw,
  aws_cloudwatch_actions as cwActions,
  aws_cognito as cognito,
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_lambda_destinations as destinations,
  aws_lambda_nodejs as nodejs,
  aws_logs as logs,
  aws_s3 as s3,
  aws_s3_deployment as s3deploy,
  aws_s3_notifications as s3n,
  aws_sns as sns,
  aws_sns_subscriptions as subscriptions,
  aws_sqs as sqs,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import type { Construct } from "constructs";

export type ReceiptBoxProps = StackProps & {
  /** Repository root, to find the Lambda sources and the built web app. */
  root: string;
  /** Where alarms and budget warnings go. */
  alarmEmail?: string;
  /** Monthly cost budget in USD (alerts at 80% actual and 100% forecast). */
  budgetUsd?: number;
  /** RETAIN for real data; DESTROY lets `cdk destroy` remove everything (demo environments). */
  dataRemovalPolicy?: RemovalPolicy;
};

/**
 * Receipt Box on AWS, serverless end to end:
 *
 *   browser -> CloudFront ---- /            -> S3 (the React app)
 *                          |-- /api/*, /graphql -> API Gateway (HTTP API, Cognito JWT) -> Lambda "api"
 *   browser -> S3 receipts bucket (presigned POST) -> ObjectCreated event -> Lambda "process" -> Textract
 *   both Lambdas -> DynamoDB (single table)       failed events -> SQS dead-letter queue (alarmed)
 */
export class ReceiptBoxStack extends Stack {
  constructor(scope: Construct, id: string, props: ReceiptBoxProps) {
    super(scope, id, props);
    const removal = props.dataRemovalPolicy ?? RemovalPolicy.RETAIN;

    // ------------------------------------------------------------------ data
    const table = new dynamodb.TableV2(this, "Table", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: "expiresAt",
      globalSecondaryIndexes: [
        { indexName: "GSI1", partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING }, sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING } },
        { indexName: "GSI2", partitionKey: { name: "GSI2PK", type: dynamodb.AttributeType.STRING }, sortKey: { name: "GSI2SK", type: dynamodb.AttributeType.STRING } },
      ],
      removalPolicy: removal,
    });

    // The receipts bucket has a fixed name so the Lambdas can be given it (and least-privilege
    // permissions on it) without depending on the bucket resource: the bucket's CORS rule needs the
    // CloudFront domain, and CloudFront depends on the API, which would otherwise form a cycle.
    const receiptsBucketName = `${this.stackName.toLowerCase()}-receipts-${this.account}-${this.region}`;
    const receiptObjects = `arn:${this.partition}:s3:::${receiptsBucketName}/uploads/*`;

    // ------------------------------------------------------------------ compute
    const fn = (name: string, entry: string, extra: Partial<nodejs.NodejsFunctionProps> = {}) =>
      new nodejs.NodejsFunction(this, name, {
        entry: join(props.root, "services/api/src/handlers", entry),
        projectRoot: props.root,
        depsLockFilePath: join(props.root, "package-lock.json"),
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64, // Graviton: about 20% cheaper per GB-second
        tracing: lambda.Tracing.ACTIVE,
        logGroup: new logs.LogGroup(this, `${name}Logs`, { retention: logs.RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY }),
        environment: {
          TABLE_NAME: table.tableName,
          BUCKET_NAME: receiptsBucketName,
          POWERTOOLS_SERVICE_NAME: "receipt-box",
          POWERTOOLS_METRICS_NAMESPACE: "ReceiptBox",
          NODE_OPTIONS: "--enable-source-maps",
        },
        // Bundle the AWS SDK too, so the deployed code runs the exact versions that were tested.
        bundling: { minify: true, sourceMap: true, target: "node22", externalModules: [] },
        ...extra,
      });

    const apiFn = fn("ApiFunction", "api.ts", { memorySize: 512, timeout: Duration.seconds(10) });
    const processFn = fn("ProcessFunction", "process.ts", { memorySize: 1024, timeout: Duration.seconds(60) });

    table.grantReadWriteData(apiFn);
    table.grantReadWriteData(processFn);
    apiFn.addToRolePolicy(new iam.PolicyStatement({ actions: ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"], resources: [receiptObjects] }));
    processFn.addToRolePolicy(new iam.PolicyStatement({ actions: ["s3:GetObject"], resources: [receiptObjects] }));
    processFn.addToRolePolicy(new iam.PolicyStatement({ actions: ["textract:AnalyzeExpense"], resources: ["*"] })); // Textract has no resource-level ARNs

    // Async invocations (S3 events) retry twice; whatever still fails lands here, and an alarm fires.
    const dlq = new sqs.Queue(this, "ProcessDeadLetters", { retentionPeriod: Duration.days(14), enforceSSL: true });
    processFn.configureAsyncInvoke({ retryAttempts: 2, maxEventAge: Duration.hours(1), onFailure: new destinations.SqsDestination(dlq) });

    // ------------------------------------------------------------------ sign-in
    const users = new cognito.UserPool(this, "Users", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: { minLength: 12 },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: removal,
    });
    const domain = users.addDomain("Domain", { cognitoDomain: { domainPrefix: `receipt-box-${this.account}` } });

    // ------------------------------------------------------------------ API
    const api = new apigw.HttpApi(this, "Api", { description: "Receipt Box API (GraphQL + REST)" });
    const stage = api.defaultStage!.node.defaultChild as apigw.CfnStage;
    stage.defaultRouteSettings = { throttlingRateLimit: 20, throttlingBurstLimit: 40 };
    const accessLogs = new logs.LogGroup(this, "ApiAccessLogs", { retention: logs.RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY });
    stage.accessLogSettings = {
      destinationArn: accessLogs.logGroupArn,
      format: JSON.stringify({ requestId: "$context.requestId", route: "$context.routeKey", status: "$context.status", ms: "$context.responseLatency", user: "$context.authorizer.claims.sub" }),
    };

    // ------------------------------------------------------------------ web
    const site = new s3.Bucket(this, "Site", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    // Client-side routes (/receipts/123) have no file: serve index.html for any path without a dot.
    const spaRewrite = new cloudfront.Function(this, "SpaRewrite", {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline("function handler(event){var r=event.request;if(r.uri.indexOf('.')===-1){r.uri='/index.html';}return r;}"),
    });
    const toApi: cloudfront.BehaviorOptions = {
      origin: new origins.HttpOrigin(`${api.apiId}.execute-api.${this.region}.amazonaws.com`),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER, // keeps Authorization
    };
    const distribution = new cloudfront.Distribution(this, "Web", {
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL, // includes the Auckland and Sydney edges
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(site),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations: [{ function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: { "/api/*": toApi, "/graphql": toApi },
    });
    const siteUrl = `https://${distribution.distributionDomainName}`;

    // ------------------------------------------------------------------ receipts bucket
    const receipts = new s3.Bucket(this, "Receipts", {
      bucketName: receiptsBucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: removal,
      autoDeleteObjects: removal === RemovalPolicy.DESTROY,
      cors: [{ allowedOrigins: [siteUrl, "http://localhost:5173"], allowedMethods: [s3.HttpMethods.POST, s3.HttpMethods.GET], allowedHeaders: ["*"], maxAge: 3000 }],
      lifecycleRules: [{ abortIncompleteMultipartUploadAfter: Duration.days(1) }],
    });
    receipts.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(processFn), { prefix: "uploads/" });

    const client = users.addClient("Web", {
      generateSecret: false, // a browser can't keep a secret; the code flow uses PKCE instead
      preventUserExistenceErrors: true,
      accessTokenValidity: Duration.hours(1),
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
        callbackUrls: [`${siteUrl}/`, "http://localhost:5173/"],
        logoutUrls: [`${siteUrl}/`, "http://localhost:5173/"],
      },
    });

    const jwt = new authorizers.HttpJwtAuthorizer("Cognito", `https://cognito-idp.${this.region}.amazonaws.com/${users.userPoolId}`, {
      jwtAudience: [client.userPoolClientId],
    });
    const integration = new integrations.HttpLambdaIntegration("ApiIntegration", apiFn);
    api.addRoutes({ path: "/graphql", methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST], integration, authorizer: jwt });
    api.addRoutes({ path: "/api/{proxy+}", methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST], integration, authorizer: jwt });
    api.addRoutes({ path: "/health", methods: [apigw.HttpMethod.GET], integration });

    // One build of the React app for every environment: the stack writes its runtime config.
    const dist = join(props.root, "apps/web/dist");
    if (existsSync(join(dist, "index.html"))) {
      new s3deploy.BucketDeployment(this, "DeployWeb", {
        destinationBucket: site,
        sources: [
          s3deploy.Source.asset(dist, { exclude: ["config.json"] }),
          s3deploy.Source.jsonData("config.json", {
            authMode: "cognito",
            authority: `https://cognito-idp.${this.region}.amazonaws.com/${users.userPoolId}`,
            clientId: client.userPoolClientId,
            domain: domain.baseUrl(),
          }),
        ],
        distribution,
        distributionPaths: ["/*"],
      });
    }

    // ------------------------------------------------------------------ monitoring
    const topic = new sns.Topic(this, "Alarms", { displayName: "Receipt Box alarms" });
    if (props.alarmEmail) topic.addSubscription(new subscriptions.EmailSubscription(props.alarmEmail));
    const fiveMinutes = Duration.minutes(5);
    const alarm = (id: string, metric: cw.IMetric, threshold: number, description: string) => {
      const a = new cw.Alarm(this, id, {
        metric,
        threshold,
        evaluationPeriods: 1,
        comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cw.TreatMissingData.NOT_BREACHING,
        alarmDescription: `${description} Runbook: docs/runbook.md`,
      });
      a.addAlarmAction(new cwActions.SnsAction(topic));
      return a;
    };
    alarm("DeadLettersAlarm", dlq.metricApproximateNumberOfMessagesVisible({ period: fiveMinutes, statistic: "Maximum" }), 1, "A receipt failed processing after retries.");
    alarm("ProcessErrorsAlarm", processFn.metricErrors({ period: fiveMinutes }), 3, "The receipt processor is failing.");
    alarm("ApiErrorsAlarm", apiFn.metricErrors({ period: fiveMinutes }), 3, "The API function is throwing.");
    alarm("Api5xxAlarm", api.metricServerError({ period: fiveMinutes }), 5, "The API is returning 5xx responses.");
    alarm("ApiLatencyAlarm", api.metricLatency({ period: fiveMinutes, statistic: "p95" }), 3000, "API p95 latency is over 3 seconds.");

    const receiptsMetric = (name: string) => new cw.Metric({ namespace: "ReceiptBox", metricName: name, dimensionsMap: { service: "receipt-box" }, statistic: "Sum", period: fiveMinutes });
    new cw.Dashboard(this, "Dashboard", {
      dashboardName: `${this.stackName}`,
      widgets: [
        [
          new cw.GraphWidget({ title: "API requests and errors", left: [api.metricCount({ period: fiveMinutes })], right: [api.metricClientError({ period: fiveMinutes }), api.metricServerError({ period: fiveMinutes })] }),
          new cw.GraphWidget({ title: "API latency (p50 / p95)", left: [api.metricLatency({ statistic: "p50" }), api.metricLatency({ statistic: "p95" })] }),
        ],
        [
          new cw.GraphWidget({ title: "Receipts read / unreadable", left: [receiptsMetric("ReceiptsRead"), receiptsMetric("ReceiptsUnreadable")] }),
          new cw.GraphWidget({ title: "Processor duration (p95) and errors", left: [processFn.metricDuration({ statistic: "p95" })], right: [processFn.metricErrors()] }),
          new cw.SingleValueWidget({ title: "Dead letters", metrics: [dlq.metricApproximateNumberOfMessagesVisible()] }),
        ],
      ],
    });

    new budgets.CfnBudget(this, "Budget", {
      budget: { budgetType: "COST", timeUnit: "MONTHLY", budgetLimit: { amount: props.budgetUsd ?? 5, unit: "USD" } },
      notificationsWithSubscribers: props.alarmEmail
        ? [
            { notification: { notificationType: "ACTUAL", comparisonOperator: "GREATER_THAN", threshold: 80, thresholdType: "PERCENTAGE" }, subscribers: [{ subscriptionType: "EMAIL", address: props.alarmEmail }] },
            { notification: { notificationType: "FORECASTED", comparisonOperator: "GREATER_THAN", threshold: 100, thresholdType: "PERCENTAGE" }, subscribers: [{ subscriptionType: "EMAIL", address: props.alarmEmail }] },
          ]
        : undefined,
    });

    new CfnOutput(this, "SiteUrl", { value: siteUrl });
    new CfnOutput(this, "UserPoolId", { value: users.userPoolId });
    new CfnOutput(this, "ReceiptsBucket", { value: receipts.bucketName });
    new CfnOutput(this, "TableName", { value: table.tableName });
    new CfnOutput(this, "DeadLetterQueue", { value: dlq.queueUrl });
  }
}
