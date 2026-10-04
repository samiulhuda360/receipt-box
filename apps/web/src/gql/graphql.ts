/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export type Category =
  | 'MEALS'
  | 'OFFICE'
  | 'OTHER'
  | 'PHONE_INTERNET'
  | 'PROFESSIONAL'
  | 'SOFTWARE'
  | 'TOOLS'
  | 'TRAVEL'
  | 'VEHICLE';

export type ReceiptInput = {
  category: Category;
  date: string;
  gstCents: number;
  notes?: string | null | undefined;
  totalCents: number;
  vendor: string;
};

export type ReceiptStatus =
  /** Could not be read; the user can enter it by hand */
  | 'FAILED'
  /** Read; a person should check the fields */
  | 'NEEDS_REVIEW'
  /** Uploaded; the text is being read */
  | 'PROCESSING'
  /** Checked by a person; counts in totals and exports */
  | 'REVIEWED'
  /** Waiting for the browser to finish uploading */
  | 'UPLOADING';

export type ReceiptFieldsFragment = { id: string, status: ReceiptStatus, fileName: string, vendor: string | null, date: string | null, totalCents: number | null, gstCents: number | null, category: Category, notes: string, imageUrl: string | null, error: string | null, createdAt: string, updatedAt: string, extraction: { engine: string, ms: number, vendor: { value: string, confidence: number } | null, date: { value: string, confidence: number } | null, total: { value: string, confidence: number } | null, gst: { value: string, confidence: number } | null } | null };

export type InboxQueryVariables = Exact<{ [key: string]: never; }>;


export type InboxQuery = { inbox: Array<{ id: string, status: ReceiptStatus, fileName: string, vendor: string | null, date: string | null, totalCents: number | null, gstCents: number | null, category: Category, notes: string, imageUrl: string | null, error: string | null, createdAt: string, updatedAt: string, extraction: { engine: string, ms: number, vendor: { value: string, confidence: number } | null, date: { value: string, confidence: number } | null, total: { value: string, confidence: number } | null, gst: { value: string, confidence: number } | null } | null }> };

export type ReceiptsQueryVariables = Exact<{
  from: string;
  to: string;
}>;


export type ReceiptsQuery = { receipts: Array<{ id: string, status: ReceiptStatus, fileName: string, vendor: string | null, date: string | null, totalCents: number | null, gstCents: number | null, category: Category, notes: string, imageUrl: string | null, error: string | null, createdAt: string, updatedAt: string, extraction: { engine: string, ms: number, vendor: { value: string, confidence: number } | null, date: { value: string, confidence: number } | null, total: { value: string, confidence: number } | null, gst: { value: string, confidence: number } | null } | null }> };

export type ReceiptQueryVariables = Exact<{
  id: string | number;
}>;


export type ReceiptQuery = { receipt: { id: string, status: ReceiptStatus, fileName: string, vendor: string | null, date: string | null, totalCents: number | null, gstCents: number | null, category: Category, notes: string, imageUrl: string | null, error: string | null, createdAt: string, updatedAt: string, extraction: { engine: string, ms: number, vendor: { value: string, confidence: number } | null, date: { value: string, confidence: number } | null, total: { value: string, confidence: number } | null, gst: { value: string, confidence: number } | null } | null } | null };

export type SummaryQueryVariables = Exact<{
  from: string;
  to: string;
}>;


export type SummaryQuery = { summary: { from: string, to: string, count: number, totalCents: number, gstCents: number, byCategory: Array<{ category: Category, count: number, totalCents: number, gstCents: number }> } };

export type SaveReceiptMutationVariables = Exact<{
  id: string | number;
  input: ReceiptInput;
}>;


export type SaveReceiptMutation = { saveReceipt: { id: string, status: ReceiptStatus, fileName: string, vendor: string | null, date: string | null, totalCents: number | null, gstCents: number | null, category: Category, notes: string, imageUrl: string | null, error: string | null, createdAt: string, updatedAt: string, extraction: { engine: string, ms: number, vendor: { value: string, confidence: number } | null, date: { value: string, confidence: number } | null, total: { value: string, confidence: number } | null, gst: { value: string, confidence: number } | null } | null } };

export type DeleteReceiptMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteReceiptMutation = { deleteReceipt: boolean };

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}
export const ReceiptFieldsFragmentDoc = new TypedDocumentString(`
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
    vendor {
      value
      confidence
    }
    date {
      value
      confidence
    }
    total {
      value
      confidence
    }
    gst {
      value
      confidence
    }
  }
}
    `, {"fragmentName":"ReceiptFields"}) as unknown as TypedDocumentString<ReceiptFieldsFragment, unknown>;
export const InboxDocument = new TypedDocumentString(`
    query Inbox {
  inbox {
    ...ReceiptFields
  }
}
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
    vendor {
      value
      confidence
    }
    date {
      value
      confidence
    }
    total {
      value
      confidence
    }
    gst {
      value
      confidence
    }
  }
}`) as unknown as TypedDocumentString<InboxQuery, InboxQueryVariables>;
export const ReceiptsDocument = new TypedDocumentString(`
    query Receipts($from: String!, $to: String!) {
  receipts(from: $from, to: $to) {
    ...ReceiptFields
  }
}
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
    vendor {
      value
      confidence
    }
    date {
      value
      confidence
    }
    total {
      value
      confidence
    }
    gst {
      value
      confidence
    }
  }
}`) as unknown as TypedDocumentString<ReceiptsQuery, ReceiptsQueryVariables>;
export const ReceiptDocument = new TypedDocumentString(`
    query Receipt($id: ID!) {
  receipt(id: $id) {
    ...ReceiptFields
  }
}
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
    vendor {
      value
      confidence
    }
    date {
      value
      confidence
    }
    total {
      value
      confidence
    }
    gst {
      value
      confidence
    }
  }
}`) as unknown as TypedDocumentString<ReceiptQuery, ReceiptQueryVariables>;
export const SummaryDocument = new TypedDocumentString(`
    query Summary($from: String!, $to: String!) {
  summary(from: $from, to: $to) {
    from
    to
    count
    totalCents
    gstCents
    byCategory {
      category
      count
      totalCents
      gstCents
    }
  }
}
    `) as unknown as TypedDocumentString<SummaryQuery, SummaryQueryVariables>;
export const SaveReceiptDocument = new TypedDocumentString(`
    mutation SaveReceipt($id: ID!, $input: ReceiptInput!) {
  saveReceipt(id: $id, input: $input) {
    ...ReceiptFields
  }
}
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
    vendor {
      value
      confidence
    }
    date {
      value
      confidence
    }
    total {
      value
      confidence
    }
    gst {
      value
      confidence
    }
  }
}`) as unknown as TypedDocumentString<SaveReceiptMutation, SaveReceiptMutationVariables>;
export const DeleteReceiptDocument = new TypedDocumentString(`
    mutation DeleteReceipt($id: ID!) {
  deleteReceipt(id: $id)
}
    `) as unknown as TypedDocumentString<DeleteReceiptMutation, DeleteReceiptMutationVariables>;