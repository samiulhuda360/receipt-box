# Runbook

What to do when an alarm fires or a user reports a problem. Every log line is JSON with `correlation_id` (API Gateway's request id), and receipt-related lines carry `receiptId`.

## Find everything about one receipt

CloudWatch → Logs Insights → select both log groups (`ReceiptBox-ApiFunction...` and `ReceiptBox-ProcessFunction...`):

```
fields @timestamp, @log, level, message, error, engine, ms
| filter receiptId = "<receipt id from the URL /receipts/<id>>"
| sort @timestamp asc
```

The normal sequence is `upload started` (API) → `receipt read` (processor). From a browser error report, search by request id instead:

```
fields @timestamp, @log, level, message, error
| filter correlation_id = "<x-request-id>" or clientRequestId = "<x-request-id>"
| sort @timestamp asc
```

## "My receipt is stuck on Reading"

1. **No `receipt read` and no error in the processor logs.** The processor never ran.
   - Is the object in S3 under `uploads/<user>/<receiptId>/`? If not, the browser upload failed. Look for a `browser error` log from the same user.
   - Is the bucket notification configured for the `uploads/` prefix? Check it in the stack template.
2. **`transient error reading receipt; letting Lambda retry`.** Throttling or a service error. If it repeated three times, the event is in the dead-letter queue (see below).
3. **`could not read receipt`.** The receipt is FAILED, and the user can enter it by hand. If many fail, check the `ReceiptsUnreadable` metric and a few images; a new receipt layout may need a parsing rule.

A receipt in PROCESSING for more than 5 minutes is editable by hand, so users are never blocked.

## Alarm: DeadLettersAlarm

Something failed processing after Lambda's retries.

1. SQS → `ProcessDeadLetters` → *Send and receive messages* → poll. Each message is the original S3 event plus the error (`responsePayload`).
2. Find the cause in the processor logs (search by the object key).
3. Fix it, then **redrive**: SQS → *Start DLQ redrive*, or invoke the processor with the event body. The processor is idempotent, so redriving a receipt that was since read does nothing.

## Alarm: ProcessErrorsAlarm or ApiErrorsAlarm

```
fields @timestamp, message, error, correlation_id
| filter level = "ERROR"
| sort @timestamp desc
| limit 50
```

Open the X-Ray trace for one of the failing requests to see which AWS call failed or was slow.

## Alarm: Api5xxAlarm / ApiLatencyAlarm

- Check the API Gateway access log group (`ApiAccessLogs`): the `status` and `ms` fields per route.
- Throttling shows as 429s: the stage limit is 20 requests/s with bursts of 40.
- Slow DynamoDB or S3 calls show in X-Ray. Cold starts appear as an `Init` segment on the API function.

## Budget email

AWS Budgets warns at 80% of the monthly budget (actual) and at 100% (forecast). The usual causes are Textract volume (check `ReceiptsRead`) or a runaway client polling the API (check the access logs per user).
