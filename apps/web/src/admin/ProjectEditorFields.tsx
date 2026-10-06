import type { FormEvent } from 'react';
import {
  MAX_SLUG_LENGTH,
  PROJECT_DEMO_IDS,
  PROJECT_LINK_LABEL_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_ORDER_MAX,
  PROJECT_PITCH_MAX_LENGTH,
  PROJECT_STACK_ITEM_MAX_LENGTH,
  PROJECT_STACK_MAX,
  PROJECT_STAGE_LABELS,
  PROJECT_STAGE_NOTE_MAX_LENGTH,
  LINK_HREF_MAX_LENGTH,
  projectHasPage,
  projectPagePath,
  type ProjectDemo,
  type ProjectStage,
} from '@gagnechris/shared';
import { Field, Select, TextArea, TextInput } from '../kit/Field';
import { Repeater } from '../workspace/ui/Repeater';
import SegmentedRadio from '../workspace/ui/SegmentedRadio';
import { ChipsInput } from './editor/ChipsInput';
import { ImageUploadField } from './editor/ImageUploadField';
import type { SetDraftField } from './editor/useDraftFields';
import {
  emptyProjectLink,
  projectHrefError,
  projectLinkErrors,
  projectOrderError,
  projectPreviewImageError,
  type ProjectDraftFields,
} from './projectDraft';

type Props = {
  draft: ProjectDraftFields;
  setField: SetDraftField<ProjectDraftFields>;
  setSlugManual: (manual: boolean) => void;
  onSave: () => void;
  onUploadPreview: (file: File) => Promise<string>;
};

const STAGE_OPTIONS = (Object.keys(PROJECT_STAGE_LABELS) as ProjectStage[]).map(
  (stage) => ({ value: stage, label: PROJECT_STAGE_LABELS[stage] }),
);

const DEMO_LABELS: Record<ProjectDemo, string> = {
  posts: 'Posts',
  notebook: 'Notebook',
};

export function ProjectEditorFields({
  draft,
  setField,
  setSlugManual,
  onSave,
  onUploadPreview,
}: Props) {
  const hrefError = projectHrefError(draft.href);
  const orderError = projectOrderError(draft.orderText);

  return (
    <form
      className="admin-project-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="admin-project-card">
        <Field label="Name">
          <TextInput
            value={draft.name}
            maxLength={PROJECT_NAME_MAX_LENGTH}
            onChange={(e) => setField('name', e.target.value)}
          />
        </Field>
        <Field label="Slug" hint={<SlugPreview draft={draft} />}>
          <TextInput
            value={draft.slug}
            maxLength={MAX_SLUG_LENGTH}
            onChange={(e) => {
              setSlugManual(true);
              setField('slug', e.target.value);
            }}
          />
        </Field>
        <Field label="Pitch" hint="One line, shown on Home and Projects">
          <TextArea
            rows={2}
            value={draft.pitch}
            maxLength={PROJECT_PITCH_MAX_LENGTH}
            onChange={(e) => setField('pitch', e.target.value)}
          />
        </Field>
      </div>

      <div className="admin-project-card">
        <div className="admin-stage">
          <span className="admin-stage__label" aria-hidden="true">
            Stage
          </span>
          <SegmentedRadio
            label="Stage"
            className="admin-stage__options"
            options={STAGE_OPTIONS}
            value={draft.stage}
            onChange={(stage) => setField('stage', stage)}
          />
        </div>
        <Field
          label="Stage note"
          hint="Optional, e.g. “for fun” or “since 2026”"
        >
          <TextInput
            value={draft.stageNote}
            maxLength={PROJECT_STAGE_NOTE_MAX_LENGTH}
            onChange={(e) => setField('stageNote', e.target.value)}
          />
        </Field>
      </div>

      <div className="admin-project-card">
        <ImageUploadField
          layout="thumbnail"
          label="Preview image"
          value={draft.previewImage}
          requiredError={projectPreviewImageError(draft)}
          hint="Shown on the project card. JPEG, PNG, WebP or GIF."
          onChange={(path) => setField('previewImage', path)}
          onUpload={onUploadPreview}
        />
        <ChipsInput
          label="Stack"
          listLabel="Stack items"
          removeLabel={(item) => `Remove ${item}`}
          placeholder="Add, then Enter"
          fullPlaceholder="Stack is full"
          inputMaxLength={PROJECT_STACK_ITEM_MAX_LENGTH * 4}
          maxItems={PROJECT_STACK_MAX}
          maxItemLength={PROJECT_STACK_ITEM_MAX_LENGTH}
          value={draft.stack}
          onChange={(stack) => setField('stack', stack)}
        />
        <div className="admin-project-row">
          <Field label="Demo">
            <Select
              value={draft.demo}
              onChange={(e) =>
                setField('demo', e.target.value as ProjectDemo | '')
              }
            >
              <option value="">None</option>
              {PROJECT_DEMO_IDS.map((id) => (
                <option key={id} value={id}>
                  {DEMO_LABELS[id]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Order" hint="Lower numbers are listed first">
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              max={PROJECT_ORDER_MAX}
              step={1}
              value={draft.orderText}
              aria-invalid={orderError ? true : undefined}
              onChange={(e) => setField('orderText', e.target.value)}
            />
            {orderError ? (
              <span className="admin-field-error">{orderError}</span>
            ) : null}
          </Field>
        </div>
        <Field
          label="Link card to…"
          hint="Optional. When set, the project card links here and replaces the project page."
        >
          <TextInput
            value={draft.href}
            maxLength={LINK_HREF_MAX_LENGTH}
            placeholder="/dont-feed-the-bears or https://…"
            aria-invalid={hrefError ? true : undefined}
            onChange={(e) => setField('href', e.target.value)}
          />
          {hrefError ? (
            <span className="admin-field-error">{hrefError}</span>
          ) : null}
        </Field>
      </div>

      <Repeater
        legend="Links"
        items={draft.links}
        onChange={(next) => setField('links', next)}
        createItem={emptyProjectLink}
        addLabel="Add link"
        removeLabel="Remove link"
        reorderable
        renderItem={(link, { update }) => {
          const errors = projectLinkErrors(link);
          return (
            <div className="admin-project-row">
              <Field label="Label">
                <TextInput
                  value={link.label}
                  maxLength={PROJECT_LINK_LABEL_MAX_LENGTH}
                  aria-invalid={errors.label ? true : undefined}
                  onChange={(e) => update({ label: e.target.value })}
                />
                {errors.label ? (
                  <span className="admin-field-error">{errors.label}</span>
                ) : null}
              </Field>
              <Field label="URL">
                <TextInput
                  value={link.url}
                  maxLength={LINK_HREF_MAX_LENGTH}
                  placeholder="https://… or /path"
                  aria-invalid={errors.url ? true : undefined}
                  onChange={(e) => update({ url: e.target.value })}
                />
                {errors.url ? (
                  <span className="admin-field-error">{errors.url}</span>
                ) : null}
              </Field>
            </div>
          );
        }}
      />
    </form>
  );
}

function SlugPreview({ draft }: { draft: ProjectDraftFields }) {
  const slug = draft.slug.trim() || '…';
  const href = draft.href.trim();
  if (href && !projectHrefError(href)) {
    return (
      <>
        No project page: the card links to <code>{href}</code>
      </>
    );
  }
  if (!projectHasPage({ ...draft, href: null })) {
    return (
      <>
        No page yet: an idea with no body is listed without a link. Page:{' '}
        <code>{projectPagePath(slug)}</code>
      </>
    );
  }
  return (
    <>
      Page: <code>{projectPagePath(slug)}</code>
    </>
  );
}
