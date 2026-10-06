import { useEffect, useRef, type FormEvent } from 'react';
import { Button } from '../kit/Button';
import { Field, TextArea, TextInput } from '../kit/Field';
import { Repeater } from '../workspace/ui/Repeater';
import { ResumeRoleList } from './ResumeRoleList';
import type { SetDraftField } from './editor/useDraftFields';
import {
  emptyEducation,
  emptyExperience,
  experienceRangeError,
  RESUME_PDF_PATH,
  resumeRoleEndId,
  roleTitle,
  type ExperienceDraft,
  type ResumeDraftFields,
} from './resumeDraft';

type SetField = SetDraftField<ResumeDraftFields>;

type Props = {
  draft: ResumeDraftFields;
  setField: SetField;
  hasSavedDates: (item: ExperienceDraft) => boolean;
  onSave: () => void;
  /** The role open on its own screen, or null for the overview. */
  editingRoleId: string | null;
  setEditingRoleId: (roleId: string | null) => void;
};

export function ResumeEditorForm({
  draft,
  setField,
  hasSavedDates,
  onSave,
  editingRoleId,
  setEditingRoleId,
}: Props) {
  const editingRole = draft.experience.find(
    (role) => role.id === editingRoleId,
  );

  return (
    <form
      className="admin-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSave();
      }}
    >
      {editingRole ? (
        <ResumeRoleEditor
          item={editingRole}
          hasSavedDates={hasSavedDates(editingRole)}
          update={(patch) =>
            setField('experience', (rows) =>
              rows.map((row) =>
                row.id === editingRole.id ? { ...row, ...patch } : row,
              ),
            )
          }
          onRemove={() => {
            setField('experience', (rows) =>
              rows.filter((row) => row.id !== editingRole.id),
            );
            setEditingRoleId(null);
          }}
          onBack={() => setEditingRoleId(null)}
        />
      ) : (
        <ResumeOverview
          draft={draft}
          setField={setField}
          setEditingRoleId={setEditingRoleId}
        />
      )}
    </form>
  );
}

function ResumeOverview({
  draft,
  setField,
  setEditingRoleId,
}: {
  draft: ResumeDraftFields;
  setField: SetField;
  setEditingRoleId: (roleId: string | null) => void;
}) {
  return (
    <>
      <section className="admin-form-section">
        <h2 className="admin-form-section__title">Profile</h2>
        <div className="admin-form-card">
          <Field label="Name">
            <TextInput
              value={draft.name}
              onChange={(e) => setField('name', e.target.value)}
            />
          </Field>
          <Field label="Headline (current role)">
            <TextInput
              value={draft.headline}
              onChange={(e) => setField('headline', e.target.value)}
            />
          </Field>
          <Field
            label="Earlier roles through (year)"
            hint="Roles that ended in or before this year are grouped as earlier roles"
          >
            <TextInput
              type="number"
              inputMode="numeric"
              min={1900}
              max={2100}
              step={1}
              value={draft.earlierRolesThroughText}
              onChange={(e) =>
                setField('earlierRolesThroughText', e.target.value)
              }
            />
          </Field>
          <Field
            label="PDF download"
            hint="Regenerated from this content on every Publish"
          >
            <TextInput value={RESUME_PDF_PATH} readOnly aria-readonly="true" />
          </Field>
        </div>
      </section>

      <section className="admin-form-section">
        <h2 className="admin-form-section__title">Summary</h2>
        <div className="admin-form-card">
          <Field label="Summary">
            <TextArea
              rows={6}
              value={draft.summary}
              onChange={(e) => setField('summary', e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="admin-form-section">
        <h2 className="admin-form-section__title">Experience</h2>
        <ResumeRoleList
          roles={draft.experience}
          onReorder={(from, to) =>
            setField('experience', (rows) => {
              const next = [...rows];
              const [moved] = next.splice(from, 1);
              next.splice(to, 0, moved!);
              return next;
            })
          }
          onOpen={setEditingRoleId}
          onAdd={() => {
            const role = emptyExperience();
            setField('experience', (rows) => [...rows, role]);
            setEditingRoleId(role.id);
          }}
        />
      </section>

      <section className="admin-form-section">
        <h2 className="admin-form-section__title">Skills</h2>
        <div className="admin-form-card">
          <Field label="Core competencies (one per line)">
            <TextArea
              rows={7}
              value={draft.competenciesText}
              onChange={(e) => setField('competenciesText', e.target.value)}
            />
          </Field>
          <Field label="Technical skills (one per line)">
            <TextArea
              rows={6}
              value={draft.skillsText}
              onChange={(e) => setField('skillsText', e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="admin-form-section">
        <h2 className="admin-form-section__title">Education</h2>
        <div className="admin-form-card">
          <Repeater
            legend="Education entries"
            items={draft.education}
            onChange={(education) => setField('education', education)}
            createItem={emptyEducation}
            addLabel="Add entry"
            removeLabel="Remove entry"
            reorderable
            renderItem={(item, { update }) => (
              <>
                {(
                  [
                    ['title', 'Degree'],
                    ['degreeDetail', 'Degree detail (optional)'],
                    ['institution', 'Institution'],
                    ['location', 'Location'],
                    ['year', 'Year'],
                  ] as const
                ).map(([field, label]) => (
                  <Field label={label} key={field}>
                    <TextInput
                      value={item[field]}
                      onChange={(e) => update({ [field]: e.target.value })}
                    />
                  </Field>
                ))}
              </>
            )}
          />
        </div>
      </section>
    </>
  );
}

function ResumeRoleEditor({
  item,
  hasSavedDates,
  update,
  onRemove,
  onBack,
}: {
  item: ExperienceDraft;
  hasSavedDates: boolean;
  update: (patch: Partial<ExperienceDraft>) => void;
  onRemove: () => void;
  onBack: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rangeError = experienceRangeError(item);
  const rangeErrorId = `resume-role-${item.id}-dates-error`;

  useEffect(() => {
    headingRef.current?.focus();
  }, [item.id]);

  return (
    <section className="admin-form-section" aria-label="Edit role">
      <button type="button" className="admin-subscreen-back" onClick={onBack}>
        ← All roles
      </button>
      <h2 ref={headingRef} className="admin-subscreen-title" tabIndex={-1}>
        {roleTitle(item)}
      </h2>
      <div className="admin-form-card">
        <Field label="Title">
          <TextInput
            value={item.title}
            onChange={(e) => update({ title: e.target.value })}
          />
        </Field>
        <Field
          label="Company"
          hint={
            !item.start && item.company.includes('|')
              ? 'Dates are still inside the company name; move them to Start and End'
              : undefined
          }
        >
          <TextInput
            value={item.company}
            onChange={(e) => update({ company: e.target.value })}
          />
        </Field>
        <Field label="Start month">
          <TextInput
            type="month"
            placeholder="YYYY-MM"
            value={item.start}
            onChange={(e) => update({ start: e.target.value })}
          />
        </Field>
        <Field label="End month">
          <TextInput
            id={resumeRoleEndId(item.id)}
            type="month"
            placeholder="YYYY-MM"
            value={item.present ? '' : item.end}
            disabled={!item.start || item.present}
            aria-invalid={rangeError ? true : undefined}
            aria-describedby={rangeError ? rangeErrorId : undefined}
            onChange={(e) => update({ end: e.target.value })}
          />
        </Field>
        {rangeError ? (
          <p id={rangeErrorId} className="admin-field-error">
            {rangeError}.{' '}
            {hasSavedDates
              ? 'The last saved dates are kept until this is fixed.'
              : 'Dates for this role are not saved until this is fixed.'}
          </p>
        ) : null}
        <label className="admin-check">
          <input
            type="checkbox"
            checked={item.present}
            disabled={!item.start}
            onChange={(e) =>
              update({
                present: e.target.checked,
                ...(e.target.checked ? { end: '' } : {}),
              })
            }
          />
          Present (current role)
        </label>
        <Field label="Note (optional)" hint="For example: contract, concurrent">
          <TextInput
            value={item.note}
            onChange={(e) => update({ note: e.target.value })}
          />
        </Field>
        <Field label="Bullets (one per line)">
          <TextArea
            rows={6}
            value={item.bulletsText}
            onChange={(e) => update({ bulletsText: e.target.value })}
          />
        </Field>
      </div>
      <Button
        variant="danger"
        className="admin-row-list__add"
        onClick={onRemove}
      >
        Remove role
      </Button>
    </section>
  );
}
