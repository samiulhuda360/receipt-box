import type { GraphQLResolveInfo } from 'graphql';
import type { ReceiptRecord } from '../domain';
import type { Context } from '../graphql/context';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
};

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

export type CategoryTotal = {
  __typename?: 'CategoryTotal';
  category: Category;
  count: Scalars['Int']['output'];
  gstCents: Scalars['Int']['output'];
  totalCents: Scalars['Int']['output'];
};

/** A value read from the receipt image, with how sure the reader was (0-1) */
export type ExtractedField = {
  __typename?: 'ExtractedField';
  confidence: Scalars['Float']['output'];
  value: Scalars['String']['output'];
};

export type Extraction = {
  __typename?: 'Extraction';
  date: Maybe<ExtractedField>;
  /** Which reader produced it: textract (AWS) or tesseract (local) */
  engine: Scalars['String']['output'];
  gst: Maybe<ExtractedField>;
  ms: Scalars['Int']['output'];
  total: Maybe<ExtractedField>;
  vendor: Maybe<ExtractedField>;
};

export type Mutation = {
  __typename?: 'Mutation';
  deleteReceipt: Scalars['Boolean']['output'];
  /** Save the checked values; the receipt becomes REVIEWED */
  saveReceipt: Receipt;
};


export type MutationDeleteReceiptArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSaveReceiptArgs = {
  id: Scalars['ID']['input'];
  input: ReceiptInput;
};

export type Query = {
  __typename?: 'Query';
  /** Everything not yet reviewed: uploading, processing, needs review, failed. Newest first. */
  inbox: Array<Receipt>;
  receipt: Maybe<Receipt>;
  /** Reviewed receipts dated between from and to (inclusive), newest first */
  receipts: Array<Receipt>;
  summary: Summary;
};


export type QueryReceiptArgs = {
  id: Scalars['ID']['input'];
};


export type QueryReceiptsArgs = {
  from: Scalars['String']['input'];
  to: Scalars['String']['input'];
};


export type QuerySummaryArgs = {
  from: Scalars['String']['input'];
  to: Scalars['String']['input'];
};

export type Receipt = {
  __typename?: 'Receipt';
  category: Category;
  createdAt: Scalars['String']['output'];
  date: Maybe<Scalars['String']['output']>;
  error: Maybe<Scalars['String']['output']>;
  extraction: Maybe<Extraction>;
  fileName: Scalars['String']['output'];
  gstCents: Maybe<Scalars['Int']['output']>;
  id: Scalars['ID']['output'];
  /** A short-lived signed link to the image */
  imageUrl: Maybe<Scalars['String']['output']>;
  notes: Scalars['String']['output'];
  status: ReceiptStatus;
  totalCents: Maybe<Scalars['Int']['output']>;
  updatedAt: Scalars['String']['output'];
  vendor: Maybe<Scalars['String']['output']>;
};

export type ReceiptInput = {
  category: Category;
  date: Scalars['String']['input'];
  gstCents: Scalars['Int']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  totalCents: Scalars['Int']['input'];
  vendor: Scalars['String']['input'];
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

/** Totals for reviewed receipts dated inside the period */
export type Summary = {
  __typename?: 'Summary';
  byCategory: Array<CategoryTotal>;
  count: Scalars['Int']['output'];
  from: Scalars['String']['output'];
  gstCents: Scalars['Int']['output'];
  to: Scalars['String']['output'];
  totalCents: Scalars['Int']['output'];
};



export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = Record<PropertyKey, never>, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;





/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Category: Category;
  CategoryTotal: ResolverTypeWrapper<CategoryTotal>;
  ExtractedField: ResolverTypeWrapper<ExtractedField>;
  Extraction: ResolverTypeWrapper<Extraction>;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Receipt: ResolverTypeWrapper<ReceiptRecord>;
  ReceiptInput: ReceiptInput;
  ReceiptStatus: ReceiptStatus;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  Summary: ResolverTypeWrapper<Summary>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Boolean: Scalars['Boolean']['output'];
  CategoryTotal: CategoryTotal;
  ExtractedField: ExtractedField;
  Extraction: Extraction;
  Float: Scalars['Float']['output'];
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  Mutation: Record<PropertyKey, never>;
  Query: Record<PropertyKey, never>;
  Receipt: ReceiptRecord;
  ReceiptInput: ReceiptInput;
  String: Scalars['String']['output'];
  Summary: Summary;
};

export type CategoryTotalResolvers<ContextType = Context, ParentType extends ResolversParentTypes['CategoryTotal'] = ResolversParentTypes['CategoryTotal']> = {
  category?: Resolver<ResolversTypes['Category'], ParentType, ContextType>;
  count?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  gstCents?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalCents?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type ExtractedFieldResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ExtractedField'] = ResolversParentTypes['ExtractedField']> = {
  confidence?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  value?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ExtractionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Extraction'] = ResolversParentTypes['Extraction']> = {
  date?: Resolver<Maybe<ResolversTypes['ExtractedField']>, ParentType, ContextType>;
  engine?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  gst?: Resolver<Maybe<ResolversTypes['ExtractedField']>, ParentType, ContextType>;
  ms?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<Maybe<ResolversTypes['ExtractedField']>, ParentType, ContextType>;
  vendor?: Resolver<Maybe<ResolversTypes['ExtractedField']>, ParentType, ContextType>;
};

export type MutationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  deleteReceipt?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDeleteReceiptArgs, 'id'>>;
  saveReceipt?: Resolver<ResolversTypes['Receipt'], ParentType, ContextType, RequireFields<MutationSaveReceiptArgs, 'id' | 'input'>>;
};

export type QueryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  inbox?: Resolver<Array<ResolversTypes['Receipt']>, ParentType, ContextType>;
  receipt?: Resolver<Maybe<ResolversTypes['Receipt']>, ParentType, ContextType, RequireFields<QueryReceiptArgs, 'id'>>;
  receipts?: Resolver<Array<ResolversTypes['Receipt']>, ParentType, ContextType, RequireFields<QueryReceiptsArgs, 'from' | 'to'>>;
  summary?: Resolver<ResolversTypes['Summary'], ParentType, ContextType, RequireFields<QuerySummaryArgs, 'from' | 'to'>>;
};

export type ReceiptResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Receipt'] = ResolversParentTypes['Receipt']> = {
  category?: Resolver<ResolversTypes['Category'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  date?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  extraction?: Resolver<Maybe<ResolversTypes['Extraction']>, ParentType, ContextType>;
  fileName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  gstCents?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  imageUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  notes?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['ReceiptStatus'], ParentType, ContextType>;
  totalCents?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  vendor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type SummaryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Summary'] = ResolversParentTypes['Summary']> = {
  byCategory?: Resolver<Array<ResolversTypes['CategoryTotal']>, ParentType, ContextType>;
  count?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  from?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  gstCents?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  to?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  totalCents?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type Resolvers<ContextType = Context> = {
  CategoryTotal?: CategoryTotalResolvers<ContextType>;
  ExtractedField?: ExtractedFieldResolvers<ContextType>;
  Extraction?: ExtractionResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Receipt?: ReceiptResolvers<ContextType>;
  Summary?: SummaryResolvers<ContextType>;
};

