import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { TextractClient } from "@aws-sdk/client-textract";
import { MetricUnit } from "@aws-lambda-powertools/metrics";
import type { Context, S3Event } from "aws-lambda";

import { S3BlobStore } from "../blob/s3";
import { TextractExtractor } from "../extract/textract";
import { logger, metrics, tracer } from "../observability";
import { processUpload } from "../process";
import { DynamoRepo } from "../repo/dynamo";
import { requireEnv } from "./env";

const deps = {
  repo: new DynamoRepo(tracer.captureAWSv3Client(new DynamoDBClient({})), requireEnv("TABLE_NAME")),
  blobs: new S3BlobStore(tracer.captureAWSv3Client(new S3Client({})), requireEnv("BUCKET_NAME")),
  extractor: new TextractExtractor(tracer.captureAWSv3Client(new TextractClient({}))),
};

const METRIC = { processed: "ReceiptsRead", failed: "ReceiptsUnreadable", skipped: "ReceiptsSkipped" } as const;

/**
 * Triggered asynchronously by S3 for each new object under uploads/. Lambda retries a failed
 * invocation twice, then sends the event to the dead-letter queue (see infra).
 */
export async function handler(event: S3Event, context: Context) {
  logger.addContext(context);
  try {
    for (const record of event.Records) {
      // S3 event keys are URL-encoded, with spaces as "+".
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
      const result = await processUpload({ ...deps, log: logger }, key);
      metrics.addMetric(METRIC[result], MetricUnit.Count, 1);
    }
  } finally {
    metrics.publishStoredMetrics();
  }
}
