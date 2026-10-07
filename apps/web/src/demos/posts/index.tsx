import {
  lazy,
  Suspense,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  renderHomeRecentPostsHtml,
  renderPostArticleHtml,
  selectHomeRecentPosts,
} from '@gagnechris/shared/render';
import { Button } from '../../kit/Button';
import { DemoFrame } from '../../kit/demo/DemoFrame';
import { useDemoReducer } from '../../kit/demo/useDemoReducer';
import { Field, TextInput } from '../../kit/Field';
import { StatusBadge } from '../../kit/StatusBadge';
import { useMediaQuery } from '../../kit/useMediaQuery';
import {
  canPublish,
  DEMO_POST_ID,
  demoPostSlug,
  postsDemoReducer,
  POSTS_DEMO_BODY_HINT,
  POSTS_DEMO_CAPTIONS,
  POSTS_DEMO_NOTE,
  postsDemoStatus,
  seedPostsDemo,
  WELCOME_POST,
  type PostsDemoAction,
  type PostsDemoState,
  type PostsDemoStatus,
} from './postsDemoState';
import '../../kit/markdown/markdown.css';
import './posts.css';

const MarkdownEditor = lazy(() => import('../../kit/markdown/MarkdownEditor'));

type View = 'post' | 'home';

const postsDemoNote = (
  <>
    <span className="posts-demo__note-side-by-side">
      {POSTS_DEMO_NOTE.sideBySide}
    </span>
    <span className="posts-demo__note-stacked">{POSTS_DEMO_NOTE.stacked}</span>
  </>
);

export default function PostsDemo() {
  const { state, dispatch, reset } = useDemoReducer(
    postsDemoReducer,
    seedPostsDemo,
  );
  return (
    <DemoFrame layout="split" note={postsDemoNote} onReset={reset}>
      {(resetButton) => (
        <PostsDemoBody
          state={state}
          dispatch={dispatch}
          resetButton={resetButton}
        />
      )}
    </DemoFrame>
  );
}

function PostsDemoBody({
  state,
  dispatch,
  resetButton,
}: {
  state: PostsDemoState;
  dispatch: (action: PostsDemoAction) => void;
  resetButton: ReactNode;
}) {
  const status = postsDemoStatus(state);
  return (
    <div className="posts-demo">
      <div className="posts-demo__panes">
        <EditorPane
          state={state}
          status={status}
          dispatch={dispatch}
          resetButton={resetButton}
        />
        <PublicSitePane state={state} />
      </div>
      <p className="posts-demo__caption" aria-live="polite">
        {POSTS_DEMO_CAPTIONS[status]}
      </p>
    </div>
  );
}

function EditorPane({
  state,
  status,
  dispatch,
  resetButton,
}: {
  state: PostsDemoState;
  status: PostsDemoStatus;
  dispatch: (action: PostsDemoAction) => void;
  resetButton: ReactNode;
}) {
  const { draft } = state;
  return (
    <section
      className="posts-demo__pane posts-demo__editor"
      aria-label="Editor"
    >
      <header className="posts-demo__bar">
        <span className="posts-demo__bar-label" aria-hidden="true">
          Editor
        </span>
        <span className="posts-demo__status">
          <StatusBadge
            status={state.published ? 'published' : 'draft'}
            hasUnpublishedChanges={status === 'unpublished'}
          />
        </span>
        <span className="posts-demo__actions">
          {resetButton}
          <Button
            variant="primary"
            disabled={!canPublish(state)}
            onClick={() =>
              dispatch({ type: 'publish', at: new Date().toISOString() })
            }
          >
            {status === 'unpublished' ? 'Publish changes' : 'Publish'}
          </Button>
        </span>
      </header>
      <div className="posts-demo__editor-body">
        <Field label="Title" hint={`/posts/${demoPostSlug(draft.title)}`}>
          <TextInput
            className="admin-input posts-demo__title"
            value={draft.title}
            onChange={(e) =>
              dispatch({ type: 'edit', patch: { title: e.target.value } })
            }
          />
        </Field>
        <Suspense fallback={<p className="admin-hint">Loading editor…</p>}>
          <MarkdownEditor
            label="Body"
            lineNumbers={false}
            value={draft.bodyMarkdown}
            onChange={(bodyMarkdown) =>
              dispatch({ type: 'edit', patch: { bodyMarkdown } })
            }
          />
        </Suspense>
        <p className="admin-hint posts-demo__hint">{POSTS_DEMO_BODY_HINT}</p>
      </div>
    </section>
  );
}

function PublicSitePane({ state }: { state: PostsDemoState }) {
  const [view, setView] = useState<View>('home');
  const [flashed, setFlashed] = useState(0);
  const { published } = state;
  const postPath = `/posts/${published?.slug ?? demoPostSlug(state.draft.title)}`;

  const html = useMemo(() => {
    if (view === 'home') {
      return renderHomeRecentPostsHtml(
        selectHomeRecentPosts(
          published
            ? [
                {
                  id: DEMO_POST_ID,
                  slug: published.slug,
                  title: published.title,
                  excerpt: '',
                  publishedAt: published.publishedAt,
                  updatedAt: published.publishedAt,
                },
                WELCOME_POST,
              ]
            : [WELCOME_POST],
        ),
      );
    }
    // Under the slot's "Try it" h2 and inside the project page's <main>: no
    // second h1 and no author note.
    return published
      ? `<div class="post-page">${renderPostArticleHtml(
          {
            slug: published.slug,
            title: published.title,
            excerpt: '',
            publishedAt: published.publishedAt,
            bodyMarkdown: published.bodyMarkdown,
          },
          [],
          3,
        )}</div>`
      : null;
  }, [view, published]);

  // The rendered links point at real site paths; keep the visitor in the demo.
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as Element).closest('a');
    if (!link) return;
    event.preventDefault();
    if (published && link.getAttribute('href') === postPath) setView('post');
  };

  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const flash = !reducedMotion && view === 'home' && state.publishes > flashed;
  return (
    <section
      className="posts-demo__pane posts-demo__site"
      aria-label="Public site"
    >
      <header className="posts-demo__bar">
        <span className="posts-demo__bar-label" aria-hidden="true">
          Public site
        </span>
        <span className="posts-demo__path">
          {view === 'home' ? '/' : postPath}
        </span>
      </header>
      <div className="posts-demo__page">
        {html === null ? (
          <p className="posts-demo__missing">
            Nothing at {postPath} yet. Publish to put it here.
          </p>
        ) : (
          <div
            className="posts-demo__html"
            data-flash={flash ? '' : undefined}
            onClick={onClick}
            onAnimationEnd={() => setFlashed(state.publishes)}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
      <div className="posts-demo__views" role="group" aria-label="Public page">
        <ViewButton current={view} value="post" onSelect={setView}>
          Post page
        </ViewButton>
        <ViewButton current={view} value="home" onSelect={setView}>
          Home
        </ViewButton>
      </div>
    </section>
  );
}

function ViewButton({
  current,
  value,
  onSelect,
  children,
}: {
  current: View;
  value: View;
  onSelect: (view: View) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="posts-demo__view"
      aria-pressed={current === value}
      onClick={() => onSelect(value)}
    >
      {children}
    </button>
  );
}
