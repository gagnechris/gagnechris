import { describe, expect, test } from 'vitest';
import { DEFAULT_RESUME } from '@gagnechris/shared';
import { legacyResume } from '@gagnechris/shared/fixtures/legacy-resume';
import {
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

  test('an end before start is kept in the draft but its dates are not sent', () => {
    const draft = resumeDraftFromResume(DEFAULT_RESUME);
    draft.experience[1]!.end = '2016-01';
    expect(experienceRangeError(draft.experience[1]!)).toBe(
      'End is before start',
    );
    const role = resumeContentFromDraft(draft).experience[1]!;
    expect(role).not.toHaveProperty('start');
    expect(role).not.toHaveProperty('end');
    expect(draft.experience[1]!.end).toBe('2016-01');
  });
});
