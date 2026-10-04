import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { handle } from "hono/aws-lambda";

import { createApp } from "../app";
import { S3BlobStore } from "../blob/s3";
import { logger, tracer } from "../observability";
import { DynamoRepo } from "../repo/dynamo";
import { requireEnv } from "./env";

// Created once per Lambda container and reused by every request it serves (connection reuse, faster warm starts).
const dynamo = tracer.captureAWSv3Client(new DynamoDBClient({}));
const s3 = tracer.captureAWSv3Client(new S3Client({}));

const app = createApp({
  repo: new DynamoRepo(dynamo, requireEnv("TABLE_NAME")),
  blobs: new S3BlobStore(s3, requireEnv("BUCKET_NAME")),
  log: logger,
  authMode: "jwt", // API Gateway's JWT authorizer has already verified the Cognito token
});

export const handler = handle(app);
