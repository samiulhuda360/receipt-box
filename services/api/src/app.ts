import { randomUUID } from "node:crypto";

import type { Logger } from "@aws-lambda-powertools/logger";
import { isValidIsoDate, MAX_UPLOAD_BYTES, receiptsToCsv, typeDefs, uploadRequestSchema } from "@receipt-box/shared";
import { createSchema, createYoga } from "graphql-yoga";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";

import { type BlobStore, objectKey, type ReceiptRecord, type ReceiptRepo } from "./domain";
import type { Context } from "./graphql/context";
import { resolvers } from "./graphql/resolvers";

export type AppDeps = {
  repo: ReceiptRepo;
  blobs: BlobStore;
  log: Logger;
  /** "jwt": the user comes from claims API Gateway already verified. "dev": from a header, local only. */
  authMode: "jwt" | "dev";
};

type JwtEvent = { requestContext?: { requestId?: string; authorizer?: { jwt?: { claims?: Record<string, unknown> } } } };
type Env = {
  Bindings: { event?: JwtEvent };
  Variables: { userId: string; log: Logger; requestId: string };
};

/**
 * One small HTTP app for both APIs, deployed as a single Lambda behind API Gateway and run as-is
 * by the local server:
 *   POST /graphql            receipts, inbox, summary, save, delete (GraphQL)
 *   POST /api/uploads        start an upload: returns a presigned S3 form (REST)
 *   GET  /api/export.csv     GST-ready CSV for a period (REST: a file download, not a graph query)
 *   POST /api/telemetry      browser errors, logged next to the API logs
 */
export function createApp(deps: AppDeps) {
  const yoga = createYoga<Context>({
    schema: createSchema<Context>({ typeDefs, resolvers: resolvers as never }),
    graphqlEndpoint: "/graphql",
    graphiql: deps.authMode === "dev",
    landingPage: false,
    maskedErrors: { isDev: deps.authMode === "dev" },
    logging: false,
  });

  const app = new Hono<Env>();

  // Correlation id: API Gateway's request id (or a fresh one), on every log line and in the response.
  app.use(async (c, next) => {
    const requestId = c.env?.event?.requestContext?.requestId ?? c.req.header("x-request-id") ?? randomUUID();
    c.set("requestId", requestId);
    c.set("log", deps.log.createChild({ persistentKeys: { correlation_id: requestId, path: c.req.path } }));
    await next();
    // Set after the handler: GraphQL returns its own Response object, which c.header() wouldn't reach.
    c.res.headers.set("x-request-id", requestId);
  });

  app.onError((err, c) => {
    c.get("log").error("unhandled error", { error: err });
    return c.json({ error: "Something went wrong.", requestId: c.get("requestId") }, 500);
  });

  const auth = createMiddleware<Env>(async (c, next) => {
    const sub = deps.authMode === "jwt" ? c.env?.event?.requestContext?.authorizer?.jwt?.claims?.sub : (c.req.header("x-dev-user") ?? "demo");
    if (typeof sub !== "string" || !sub) return c.json({ error: "Please sign in." }, 401);
    c.set("userId", sub);
    c.set("log", c.get("log").createChild({ persistentKeys: { user: sub } }));
    await next();
  });

  app.get("/health", (c) => c.json({ ok: true }));
  app.use("/api/*", auth);
  app.use("/graphql", auth);

  app.post("/api/uploads", async (c) => {
    const body = uploadRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Bad request" }, 400);
    const userId = c.get("userId");
    const id = randomUUID();
    const now = new Date().toISOString();
    const record: ReceiptRecord = {
      userId,
      id,
      status: "UPLOADING",
      fileName: body.data.fileName,
      contentType: body.data.contentType,
      objectKey: objectKey(userId, id, body.data.fileName),
      vendor: null,
      date: null,
      totalCents: null,
      gstCents: null,
      category: "OTHER",
      notes: "",
      extraction: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    await deps.repo.create(record);
    const upload = await deps.blobs.createUpload(record.objectKey, record.contentType, MAX_UPLOAD_BYTES);
    c.get("log").info("upload started", { receiptId: id, contentType: record.contentType, size: body.data.size });
    return c.json({ receiptId: id, upload }, 201);
  });

  app.get("/api/export.csv", async (c) => {
    const from = c.req.query("from") ?? "";
    const to = c.req.query("to") ?? "";
    if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to) return c.json({ error: "Use ?from=yyyy-mm-dd&to=yyyy-mm-dd" }, 400);
    const rows = await deps.repo.listReviewed(c.get("userId"), from, to);
    c.get("log").info("export", { from, to, rows: rows.length });
    return c.body(receiptsToCsv(rows), 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="receipts-${from}-to-${to}.csv"`,
    });
  });

  app.post("/api/telemetry", bodyLimit({ maxSize: 16 * 1024 }), async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const text = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
    c.get("log").error("browser error", {
      source: "web",
      message: text(body.message, 500),
      stack: text(body.stack, 4000),
      url: text(body.url, 300),
      receiptId: text(body.receiptId, 40),
      clientRequestId: text(body.requestId, 60),
    });
    return c.body(null, 204);
  });

  app.on(["GET", "POST"], "/graphql", (c) =>
    yoga.fetch(c.req.raw, { userId: c.get("userId"), repo: deps.repo, blobs: deps.blobs, log: c.get("log") }),
  );

  return app;
}
