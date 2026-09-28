export type RebuildResult = {
  publishedCount: number;
  removedSlugs: string[];
  resumePublished: boolean;
  /** True when resume was draft/missing and live artifacts were cleared/replaced. */
  resumeUnpublished: boolean;
  /** True when resume HTML was published but PDF generation failed (last good PDF kept). */
  resumePdfFailed: boolean;
  homePublished: boolean;
  /** True when Home is draft/missing but last-published snapshot was restored. */
  homeRestoredFromSnapshot: boolean;
  invalidated: string[];
};
