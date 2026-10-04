# Architecture decisions

Each decision with the alternative considered and the trade-off accepted.

## 1. Serverless on AWS (Lambda, API Gateway, DynamoDB, S3)
- **Why:** traffic is small and bursty (receipts arrive in batches), so pay-per-request costs about nothing when idle, and there are no servers to patch.
- **Instead of:** a container on ECS/Fargate. That's simpler to debug locally and has no cold starts, but costs money around the clock.
- **Trade-off:** cold starts (kept small with bundled, minified functions created outside the handler) and Lambda's limits (6 MB payloads, which is why uploads go straight to S3).

## 2. One API function for all routes; a separate processor
- **Why:** one warm container serves GraphQL and REST, so cold starts are fewer and deploys simpler. The processor has different needs (Textract permission, 1 GB of memory, a 60 s timeout, an async retry policy).
- **Instead of:** one function per route, which allows finer permissions and scaling at the cost of more cold starts and more configuration.

## 3. GraphQL for data, REST for files and side effects
- **GraphQL:** the inbox, ledger, summary, save and delete. The client chooses fields, and codegen types both ends.
- **REST:**
  - `POST /api/uploads` returns a signed S3 form, not data;
  - `GET /api/export.csv` is a file download that browsers handle natively;
  - `POST /api/telemetry` is a fire-and-forget error report.

## 4. Browser → S3 presigned POST
- The POST policy pins the key, content type and size range, and S3 enforces them. The processor re-checks the bytes (magic numbers), because a policy can only check the declared type.
- **Instead of:** streaming through Lambda, which has a 6 MB limit and costs compute time.

## 5. DynamoDB single table with sparse indexes
- **Access patterns:** get by id; reviewed receipts by date range; unreviewed inbox. Two sparse GSIs mean each query reads only the rows it returns.
- **Optimistic locking** with a version number: read, merge, conditional put. Writing the whole item keeps the index keys consistent with the status.
- **Instead of:** Aurora Serverless / Postgres. That's better for ad-hoc reporting and joins, but the access patterns here are fixed and small, so DynamoDB's on-demand cost and zero maintenance win.

## 6. Async processing with retries, idempotency and a DLQ
- S3 invokes the processor asynchronously, and Lambda retries it twice. The DLQ catches the rest, with an alarm.
- **Idempotent:** a duplicate event finds the receipt already read and skips it.
- **Error classes:** transient errors are re-thrown (retry); permanent ones mark the receipt FAILED (no point retrying), so the user can type it in.
- **Instead of:** an SQS queue between S3 and Lambda. That gives better batching and replay control; worth it at higher volume.

## 7. Textract on AWS, Tesseract locally, both behind one interface
- `Extractor` has one method. Textract AnalyzeExpense is a managed receipt model. Tesseract plus readable parsing rules lets the app, its tests and the evaluation run without an AWS account.
- Every field carries a confidence score, and the UI asks people to check anything under 80%. **The person, not the model, has the final say.**

## 8. Same origin through CloudFront
- `/graphql` and `/api/*` are proxied to API Gateway. No CORS, no preflight latency, one place for security headers.
- Authorization headers are forwarded; caching is disabled for API paths.

## 9. Cognito with the authorization code flow + PKCE, JWT checked at the gateway
- Bad or missing tokens are rejected by API Gateway before any Lambda runs. Resolvers scope every read and write to the token's `sub`.

## 10. Money as integer cents, dates as ISO strings
- Floating point can't represent 0.10 exactly, so all money is cents. GST included in a price is 3/23 of it.
- Dates are `yyyy-mm-dd` strings, so a receipt dated 31 March never slides into April because of a time zone.

## 11. Infrastructure and delivery
- **CDK in TypeScript,** in the same language as the app, tested with assertions.
- **GitHub OIDC** for deploys: short-lived credentials limited to the main branch; no stored keys.
- **Observability built in:** structured logs, a correlation ID end to end, X-Ray, metrics, 5 alarms, a dashboard and a budget.

## Known limits and next steps
- Textract's sync API: single-page JPEG/PNG only. Multi-page PDFs need `StartExpenseAnalysis` plus a completion notification.
- **Polling vs push:** polling (only while busy) is fine at this scale. With many concurrent users, use AppSync subscriptions or API Gateway WebSockets.
- **Bundle:** zod's full build is about a quarter of the main JavaScript; `zod/mini` would cut it further.
- **Region:** Sydney by default. Choose a region that matches the data-residency policy.
