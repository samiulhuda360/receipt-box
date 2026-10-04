import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";

/**
 * Powertools for AWS Lambda: structured JSON logs (searchable in CloudWatch Logs Insights),
 * X-Ray traces (tracing turns itself off outside Lambda) and custom metrics in the embedded
 * metric format (a log line that CloudWatch turns into a metric, no API call needed).
 */
export const logger = new Logger({ serviceName: "receipt-box" });
export const tracer = new Tracer({ serviceName: "receipt-box" });
export const metrics = new Metrics({ namespace: "ReceiptBox", serviceName: "receipt-box" });
