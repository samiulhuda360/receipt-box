/**
 * The GraphQL schema, shared by the API (resolvers) and the web app (typed operations via codegen).
 * Money is integer cents (NZD); dates are ISO yyyy-mm-dd strings.
 */
export const typeDefs = /* GraphQL */ `
  enum ReceiptStatus {
    "Waiting for the browser to finish uploading"
    UPLOADING
    "Uploaded; the text is being read"
    PROCESSING
    "Read; a person should check the fields"
    NEEDS_REVIEW
    "Checked by a person; counts in totals and exports"
    REVIEWED
    "Could not be read; the user can enter it by hand"
    FAILED
  }

  enum Category {
    VEHICLE
    OFFICE
    SOFTWARE
    PHONE_INTERNET
    TRAVEL
    MEALS
    TOOLS
    PROFESSIONAL
    OTHER
  }

  "A value read from the receipt image, with how sure the reader was (0-1)"
  type ExtractedField {
    value: String!
    confidence: Float!
  }

  type Extraction {
    "Which reader produced it: textract (AWS) or tesseract (local)"
    engine: String!
    ms: Int!
    vendor: ExtractedField
    date: ExtractedField
    total: ExtractedField
    gst: ExtractedField
  }

  type Receipt {
    id: ID!
    status: ReceiptStatus!
    fileName: String!
    vendor: String
    date: String
    totalCents: Int
    gstCents: Int
    category: Category!
    notes: String!
    "A short-lived signed link to the image"
    imageUrl: String
    extraction: Extraction
    error: String
    createdAt: String!
    updatedAt: String!
  }

  type CategoryTotal {
    category: Category!
    count: Int!
    totalCents: Int!
    gstCents: Int!
  }

  "Totals for reviewed receipts dated inside the period"
  type Summary {
    from: String!
    to: String!
    count: Int!
    totalCents: Int!
    gstCents: Int!
    byCategory: [CategoryTotal!]!
  }

  input ReceiptInput {
    vendor: String!
    date: String!
    totalCents: Int!
    gstCents: Int!
    category: Category!
    notes: String
  }

  type Query {
    "Reviewed receipts dated between from and to (inclusive), newest first"
    receipts(from: String!, to: String!): [Receipt!]!
    "Everything not yet reviewed: uploading, processing, needs review, failed. Newest first."
    inbox: [Receipt!]!
    receipt(id: ID!): Receipt
    summary(from: String!, to: String!): Summary!
  }

  type Mutation {
    "Save the checked values; the receipt becomes REVIEWED"
    saveReceipt(id: ID!, input: ReceiptInput!): Receipt!
    deleteReceipt(id: ID!): Boolean!
  }
`;
