import type { CodegenConfig } from "@graphql-codegen/cli";

/**
 * One schema (packages/shared/src/schema.ts) -> types for both sides:
 *  - the API's resolvers (typed parent, args, context and return values)
 *  - the web app's operations (each query/mutation gets exact result and variable types)
 * CI runs `npm run codegen` and fails if the generated files are out of date.
 */
const config: CodegenConfig = {
  schema: "packages/shared/src/schema.ts",
  documents: ["apps/web/src/**/*.{ts,tsx}", "!apps/web/src/gql/**/*"],
  ignoreNoDocuments: true,
  generates: {
    "services/api/src/generated/graphql.ts": {
      plugins: ["typescript", "typescript-resolvers"],
      config: {
        contextType: "../graphql/context#Context",
        mappers: { Receipt: "../domain#ReceiptRecord" },
        enumsAsTypes: true,
        useTypeImports: true,
        avoidOptionals: { field: true, inputValue: false },
      },
    },
    "apps/web/src/gql/": {
      preset: "client",
      // Operations become plain strings, so the browser never needs a GraphQL parser (graphql-js).
      config: { documentMode: "string", enumsAsTypes: true, useTypeImports: true },
      presetConfig: { fragmentMasking: false },
    },
  },
};

export default config;
