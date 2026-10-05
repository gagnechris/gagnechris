import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

export type SearchHit = {
  key: string;
  group: string;
  to: string;
  title: ReactNode;
  detail?: ReactNode;
};

type Props = {
  label: string;
  placeholder: string;
  q: string;
  onQueryChange: (q: string) => void;
  /** Group order; empty groups are skipped. */
  groups: readonly string[];
  hits: SearchHit[];
  /** Under the input, announced politely. */
  status?: ReactNode;
  error?: string | null;
  toolbar?: ReactNode;
  onClose: () => void;
};

export default function SearchPalette({
  label,
  placeholder,
  q,
  onQueryChange,
  groups,
  hits,
  status,
  error,
  toolbar,
  onClose,
}: Props) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;
  const flat = groups.flatMap((group) => hits.filter((h) => h.group === group));
  const [active, setActive] = useState(0);
  const safeActive = flat.length === 0 ? 0 : Math.min(active, flat.length - 1);

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const go = (to: string) => {
    onClose();
    void navigate(to);
  };

  return (
    <div
      className="workspace-search"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <button
        type="button"
        className="workspace-search__backdrop"
        aria-label="Close search"
        onClick={onClose}
      />
      <div className="workspace-search__panel">
        <div className="workspace-search__toolbar">
          <input
            ref={inputRef}
            className="admin-input"
            type="search"
            role="combobox"
            aria-label={label}
            placeholder={placeholder}
            value={q}
            onChange={(e) => {
              onQueryChange(e.target.value);
              setActive(0);
            }}
            aria-expanded={flat.length > 0}
            aria-controls={flat.length > 0 ? listId : undefined}
            aria-activedescendant={
              flat[safeActive] ? optionId(safeActive) : undefined
            }
            aria-autocomplete="list"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter' && flat[safeActive]) {
                e.preventDefault();
                go(flat[safeActive]!.to);
              }
            }}
          />
          {toolbar}
        </div>

        <div className="workspace-search__status" aria-live="polite">
          {status}
        </div>
        {error ? (
          <p className="admin-panel__error" role="alert">
            {error}
          </p>
        ) : null}

        {flat.length > 0 ? (
          <div
            id={listId}
            className="workspace-search__results"
            role="listbox"
            aria-label="Results"
          >
            {groups.map((group) => {
              const items = flat.filter((h) => h.group === group);
              if (items.length === 0) return null;
              const labelId = `${listId}-${group}`;
              return (
                <div
                  key={group}
                  role="group"
                  aria-labelledby={labelId}
                  className="workspace-search__group"
                >
                  <div
                    id={labelId}
                    role="presentation"
                    className="workspace-search__group-label"
                  >
                    {group}
                  </div>
                  {items.map((hit) => {
                    const index = flat.indexOf(hit);
                    return (
                      // Focus stays in the combobox (aria-activedescendant);
                      // options are pointer targets only.
                      <div
                        key={hit.key}
                        id={optionId(index)}
                        role="option"
                        aria-selected={index === safeActive}
                        className={
                          index === safeActive
                            ? 'workspace-search__hit workspace-search__hit--active'
                            : 'workspace-search__hit'
                        }
                        onMouseEnter={() => setActive(index)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => go(hit.to)}
                      >
                        <span className="workspace-search__hit-title">
                          {hit.title}
                        </span>
                        {hit.detail ? (
                          <span className="workspace-search__hit-snippet">
                            {hit.detail}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
