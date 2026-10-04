import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  PROJECT_STAGE_LABELS,
  projectCardHref,
  sortProjectsByOrder,
} from '@gagnechris/shared';
import {
  useCreateProjectMutation,
  useCreateStarterProjectsMutation,
  useProjectsQuery,
} from '@gagnechris/app-core';
import { ApiError } from './query/api';
import { NEW_PROJECT_NAME, newProjectSlug } from './projectDraft';
import { Button } from '../workspace/ui/Button';
import { StatusBadge } from '../workspace/ui/StatusBadge';
import './projects.css';

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

export default function AdminProjectsPage() {
  const navigate = useNavigate();
  const { data, error: queryError, isPending } = useProjectsQuery();
  const createMutation = useCreateProjectMutation();
  const starterMutation = useCreateStarterProjectsMutation();
  const [actionError, setActionError] = useState<string | null>(null);

  const projects = useMemo(
    () => (data ? sortProjectsByOrder(data) : undefined),
    [data],
  );
  const loadError = queryError
    ? errorMessage(queryError, 'Could not load projects.')
    : null;
  const error = actionError ?? loadError;

  const createDraft = async () => {
    setActionError(null);
    const nextOrder = Math.max(0, ...(projects ?? []).map((p) => p.order + 1));
    try {
      const project = await createMutation.mutateAsync({
        name: NEW_PROJECT_NAME,
        slug: newProjectSlug(),
        order: nextOrder,
      });
      void navigate(`/projects/${project.id}`);
    } catch (err) {
      setActionError(errorMessage(err, 'Could not create project.'));
    }
  };

  const createStarters = async () => {
    setActionError(null);
    try {
      await starterMutation.mutateAsync();
    } catch (err) {
      setActionError(errorMessage(err, 'Could not create starter projects.'));
    }
  };

  const creating = createMutation.isPending;

  return (
    <section className="admin-panel">
      <div className="admin-panel__header">
        <div>
          <h1>Projects</h1>
          <p className="admin-panel__lede">
            What I’m building. Publishing updates /projects and the sitemap.
          </p>
        </div>
        <Button
          variant="primary"
          disabled={creating}
          onClick={() => void createDraft()}
        >
          {creating ? 'Creating…' : 'New project'}
        </Button>
      </div>

      {error ? (
        <p className="admin-panel__error" role="alert">
          {error}
        </p>
      ) : null}
      {isPending && !error ? <p>Loading…</p> : null}

      {projects && projects.length === 0 ? (
        <div className="admin-project-empty">
          <p>No projects yet.</p>
          <p className="admin-hint">
            Start from drafts for Posts, Notebook and Don’t Feed the Bears, or
            create one from scratch. Nothing is public until you publish it.
          </p>
          <Button
            disabled={starterMutation.isPending}
            onClick={() => void createStarters()}
          >
            {starterMutation.isPending
              ? 'Creating…'
              : 'Create starter projects'}
          </Button>
        </div>
      ) : null}

      {projects && projects.length > 0 ? (
        <ul className="admin-post-list admin-project-list">
          {projects.map((project) => {
            const target = projectCardHref(project);
            return (
              <li key={project.id}>
                <Link
                  to={`/projects/${project.id}`}
                  className="admin-post-list__item admin-post-list__link"
                >
                  <span className="admin-post-list__title">
                    {project.name}
                    <span
                      className={`admin-stage admin-stage--${project.stage}`}
                    >
                      {PROJECT_STAGE_LABELS[project.stage]}
                    </span>
                  </span>
                  <span className="admin-post-list__meta">
                    <StatusBadge
                      status={project.status}
                      hasUnpublishedChanges={project.hasUnpublishedChanges}
                    />
                    <code>
                      {project.href
                        ? `→ ${project.href}`
                        : (target ?? 'no page')}
                    </code>
                    <span className="admin-project-list__order">
                      Order {project.order}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
