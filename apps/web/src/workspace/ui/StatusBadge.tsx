type Props = {
  status: 'draft' | 'published' | 'deleted';
  hasUnpublishedChanges?: boolean;
};

export function StatusBadge({ status, hasUnpublishedChanges }: Props) {
  return (
    <>
      <span className={`admin-badge admin-badge--${status}`}>{status}</span>
      {hasUnpublishedChanges ? (
        <span className="admin-badge admin-badge--unpublished">
          Unpublished changes
        </span>
      ) : null}
    </>
  );
}
