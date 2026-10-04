/* eslint-disable */
import * as types from './graphql';



/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  fragment ReceiptFields on Receipt {\n    id\n    status\n    fileName\n    vendor\n    date\n    totalCents\n    gstCents\n    category\n    notes\n    imageUrl\n    error\n    createdAt\n    updatedAt\n    extraction {\n      engine\n      ms\n      vendor { value confidence }\n      date { value confidence }\n      total { value confidence }\n      gst { value confidence }\n    }\n  }\n": typeof types.ReceiptFieldsFragmentDoc,
    "\n  query Inbox {\n    inbox { ...ReceiptFields }\n  }\n": typeof types.InboxDocument,
    "\n  query Receipts($from: String!, $to: String!) {\n    receipts(from: $from, to: $to) { ...ReceiptFields }\n  }\n": typeof types.ReceiptsDocument,
    "\n  query Receipt($id: ID!) {\n    receipt(id: $id) { ...ReceiptFields }\n  }\n": typeof types.ReceiptDocument,
    "\n  query Summary($from: String!, $to: String!) {\n    summary(from: $from, to: $to) {\n      from\n      to\n      count\n      totalCents\n      gstCents\n      byCategory { category count totalCents gstCents }\n    }\n  }\n": typeof types.SummaryDocument,
    "\n  mutation SaveReceipt($id: ID!, $input: ReceiptInput!) {\n    saveReceipt(id: $id, input: $input) { ...ReceiptFields }\n  }\n": typeof types.SaveReceiptDocument,
    "\n  mutation DeleteReceipt($id: ID!) {\n    deleteReceipt(id: $id)\n  }\n": typeof types.DeleteReceiptDocument,
};
const documents: Documents = {
    "\n  fragment ReceiptFields on Receipt {\n    id\n    status\n    fileName\n    vendor\n    date\n    totalCents\n    gstCents\n    category\n    notes\n    imageUrl\n    error\n    createdAt\n    updatedAt\n    extraction {\n      engine\n      ms\n      vendor { value confidence }\n      date { value confidence }\n      total { value confidence }\n      gst { value confidence }\n    }\n  }\n": types.ReceiptFieldsFragmentDoc,
    "\n  query Inbox {\n    inbox { ...ReceiptFields }\n  }\n": types.InboxDocument,
    "\n  query Receipts($from: String!, $to: String!) {\n    receipts(from: $from, to: $to) { ...ReceiptFields }\n  }\n": types.ReceiptsDocument,
    "\n  query Receipt($id: ID!) {\n    receipt(id: $id) { ...ReceiptFields }\n  }\n": types.ReceiptDocument,
    "\n  query Summary($from: String!, $to: String!) {\n    summary(from: $from, to: $to) {\n      from\n      to\n      count\n      totalCents\n      gstCents\n      byCategory { category count totalCents gstCents }\n    }\n  }\n": types.SummaryDocument,
    "\n  mutation SaveReceipt($id: ID!, $input: ReceiptInput!) {\n    saveReceipt(id: $id, input: $input) { ...ReceiptFields }\n  }\n": types.SaveReceiptDocument,
    "\n  mutation DeleteReceipt($id: ID!) {\n    deleteReceipt(id: $id)\n  }\n": types.DeleteReceiptDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment ReceiptFields on Receipt {\n    id\n    status\n    fileName\n    vendor\n    date\n    totalCents\n    gstCents\n    category\n    notes\n    imageUrl\n    error\n    createdAt\n    updatedAt\n    extraction {\n      engine\n      ms\n      vendor { value confidence }\n      date { value confidence }\n      total { value confidence }\n      gst { value confidence }\n    }\n  }\n"): typeof import('./graphql').ReceiptFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Inbox {\n    inbox { ...ReceiptFields }\n  }\n"): typeof import('./graphql').InboxDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Receipts($from: String!, $to: String!) {\n    receipts(from: $from, to: $to) { ...ReceiptFields }\n  }\n"): typeof import('./graphql').ReceiptsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Receipt($id: ID!) {\n    receipt(id: $id) { ...ReceiptFields }\n  }\n"): typeof import('./graphql').ReceiptDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Summary($from: String!, $to: String!) {\n    summary(from: $from, to: $to) {\n      from\n      to\n      count\n      totalCents\n      gstCents\n      byCategory { category count totalCents gstCents }\n    }\n  }\n"): typeof import('./graphql').SummaryDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SaveReceipt($id: ID!, $input: ReceiptInput!) {\n    saveReceipt(id: $id, input: $input) { ...ReceiptFields }\n  }\n"): typeof import('./graphql').SaveReceiptDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteReceipt($id: ID!) {\n    deleteReceipt(id: $id)\n  }\n"): typeof import('./graphql').DeleteReceiptDocument;


export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}
