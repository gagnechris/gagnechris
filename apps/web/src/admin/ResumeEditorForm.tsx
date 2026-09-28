import type { FormEvent } from 'react';
import { Field, TextArea, TextInput } from '../ui/Field';
import { Repeater } from '../ui/Repeater';
import {
  emptyEducation,
  emptyExperience,
  type ResumeDraftFields,
} from './resumeDraft';

type Props = {
  draft: ResumeDraftFields;
  setField: <K extends keyof ResumeDraftFields>(
    key: K,
    value: ResumeDraftFields[K],
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
        renderItem={(item, { update }) => (
          <>
            <Field label="Title">
              <TextInput
                value={item.title}
                onChange={(e) => update({ title: e.target.value })}
              />
            </Field>
            <Field label="Company / dates">
              <TextInput
                value={item.company}
                onChange={(e) => update({ company: e.target.value })}
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
