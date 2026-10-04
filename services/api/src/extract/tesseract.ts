import { createWorker, type Worker } from "tesseract.js";

import type { Extractor } from "../domain";
import { parseReceiptText } from "./parse";

/**
 * Local OCR with Tesseract (WebAssembly, no AWS account needed). The language model downloads on
 * first use and is cached under the data folder. Slower and less accurate than Textract on real
 * photos, which the evaluation in eval/ measures.
 */
export class TesseractExtractor implements Extractor {
  readonly engine = "tesseract";
  private worker?: Promise<Worker>;

  constructor(private readonly cachePath: string) {}

  private getWorker() {
    // Without an errorHandler, tesseract.js throws worker errors outside any promise and kills the process.
    this.worker ??= createWorker("eng", undefined, { cachePath: this.cachePath, errorHandler: () => {} });
    return this.worker;
  }

  async extract(image: Uint8Array) {
    const started = Date.now();
    const worker = await this.getWorker();
    const { data } = await worker.recognize(Buffer.from(image));
    return { engine: this.engine, ms: Date.now() - started, ...parseReceiptText(data.text, Math.min(1, data.confidence / 90)) };
  }

  async close() {
    if (this.worker) await (await this.worker).terminate();
  }
}
