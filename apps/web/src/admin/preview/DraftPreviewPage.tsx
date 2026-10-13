import { useParams } from 'react-router-dom';
import { BodyPreview } from '../editor/BodyPreview';
import { useDraftPreviewSource, type DraftPreviewKind } from './draftPreview';

const KINDS: readonly DraftPreviewKind[] = ['post', 'project'];

/** The Preview page an editor opens in a new tab. */
export default function DraftPreviewPage() {
  const params = useParams<{ kind: string; id: string }>();
  const kind = KINDS.find((k) => k === params.kind);
  if (!kind || !params.id) {
    return <p className="kit-hint">Nothing to preview.</p>;
  }
  return (
    <DraftPreview key={`${kind}/${params.id}`} kind={kind} id={params.id} />
  );
}

function DraftPreview({ kind, id }: { kind: DraftPreviewKind; id: string }) {
  const draft = useDraftPreviewSource(kind, id);
  if (!draft) {
    return (
      <p className="kit-hint">
        Nothing to preview. Open this page with Preview page in the {kind}{' '}
        editor.
      </p>
    );
  }
  return (
    <article className="admin-draft-preview" aria-label="Preview">
      <p className="kit-hint">
        Preview of the current draft. It updates as you edit.
      </p>
      {draft.title ? (
        <h1 className="admin-draft-preview__title">{draft.title}</h1>
      ) : null}
      <BodyPreview kind={kind} markdown={draft.markdown} />
    </article>
  );
}
