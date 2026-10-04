import { graphql } from "./gql";

// Every operation the app sends. `npm run codegen` turns each into a typed document, so results and
// variables are checked against the schema at compile time.

export const ReceiptFields = graphql(`
  fragment ReceiptFields on Receipt {
    id
    status
    fileName
    vendor
    date
    totalCents
    gstCents
    category
    notes
    imageUrl
    error
    createdAt
    updatedAt
    extraction {
      engine
      ms
      vendor { value confidence }
      date { value confidence }
      total { value confidence }
      gst { value confidence }
    }
  }
`);

export const InboxQuery = graphql(`
  query Inbox {
    inbox { ...ReceiptFields }
  }
`);

export const ReceiptsQuery = graphql(`
  query Receipts($from: String!, $to: String!) {
    receipts(from: $from, to: $to) { ...ReceiptFields }
  }
`);

export const ReceiptQuery = graphql(`
  query Receipt($id: ID!) {
    receipt(id: $id) { ...ReceiptFields }
  }
`);

export const SummaryQuery = graphql(`
  query Summary($from: String!, $to: String!) {
    summary(from: $from, to: $to) {
      from
      to
      count
      totalCents
      gstCents
      byCategory { category count totalCents gstCents }
    }
  }
`);

export const SaveReceiptMutation = graphql(`
  mutation SaveReceipt($id: ID!, $input: ReceiptInput!) {
    saveReceipt(id: $id, input: $input) { ...ReceiptFields }
  }
`);

export const DeleteReceiptMutation = graphql(`
  mutation DeleteReceipt($id: ID!) {
    deleteReceipt(id: $id)
  }
`);
