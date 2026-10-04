import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { AnalyzeExpenseCommand, TextractClient } from "@aws-sdk/client-textract";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context, S3Event } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import { beforeAll, describe, expect, it } from "vitest";

import { toItem } from "../src/repo/dynamo";

// The handlers build their AWS clients when imported, so the mocks and env go first.
process.env.TABLE_NAME = "receipts-table";
process.env.BUCKET_NAME = "receipts-bucket";
const ddb = mockClient(DynamoDBDocumentClient);
const s3 = mockClient(S3Client);
const textract = mockClient(TextractClient);
const context = { functionName: "test", awsRequestId: "lambda-req" } as Context;

let apiHandler: (e: APIGatewayProxyEventV2WithJWTAuthorizer, c: Context) => Promise<{ statusCode: number; body: string; headers?: Record<string, string> }>;
let processHandler: (e: S3Event, c: Context) => Promise<void>;
beforeAll(async () => {
  apiHandler = (await import("../src/handlers/api")).handler as never;
  processHandler = (await import("../src/handlers/process")).handler;
});

/** The event API Gateway (HTTP API, payload v2) sends after its JWT authorizer has accepted a token. */
function httpEvent(method: string, path: string, body?: object, sub = "cognito-user-1"): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: "2.0",
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: "",
    headers: { "content-type": "application/json", host: "abc123.execute-api.ap-southeast-2.amazonaws.com" },
    requestContext: {
      accountId: "123456789012",
      apiId: "abc123",
      domainName: "abc123.execute-api.ap-southeast-2.amazonaws.com",
      domainPrefix: "abc123",
      http: { method, path, protocol: "HTTP/1.1", sourceIp: "203.0.113.9", userAgent: "test" },
      requestId: "apigw-req-1",
      routeKey: `${method} ${path}`,
      stage: "$default",
      time: "04/Oct/2026:01:00:00 +0000",
      timeEpoch: 1791075600000,
      authorizer: { principalId: "", integrationLatency: 0, jwt: { claims: { sub }, scopes: [] } },
    },
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe("api Lambda", () => {
  it("answers GraphQL for the user in the verified token and echoes API Gateway's request id", async () => {
    ddb.reset();
    ddb.on(QueryCommand).resolves({ Items: [] });
    const res = await apiHandler(httpEvent("POST", "/graphql", { query: "{ inbox { id } }" }), context);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ data: { inbox: [] } });
    expect(res.headers?.["x-request-id"]).toBe("apigw-req-1");
    const query = ddb.commandCalls(QueryCommand)[0]!.args[0].input;
    expect(query).toMatchObject({ TableName: "receipts-table", IndexName: "GSI2", ExpressionAttributeValues: { ":pk": "INBOX#cognito-user-1" } });
  });

  it("starts an upload with a presigned S3 POST for that user's folder", async () => {
    ddb.reset();
    ddb.on(PutCommand).resolves({});
    const res = await apiHandler(httpEvent("POST", "/api/uploads", { fileName: "fuel.jpg", contentType: "image/jpeg", size: 2048 }), context);
    expect(res.statusCode).toBe(201);
    const { upload } = JSON.parse(res.body) as { upload: { url: string; fields: Record<string, string> } };
    expect(upload.url).toContain("receipts-bucket");
    expect(upload.fields.key).toMatch(/^uploads\/cognito-user-1\/[0-9a-f-]{36}\/fuel\.jpg$/);
    expect(upload.fields.Policy).toBeTruthy();
  });
});

describe("process Lambda", () => {
  it("reads a new upload from its S3 event and stores what Textract found", async () => {
    const id = "22222222-2222-2222-2222-222222222222";
    const key = `uploads/cognito-user-1/${id}/my+receipt.jpg`;
    const stored = toItem(
      {
        userId: "cognito-user-1",
        id,
        status: "UPLOADING",
        fileName: "my receipt.jpg",
        contentType: "image/jpeg",
        objectKey: key.replace("+", " "),
        vendor: null,
        date: null,
        totalCents: null,
        gstCents: null,
        category: "OTHER",
        notes: "",
        extraction: null,
        error: null,
        createdAt: "2026-10-04T01:00:00.000Z",
        updatedAt: "2026-10-04T01:00:00.000Z",
      },
      1,
    );
    ddb.reset();
    ddb.on(GetCommand).resolvesOnce({ Item: stored }).resolves({ Item: { ...stored, status: "PROCESSING", version: 2 } });
    ddb.on(PutCommand).resolves({});
    s3.reset();
    s3.on(GetObjectCommand).resolves({ Body: { transformToByteArray: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]) } as never });
    textract.reset();
    const f = (type: string, text: string) => ({ Type: { Text: type, Confidence: 99 }, ValueDetection: { Text: text, Confidence: 97 } });
    textract.on(AnalyzeExpenseCommand).resolves({ ExpenseDocuments: [{ SummaryFields: [f("VENDOR_NAME", "Harbourside Fuel"), f("TOTAL", "$80.50"), f("TAX", "$10.50")] }] });

    // S3 URL-encodes keys in events, with spaces as "+".
    await processHandler({ Records: [{ s3: { bucket: { name: "receipts-bucket" }, object: { key: encodeURIComponent(key.replace("+", " ")).replace(/%2F/g, "/").replace(/%20/g, "+") } } }] } as S3Event, context);

    expect(s3.commandCalls(GetObjectCommand)[0]!.args[0].input).toEqual({ Bucket: "receipts-bucket", Key: `uploads/cognito-user-1/${id}/my receipt.jpg` });
    const finalPut = ddb.commandCalls(PutCommand).at(-1)!.args[0].input.Item!;
    expect(finalPut).toMatchObject({ status: "NEEDS_REVIEW", vendor: "Harbourside Fuel", totalCents: 8050, gstCents: 1050, GSI2PK: "INBOX#cognito-user-1" });
  });
});
