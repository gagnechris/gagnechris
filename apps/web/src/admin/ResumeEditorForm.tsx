import type { FormEvent } from 'react';
import { Field, TextArea, TextInput } from '../workspace/ui/Field';
import { Repeater } from '../workspace/ui/Repeater';
import {
  emptyEducation,
  emptyExperience,
  type ResumeDraftFields,
} from './resumeDraft';

type Props = {
  draft: ResumeDraftFields;
  setField: <K extends keyof ResumeDraftFields>(
    key: K,
    value:
      | ResumeDraftFields[K]
      | ((prev: ResumeDraftFields[K]) => ResumeDraftFields[K]),
  ) => void;
  onSave: () => void;
};

export function ResumeEditorForm({ draft, setField, onSave }: Props) {
  return (
    <form
      className="admin-editor-fields"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSave();
      }}
    >
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
        label="Earlier roles before (year)"
        hint="Roles that ended before this year are grouped as earlier roles"
      >
        <TextInput
          type="number"
          inputMode="numeric"
          min={1900}
          max={2100}
          step={1}
          value={draft.earlierRolesBeforeText}
          onChange={(e) => setField('earlierRolesBeforeText', e.target.value)}
        />
      </Field>
      <Field
        label="PDF download"
        hint="Regenerated from this content on every Publish"
      >
        <TextInput value="/resume.pdf" readOnly aria-readonly="true" />
      </Field>
      <Field label="Summary">
        <TextArea
          rows={6}
          value={draft.summary}
          onChange={(e) => setField('summary', e.target.value)}
        />
      </Field>
      <Field label="Core competencies (one per line)">
        <TextArea
          rows={7}
          value={draft.competenciesText}
          onChange={(e) => setField('competenciesText', e.target.value)}
        />
      </Field>

      <Repeater
        legend="Professional experience"
        items={draft.experience}
        onChange={(experience) => setField('experience', experience)}
        createItem={emptyExperience}
        addLabel="Add role"
        removeLabel="Remove role"
        reorderable
        renderItem={(item, { update }) => (
          <>
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
            <Field
              label="End month"
              hint={
                item.start && !item.present && item.end && item.end < item.start
                  ? 'End is before start; saved as present'
                  : undefined
              }
            >
              <TextInput
                type="month"
                placeholder="YYYY-MM"
                value={item.present ? '' : item.end}
                disabled={!item.start || item.present}
                onChange={(e) => update({ end: e.target.value })}
              />
            </Field>
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
            <Field
              label="Note (optional)"
              hint="For example: contract, concurrent"
            >
              <TextInput
                value={item.note}
                onChange={(e) => update({ note: e.target.value })}
              />
            </Field>
            <Field label="Bullets (one per line)">
              <TextArea
                rows={4}
                value={item.bulletsText}
                onChange={(e) => update({ bulletsText: e.target.value })}
              />
            </Field>
          </>
        )}
      />

      <Field label="Technical skills (one per line)">
        <TextArea
          rows={6}
          value={draft.skillsText}
          onChange={(e) => setField('skillsText', e.target.value)}
        />
      </Field>

      <Repeater
        legend="Education"
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
    </form>
  );
}
