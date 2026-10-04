import { describe, expect, test } from 'vitest';
import { DEFAULT_RESUME } from '@gagnechris/shared';
import { legacyResume } from '@gagnechris/shared/fixtures/legacy-resume';
import {
  createResumeContentBuilder,
  emptyExperience,
  experienceRangeError,
  resumeContentFromDraft,
  resumeDraftFromResume,
} from './resumeDraft';

describe('resume draft round trip', () => {
  test('structured dates, note, headline and cut-off survive draft → payload', () => {
    const content = structuredClone(DEFAULT_RESUME.content);
    content.experience[3]!.note = 'contract, concurrent';
    expect(
      resumeContentFromDraft(
        resumeDraftFromResume({ ...DEFAULT_RESUME, content }),
      ),
    ).toEqual(content);
  });

  test('old-shape rows save back unchanged', () => {
    const legacy = legacyResume();
    expect(resumeContentFromDraft(resumeDraftFromResume(legacy))).toEqual(
      legacy.content,
    );
  });

  test('an end month without a start, or a partial cut-off year, is not sent', () => {
    const draft = resumeDraftFromResume(legacyResume());
    draft.experience[0]!.end = '2020-01';
    draft.earlierRolesThroughText = '201';
    const content = resumeContentFromDraft(draft);
    expect(content.experience[0]).not.toHaveProperty('end');
    expect(content).not.toHaveProperty('earlierRolesThrough');
  });

  test('an end before start is kept in the draft and the loaded dates are sent', () => {
    const draft = resumeDraftFromResume(DEFAULT_RESUME);
    const loaded = DEFAULT_RESUME.content.experience[1]!;
    draft.experience[1]!.end = '2016-01';
    expect(experienceRangeError(draft.experience[1]!)).toBe(
      'End is before start',
    );
    const role = resumeContentFromDraft(draft).experience[1]!;
    expect(role).toMatchObject({ start: loaded.start, end: loaded.end });
    expect(draft.experience[1]!.end).toBe('2016-01');
  });
});

describe('resume content builder', () => {
  test('an end before start sends the dates the role last sent, not the loaded ones', () => {
    const builder = createResumeContentBuilder();
    const draft = resumeDraftFromResume(DEFAULT_RESUME);
    const role = draft.experience[1]!;
    role.start = '2017-01';
    role.end = '2019-02';
    builder.payload(draft);

    role.end = '2016-01';
    expect(builder.payload(draft).experience[1]).toMatchObject({
      start: '2017-01',
      end: '2019-02',
    });
    expect(builder.preview(draft).experience[1]).toMatchObject({
      start: '2017-01',
      end: '2019-02',
    });
    expect(builder.undatedRangeErrors(draft)).toEqual([]);
  });

  test('a new role in error sends no dates and is reported as undated', () => {
    const builder = createResumeContentBuilder();
    const draft = resumeDraftFromResume(DEFAULT_RESUME);
    const added = { ...emptyExperience(), start: '2020-05', end: '2020-01' };
    draft.experience.push(added);

    const role =
      builder.payload(draft).experience[
        DEFAULT_RESUME.content.experience.length
      ]!;
    expect(role).not.toHaveProperty('start');
    expect(role).not.toHaveProperty('end');
    expect(builder.undatedRangeErrors(draft)).toEqual([added]);

    added.end = '2020-06';
    builder.payload(draft);
    added.end = '2020-02';
    expect(
      builder.payload(draft).experience[
        DEFAULT_RESUME.content.experience.length
      ],
    ).toMatchObject({
      start: '2020-05',
      end: '2020-06',
    });
    expect(builder.undatedRangeErrors(draft)).toEqual([]);
  });

  test("clearing a role's dates is remembered, so a later error sends none", () => {
    const builder = createResumeContentBuilder();
    const draft = resumeDraftFromResume(DEFAULT_RESUME);
    const role = draft.experience[1]!;
    role.start = '';
    role.end = '';
    builder.payload(draft);

    role.start = '2020-05';
    role.end = '2020-01';
    expect(builder.payload(draft).experience[1]).not.toHaveProperty('start');
    expect(builder.undatedRangeErrors(draft)).toEqual([role]);
  });
});
