# Stack guide: how every part of Receipt Box works

This guide explains each technology in the project in plain words, shows where it is used, and lists questions an interviewer is likely to ask, with answers you can give in your own words. Read it top to bottom once, then use the questions to practise out loud.

---

## 0. The 60-second pitch

> "Receipt Box is a web app for New Zealand sole traders. You photograph a receipt, the backend reads the vendor, date, total and GST, you check the values in a review screen, and you get totals and a CSV for your GST return.
>
> The front end is React with TypeScript. Server data goes through TanStack Query, and forms use react-hook-form with zod. The backend is Node.js on AWS Lambda, behind API Gateway with Cognito sign-in. It uses GraphQL for the app's data and REST for uploads and file downloads.
>
> Photos upload straight from the browser to S3 with a presigned POST. An S3 event triggers a second Lambda that reads the receipt with Textract and saves the result in DynamoDB. Everything is defined in AWS CDK. GitHub Actions runs lint, type checks, about 60 tests and Playwright end-to-end tests, then deploys through OIDC, so there are no stored AWS keys.
>
> For operations there are structured logs with a correlation ID from the browser to every Lambda, X-Ray traces, alarms on a dead-letter queue, and a runbook."

If they ask only one thing, it is usually "walk me through what happens when a user uploads a receipt". That is section 1.

---

## 1. The journey of one receipt (learn this one by heart)

1. **The user picks a photo.** The React app checks the type (JPEG/PNG) and size (10 MB) straight away. See [`UploadDropzone.tsx`](../apps/web/src/components/UploadDropzone.tsx).
2. **The app asks the API for permission to upload** with `POST /api/uploads`. The Lambda:
   - checks the request with zod;
   - creates a receipt row in DynamoDB with status `UPLOADING`;
   - returns a **presigned POST**: a URL plus form fields signed with the Lambda's AWS permissions.

   See [`app.ts`](../services/api/src/app.ts).
3. **The browser posts the photo straight to S3** with those fields, showing upload progress. The photo never passes through Lambda.
4. **S3 fires an `ObjectCreated` event**, which invokes the processor Lambda ([`process.ts`](../services/api/src/process.ts)). The processor:
   - marks the receipt `PROCESSING`;
   - downloads the photo and checks it really is a PNG or JPEG;
   - sends it to **Textract AnalyzeExpense**;
   - saves the vendor, date, total and GST with their confidence scores, and sets the status to `NEEDS_REVIEW`.
5. **Meanwhile the app polls.** TanStack Query re-fetches the inbox every 2 seconds, but only while something is uploading or processing. The row changes to "Check me" by itself.
6. **The user opens the review screen.** Each field shows how sure the reader was. Below 80%, it says "Please check".
7. **The user saves.** The GraphQL mutation `saveReceipt` validates with the *same* zod schema the form used, sets `REVIEWED`, and moves the row from the inbox index to the ledger index in DynamoDB.
8. **Totals and export.** The `summary` query adds up reviewed receipts in the chosen period. `GET /api/export.csv` returns the file.

If something fails in step 4:
- **Throttling or a 5xx error:** the error is re-thrown, so Lambda retries twice. If it still fails, the event goes to the SQS dead-letter queue and an alarm emails you.
- **An unreadable image:** the receipt becomes `FAILED`, and the user types the values in by hand.

---

## 2. React and the web app

**What React is.** A library for building UIs out of **components**: functions that take **props** (inputs) and return what should be on screen. When **state** changes, React re-renders the components that depend on it.

**Hooks used here and why.**

| Hook | What it does | Example in this project |
|---|---|---|
| `useState` | Local UI state | Drag-over highlight in the dropzone; upload progress list |
| `useMemo` | Keep the same object between renders unless inputs change | The API client in [`api.ts`](../apps/web/src/api.ts), so it isn't rebuilt every render |
| `useEffect` | Run code after render, with cleanup | Installing global error listeners in [`main.tsx`](../apps/web/src/main.tsx), removed on unmount |
| `useRef` | Hold a DOM element or value without re-rendering | The hidden file input; the delete `<dialog>` |
| `useId` | Unique, stable IDs | Linking each `<label>` and hint to its input in [`ReceiptForm.tsx`](../apps/web/src/components/ReceiptForm.tsx) |
| `useContext` | Read shared values without passing props down | Auth (`useAppAuth`) |

### TanStack Query (server state)

There are two kinds of state:
- **UI state** lives only in the browser, for example "is the dialog open".
- **Server state** lives on the server and the browser only has a copy, for example the receipts.

TanStack Query manages server state: fetching, caching, de-duplicating requests, refetching when the window regains focus, and invalidating after a change.

In [`hooks.ts`](../apps/web/src/hooks.ts):
- Each query has a **key**, such as `["receipts", from, to]`, which identifies its cached data.
- After saving a receipt, the mutation's `onSuccess` **invalidates** the inbox, receipts and summary keys, so they refetch fresh data.
- `refetchInterval` is a function: it returns 2000 ms while any receipt is busy and `false` otherwise, so the app stops polling as soon as nothing is processing.

**Why not Redux?** Most "global state" in apps like this is really server data. TanStack Query handles caching and staleness for it, which Redux makes you write by hand.

### React Router

- Routes: `/`, `/receipts/:id`, `/export`.
- **The selected period lives in the URL** (`?from=2026-04-01&to=2027-03-31`), so a view can be bookmarked or shared, and the browser back button works. See [`PeriodPicker.tsx`](../apps/web/src/components/PeriodPicker.tsx).
- The review and export pages are **lazy-loaded** with `React.lazy` and `Suspense`, so their code downloads on first visit only.

### Forms: react-hook-form + zod

- react-hook-form keeps form state without re-rendering on every keystroke.
- zod describes the valid shape of a receipt (vendor required, real date, cents are whole numbers, GST at most 3/23 of the total).
- **The same zod schema runs in the browser and in the API** (it lives in `packages/shared`). The user gets instant feedback, and the server still enforces the rules, because you can never trust the browser.
- The form uses dollars ("42.50") and the API uses cents (4250). `toInput()` converts between them and maps error names back (`totalCents` → `total`).
- If the server rejects a value, it returns `extensions.fields`, and the form shows each message next to the right input.

### Accessibility

- Every input has a real `<label for>`. Hints and errors are linked with `aria-describedby`, and invalid fields get `aria-invalid`.
- Errors use `role="alert"`, so screen readers announce them.
- The end-to-end tests run **axe** (WCAG 2 AA) on each page. It caught a real contrast problem: green text at 4.2:1, where 4.5:1 is needed. The colours were darkened.

### Performance

- The first build shipped 185 KB of gzipped JavaScript in one file.
- GraphQL operations are now generated as **plain strings**, so the browser doesn't need a GraphQL client or parser library. A 20-line `fetch` wrapper replaced it.
- Pages that most visits don't need, and the Cognito sign-in library (only used on AWS), are split into separate chunks.
- The initial download is now 136 KB gzipped.

**Likely questions**

- *"How do you decide what goes in global state?"* Server data goes in TanStack Query. URL-worthy state, like filters and periods, goes in the URL. Small shared things, like auth, go in context. Everything else stays local in the component.
- *"How do you avoid unnecessary re-renders?"* Keep state as low in the tree as possible, memoise objects passed to many children (the API client), and let react-hook-form manage inputs without re-rendering the whole form.
- *"How would you handle a slow or failing API in the UI?"* Each query has loading and error states. Mutations show field errors. An error boundary catches render crashes and reports them with the last request ID.
- *"Why polling instead of WebSockets?"* Processing takes about 2 seconds, and only while something is busy. Polling that stops by itself is simpler and cheaper than holding connections open. With many users, I'd switch to AppSync subscriptions or API Gateway WebSockets.

---

## 3. TypeScript

- **Strict mode** is on, including `noUncheckedIndexedAccess`: `array[0]` might be `undefined`, so the compiler makes you check.
- **One language front to back**, in an npm-workspaces monorepo. The `shared` package holds the GraphQL schema, money maths and validation, and both sides import it.
- **Generated types.** `npm run codegen` turns the GraphQL schema into types for the API's resolvers and the web app's queries. Rename a field in the schema and both sides stop compiling until they're fixed. CI fails if the generated files are out of date.

*"Why TypeScript?"* It catches mistakes before running the code, makes refactors safe, and documents the shape of data.

---

## 4. GraphQL

**In plain words.** The server publishes a **schema**: the types it has and how they connect. The client sends a **query** that names exactly the fields it wants, and gets back JSON in that same shape. Changes are **mutations**.

**In this project** ([`schema.ts`](../packages/shared/src/schema.ts)):

```graphql
type Query {
  inbox: [Receipt!]!                                 # receipts still to check
  receipts(from: String!, to: String!): [Receipt!]!  # checked receipts in a period
  receipt(id: ID!): Receipt
  summary(from: String!, to: String!): Summary!      # totals by category
}
type Mutation {
  saveReceipt(id: ID!, input: ReceiptInput!): Receipt!
  deleteReceipt(id: ID!): Boolean!
}
```

- `!` means "never null". `[Receipt!]!` is "a list that is always there, of receipts that are never null".
- Money is `Int` **cents**, never floats.

**Resolvers** are the functions that produce each field. See [`resolvers.ts`](../services/api/src/graphql/resolvers.ts). Each resolver gets:
- `parent`: the object above it;
- `args`: the query arguments;
- `context`: built once per request, holding **the signed-in user's ID** and the database adapter.

Access control is in the context: every repository call is scoped to `userId`, so one user can't reach another's receipts. A test proves this.

Field resolvers compute things on demand. `Receipt.imageUrl` creates a fresh 5-minute signed S3 link every time it's read, so the bucket stays private.

**Errors.** GraphQL usually returns HTTP 200 with an `errors` array. Ours carry `extensions.code` (`BAD_USER_INPUT`, `NOT_FOUND`) and `extensions.fields` (which input is wrong). Unexpected errors are **masked** as "Unexpected error" in production, so internal details don't leak.

**Codegen.** The schema produces TypeScript types for resolvers (server) and for each operation (client).

**GraphQL vs REST, and why both are used here**

| | GraphQL | REST |
|---|---|---|
| Fetching | The client asks for exactly the fields it needs, many resources in one round trip | Fixed responses per URL; may need several calls or return extra data |
| Typing | The schema is the contract; tools generate types | Needs OpenAPI to get the same |
| HTTP caching | Usually POST, so no CDN caching by default | GET URLs cache well |
| Files | Awkward for uploads and downloads | Natural |

Here, GraphQL serves the app's data. REST handles three cases:
- **Starting an upload:** it returns a signed S3 form, not data.
- **The CSV download:** it's a file with a filename.
- **Browser error reports:** a fire-and-forget POST.

Use each where it fits.

**The N+1 problem.** If a query lists 50 receipts and each one's `vendor` field triggered its own database call, that's 1 + 50 calls. The fix is **DataLoader**, which batches the 50 into one call. This schema doesn't need it, because every field comes from the same DynamoDB item; `imageUrl` signing is a local calculation, not a network call. Saying that shows you understand when the tool is needed.

**Security in GraphQL**
- Authenticate before the query runs. API Gateway checks the JWT, and the context carries the user.
- Limit query depth and cost when types reference each other in cycles (a user's friends' friends' friends…). This schema has no cycles.
- Consider turning off introspection in production.
- Rate-limit at the edge. API Gateway is throttled to 20 requests/second with bursts of 40.

**Likely questions**

- *"What is a resolver?"* A function that returns the value of one field. GraphQL calls the resolvers needed to build the requested shape.
- *"Why did you use both GraphQL and REST?"* See the table above.
- *"How do you version a GraphQL API?"* Usually you don't version it. You add fields, mark old ones `@deprecated`, and remove them when no client uses them. Codegen and CI catch breaking changes.

---

## 5. Node.js on AWS Lambda

**Lambda** runs your function when an event arrives (an HTTP request, an S3 upload) and you pay per millisecond. There are no servers to patch.

- **The handler** is the exported function Lambda calls. See [`handlers/api.ts`](../services/api/src/handlers/api.ts) and [`handlers/process.ts`](../services/api/src/handlers/process.ts).
- **Cold start.** The first request on a new container loads the code, which is slower. Keep bundles small and create AWS clients **outside** the handler, so warm requests reuse the clients and their connections. Both handlers do this.
- **One API function for all routes**, sometimes called a "lambdalith". [Hono](https://hono.dev) routes inside it. That means fewer cold starts and simpler deploys. The trade-off is one shared memory size and permission set. The processor is a separate function: it needs Textract, more memory and a longer timeout.
- **ARM (Graviton)** is about 20% cheaper per GB-second.
- **Bundling.** CDK uses esbuild to produce one file per function. The AWS SDK is bundled in, rather than relying on the copy built into Lambda, so production runs the versions that were tested.
- **The same code runs locally.** `createApp()` doesn't know whether it's on Lambda or a laptop. Storage, database and reader are passed in as adapters, a pattern called *ports and adapters*. That's why the end-to-end tests can run with no AWS account.

**Likely questions**

- *"How do you reduce cold starts?"* Smaller bundles, clients created outside the handler, fewer and bigger functions, ARM, and provisioned concurrency if it really matters.
- *"Lambda limits you know about?"* 15-minute maximum run time, 6 MB request/response payload (hence the presigned uploads), 10 GB memory, and concurrency limits per account.

---

## 6. Sign-in: Cognito, JWT and API Gateway

- **Cognito** is AWS's user directory. It hosts the sign-up and sign-in pages (the **Hosted UI**).
- The app uses **OpenID Connect (OIDC) with the authorization code flow + PKCE**:
  1. The browser goes to Cognito's sign-in page.
  2. Cognito redirects back with a one-time **code**.
  3. The app swaps the code for tokens. PKCE proves it's the same browser that started the sign-in, which is why a browser app needs **no client secret**: it couldn't keep one secret anyway.
- **Tokens.**
  - The **ID token** says who you are.
  - The **access token** is what the app sends to the API, as `Authorization: Bearer …`.
  - Both are **JWTs**: signed JSON. Anyone can read them, but nobody can change them without breaking the signature.
- **API Gateway's JWT authorizer** checks the signature, expiry and client ID **before** Lambda runs. The Lambda reads the user ID (`sub`) from the already-verified claims. Requests without a valid token never reach the code, so they cost no Lambda time.
- Locally, a demo user replaces Cognito, and the API accepts that header only in local mode.

*"Where do you store tokens in the browser?"* The OIDC library keeps them in session storage. The main risk is XSS, so the defences are a strict Content Security Policy, React's escaping and short token lifetimes (1 hour). The alternative is a backend-for-frontend that keeps tokens in httpOnly cookies.

---

## 7. S3 and presigned uploads

- S3 stores files ("objects") in a **private** bucket: public access is blocked, it's encrypted, and HTTPS is required.
- A **presigned POST** is an upload form signed with the API's permissions. Its **policy** pins:
  - the exact key: `uploads/<user>/<receipt id>/<file>`;
  - the content type;
  - the size range;
  - an expiry of 5 minutes.

  S3 itself rejects anything else.
- Policies check the *declared* type, not the actual bytes, so the processor also checks the file's first bytes, the **magic numbers** (PNG starts `89 50 4E 47`, JPEG `FF D8 FF`).
- Photos are shown with **presigned GET** links that expire after 5 minutes.

*"Why not upload through the API?"* Lambda has a 6 MB payload limit, and you'd pay for compute while bytes stream through. Direct-to-S3 is faster, cheaper and scales by itself.

---

## 8. DynamoDB: single-table design

DynamoDB is a key-value and document database. You don't write joins. You design the keys around how the app reads data.

**The three ways the app reads receipts**, and the key for each:

| Need | Key used |
|---|---|
| One receipt | `PK = USER#<user>`, `SK = RECEIPT#<id>` |
| Checked receipts in a date range | Index GSI1: `GSI1PK = USER#<user>`, `GSI1SK = DATE#<date>#<id>` (query with `BETWEEN`) |
| The "to check" inbox | Index GSI2: `GSI2PK = INBOX#<user>`, `GSI2SK = <createdAt>` |

- **Sparse indexes.** A receipt gets GSI1 keys only once it's `REVIEWED`, and GSI2 keys only until then. Each query reads exactly the rows it shows, with nothing filtered out afterwards and no wasted read capacity. See [`repo/dynamo.ts`](../services/api/src/repo/dynamo.ts).
- **Optimistic locking.** Each item has a `version` number. An update only succeeds if the version hasn't changed since it was read (`ConditionExpression`). If it has, the code re-reads and tries again. Two concurrent writes can't silently overwrite each other.
- **TTL.** Abandoned uploads (`UPLOADING` for 24 hours) are deleted automatically by setting `expiresAt`.
- **On-demand billing** means you pay per request. That suits spiky, small workloads.
- **Point-in-time recovery** is on, so the table can be restored to any second in the last 35 days.

*"When would you choose SQL instead?"* When the access patterns are unknown or change often, for ad-hoc reporting, or when you need joins and multi-row transactions. DynamoDB wins when access patterns are known and scale or predictable latency matter.

---

## 9. Async processing, retries and the dead-letter queue

- S3 invokes the processor **asynchronously**. Lambda retries a failed invocation **twice**. After that, the event goes to an **SQS dead-letter queue (DLQ)**, and an alarm fires when the queue isn't empty.
- **Idempotency.** S3 can deliver the same event more than once, so the processor only proceeds if the receipt is still `UPLOADING` or `PROCESSING`. A second delivery is skipped.
- **Not every error deserves a retry.**
  - Throttling, timeouts and 5xx errors are *transient*: re-throw so Lambda retries.
  - A bad image fails the same way every time, so mark it `FAILED` and let the person type it in.
- **Textract AnalyzeExpense** is a managed model trained on receipts and invoices. It returns typed fields with confidences. Locally, **Tesseract** (open-source OCR) plus simple rules does the same job. [`eval/run.ts`](../services/api/eval/run.ts) measures it on 30 synthetic receipts.

---

## 10. CloudFront

- **One domain for everything.** `/` serves the React app from S3, and `/graphql` and `/api/*` forward to API Gateway. The browser only talks to one origin, so there's **no CORS**: no preflight `OPTIONS` requests, and no CORS misconfiguration to debug.
- **SPA routing.** A tiny CloudFront Function rewrites paths with no file extension (`/receipts/123`) to `/index.html`, so refreshing a deep link works. It doesn't rewrite API paths.
- **Security headers.** A managed policy adds HSTS, `X-Content-Type-Options`, `X-Frame-Options` and a referrer policy.

---

## 11. Infrastructure as code: AWS CDK

- CDK lets you define AWS resources in TypeScript. `cdk synth` turns it into a CloudFormation template, and `cdk deploy` applies it.
- **Constructs** are building blocks: `new dynamodb.TableV2(...)`, `new nodejs.NodejsFunction(...)`. The whole stack is in [`receipt-box-stack.ts`](../infra/lib/receipt-box-stack.ts).
- **Least privilege.** Each function gets only what it needs:
  - the API can put, get and delete objects under `uploads/*`;
  - the processor can only get objects, plus call Textract.

  A test checks this.
- **Assertion tests** ([`stack.test.ts`](../infra/test/stack.test.ts)) check the generated template: buckets are private, the table has backups, every route except `/health` needs a token, the alarms exist, and the deploy role trusts only the main branch.
- **A real problem solved.** The receipts bucket's CORS rule needs the CloudFront domain. CloudFront depends on the API, and the API function needed the bucket's name. That's a **dependency cycle**. The fix: give the bucket a fixed, computed name and grant permissions by ARN, so the functions no longer depend on the bucket resource.

---

## 12. CI/CD: GitHub Actions

[`ci.yml`](../.github/workflows/ci.yml) has three jobs:
1. **check.**
   - codegen up to date;
   - ESLint;
   - TypeScript;
   - unit and integration tests;
   - production build;
   - `cdk synth`, which bundles the Lambdas for real.
2. **e2e.** Playwright starts the API and the web app, uploads a real receipt image and checks the full journey, including accessibility.
3. **deploy.** Runs only on `main`, only if 1 and 2 pass, and only after you've configured AWS.
   - **No AWS keys in GitHub.** GitHub signs a short-lived **OIDC token** for the run. AWS trusts that token only for this repository's main branch and exchanges it for temporary credentials. The role can only hand over to CDK's deploy roles.
   - After deploying, a **smoke test** checks that the site loads and that the API refuses a request with no token (401).

*"What would you add for a team?"* Preview environments per pull request (a separate stack per branch), a manual approval before production, and database migration steps.

---

## 13. Monitoring and logging: how to troubleshoot an integration

**What's in place**

- **Structured logs** (JSON) from AWS Lambda Powertools. Every log line has `correlation_id`, which is API Gateway's request ID, plus `user` and `receiptId` where relevant.
- **The correlation ID is returned to the browser** as `x-request-id`. When the browser reports an error, it sends the last request ID with it, so a user's error report leads straight to the server logs.
- **X-Ray tracing** shows time spent in each AWS call: DynamoDB, S3, Textract.
- **Custom metrics** (`ReceiptsRead`, `ReceiptsUnreadable`) are written as log lines in a format CloudWatch turns into metrics. No extra API calls are needed.
- **Alarms** (sent to email):
  - anything in the DLQ;
  - processor errors;
  - API function errors;
  - API 5xx responses;
  - p95 latency over 3 s.
- **A dashboard and a $5 budget alert.**
- **A runbook** ([`runbook.md`](runbook.md)) with the exact queries.

**Answering "a user says their upload is stuck"**

1. Get the receipt ID (from the URL), or the request ID from the browser's network tab or the error report.
2. CloudWatch Logs Insights, across both functions: `filter receiptId = "<id>" | sort @timestamp`. You see `upload started` → `receipt read` (or the error).
3. **No processor log at all?**
   - Did the upload reach S3? Check the object exists.
   - Is the S3 event notification set up for the `uploads/` prefix?
4. **Error logged?**
   - Transient: it was retried and may be in the DLQ, so check the queue. Once the cause is fixed, redrive it.
   - Permanent: the receipt is `FAILED`, and the user can enter it by hand.
5. Check the X-Ray trace for slow or failing AWS calls.

---

## 14. Testing strategy

| Layer | Tool | What it proves | Count |
|---|---|---|---|
| Unit | Vitest | Money maths, dates, validation, OCR parsing rules, Textract mapping | ~25 |
| Integration | Vitest + aws-sdk-client-mock | The whole API flow in-process; DynamoDB keys and locking; Lambda handlers with real API Gateway and S3 event shapes | ~20 |
| Component | Testing Library | The form, uploads and lists behave like a user expects | 12 |
| Infrastructure | CDK assertions | Security and reliability settings in the template | 12 |
| End-to-end | Playwright + axe | The real app, real OCR, the full journey, accessibility | 3 |

Most tests are fast unit and integration tests; a few slow end-to-end tests cover the main journey (the "test pyramid").

---

## 15. Stories to tell (STAR: situation, task, action, result)

**1. The masked GraphQL errors.**
- **Situation:** In tests, every validation error came back as "Unexpected error".
- **Task:** Find out why the right message wasn't getting through.
- **Action:** I checked for duplicate `graphql` installs and found only one. So I looked at *how* it was loaded. The package ships both a CommonJS and an ES module build. Yoga loaded one and my resolvers the other, so Yoga's `instanceof GraphQLError` check failed. I pinned one build in the test config.
- **Result:** Errors came through. The lesson: the "dual package hazard" is real, and production was fine because the bundler includes a single copy.

**2. A bad file crashed the server.**
- **Situation:** An end-to-end test uploaded a file that wasn't really an image, and the API died.
- **Action:** I reproduced it in isolation: the OCR library throws from a worker thread, outside any promise. I added an error handler, and I made the processor check each file's magic numbers before reading it.
- **Result:** A bad file now fails one receipt politely instead of taking the service down. Validating what the client claims applies twice here: S3 checks the declared type, and the processor checks the real content.

**3. Accessibility caught by a test.**
- **Situation:** The axe scan failed on colour contrast.
- **Action:** I calculated the ratios (4.2:1 against the 4.5:1 minimum), then split the colours into one darker green for text and a brighter green for decoration only.
- **Result:** The scan passes, and the scan runs in CI, so it stays passing.

**4. Bundle size.**
- **Situation:** 185 KB of gzipped JavaScript on first load.
- **Action:** I generated GraphQL operations as strings and replaced the client library with a small `fetch` wrapper, then lazy-loaded the secondary pages and the Cognito library.
- **Result:** 136 KB, measured before and after.

**5. A CDK dependency cycle.** See section 11. It shows you can read infrastructure errors and reason about dependencies.

---

## 16. Questions to ask them

- How is the React app deployed today, and how long from merge to production?
- How do front-end and back-end engineers agree on API changes: GraphQL schema reviews, OpenAPI, contract tests?
- What does on-call or incident response look like, and what monitoring do you rely on most?
- What's the biggest technical debt in the web app right now?
- How do you test: what's the split between unit, integration and end-to-end?

---

## Glossary

| Term | Meaning |
|---|---|
| **Correlation ID** | One ID that follows a request through every service, so logs can be joined up |
| **DLQ** | Dead-letter queue: where messages go after they've failed too many times |
| **GSI** | Global secondary index: another key layout DynamoDB keeps in sync, for a different query |
| **Idempotent** | Doing it twice has the same effect as doing it once |
| **IaC** | Infrastructure as code: servers, databases and permissions defined in files and reviewed like code |
| **JWT** | JSON Web Token: signed JSON that proves who the user is |
| **OIDC** | OpenID Connect: the standard for "sign in with…" built on OAuth 2 |
| **PKCE** | Proof Key for Code Exchange: lets a public app (a browser) use the code flow safely without a secret |
| **Presigned URL/POST** | A link or form signed with someone's AWS permissions that works without credentials, for a short time |
| **Sparse index** | An index that only contains items that have its key attributes |
