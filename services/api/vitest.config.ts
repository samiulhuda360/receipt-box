import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // graphql 16 ships both a CommonJS and an ES module build. Yoga (loaded by Node) gets the CommonJS
    // one; without this alias our resolvers would get the other, and Yoga's `instanceof GraphQLError`
    // would fail and mask every error. The Lambda bundle (esbuild) has a single copy anyway.
    alias: [{ find: /^graphql$/, replacement: "graphql/index.js" }],
  },
  test: {
    env: {
      POWERTOOLS_LOG_LEVEL: "SILENT",
      POWERTOOLS_TRACE_ENABLED: "false",
      AWS_REGION: "ap-southeast-2",
      // Dummy credentials: presigning is done locally and nothing is sent to AWS.
      AWS_ACCESS_KEY_ID: "test",
      AWS_SECRET_ACCESS_KEY: "test",
    },
  },
});
