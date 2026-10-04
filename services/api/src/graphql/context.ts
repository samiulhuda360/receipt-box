import type { Logger } from "@aws-lambda-powertools/logger";

import type { BlobStore, ReceiptRepo } from "../domain";

/** Built once per request: who is asking (from the verified JWT) and what they can reach. */
export type Context = {
  userId: string;
  repo: ReceiptRepo;
  blobs: BlobStore;
  log: Logger;
};
