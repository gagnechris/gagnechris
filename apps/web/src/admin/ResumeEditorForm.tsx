import type { FormEvent } from 'react';
import { Field, TextArea, TextInput } from '../kit/Field';
import { Repeater } from '../workspace/ui/Repeater';
import {
  emptyEducation,
  emptyExperience,
  experienceRangeError,
  resumeRoleEndId,
  type ExperienceDraft,
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
  hasSavedDates: (item: ExperienceDraft) => boolean;
  onSave: () => void;
};

export function ResumeEditorForm({
  draft,
  setField,
  hasSavedDates,
  onSave,
}: Props) {
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
          onChange={(e) => setField('earlierRolesThroughText', e.target.value)}
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
        renderItem={(item, { update }) => {
          const rangeError = experienceRangeError(item);
          const rangeErrorId = `resume-role-${item.id}-dates-error`;
          return (
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
                  {hasSavedDates(item)
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
          );
        }}
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
