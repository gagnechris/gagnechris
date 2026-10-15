/** @jsxRuntime automatic */
type Props = {
  status: 'draft' | 'published' | 'deleted';
  hasUnpublishedChanges?: boolean;
};

export function StatusBadge({ status, hasUnpublishedChanges }: Props) {
  return (
    <>
      <span className={`kit-badge kit-badge--${status}`}>{status}</span>
      {hasUnpublishedChanges ? (
        <span className="kit-badge kit-badge--unpublished">
          Unpublished changes
        </span>
      ) : null}
    </>
  );
}
