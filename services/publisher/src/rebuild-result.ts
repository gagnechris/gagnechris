export type RebuildResult = {
  publishedCount: number;
  removedSlugs: string[];
  resumePublished: boolean;
  resumeUnpublished: boolean;
  /** The last good PDF is kept. */
  resumePdfFailed: boolean;
  homePublished: boolean;
  homeRestoredFromSnapshot: boolean;
  invalidated: string[];
};
