import { DeleteObjectCommand, GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { BlobStore } from "../domain";

const SIGNED_SECONDS = 300;

/**
 * Receipt images live in a private S3 bucket. The browser uploads straight to S3 with a presigned
 * POST, so image bytes never pass through Lambda (no 6 MB payload limit, no compute bill for uploads).
 * The POST policy pins the exact key, the content type and the size range; S3 rejects anything else.
 */
export class S3BlobStore implements BlobStore {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  async createUpload(key: string, contentType: string, maxBytes: number) {
    const { url, fields } = await createPresignedPost(this.s3, {
      Bucket: this.bucket,
      Key: key,
      Conditions: [
        ["content-length-range", 1, maxBytes],
        ["eq", "$Content-Type", contentType],
      ],
      Fields: { "Content-Type": contentType },
      Expires: SIGNED_SECONDS,
    });
    return { url, fields };
  }

  signedGetUrl(key: string) {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: SIGNED_SECONDS });
  }

  async get(key: string) {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`empty object ${key}`);
    return res.Body.transformToByteArray();
  }

  async delete(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
