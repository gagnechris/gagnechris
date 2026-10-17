import {
  createResumeContentBuilder,
  emptyEducation,
  emptyExperience,
  emptyResumeDraft,
  experienceRangeError,
  hasExperienceRangeError,
  RESUME_UNPUBLISH_NOTE,
  resumeDraftFromResume,
  resumePayload,
  resumeResource,
  roleTitle,
  useVersionedEntityEditor,
  type EducationDraft,
  type ExperienceDraft,
  type Resume,
  type ResumeDraftFields,
} from '@gagnechris/app-core';
import {
  formatResumeShortMonth,
  RESUME_MONTH_PATTERN,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { FieldHint, TextField } from '../../../src/admin/DetailsSheet';
import {
  EditorHeaderButtons,
  PublishBar,
} from '../../../src/admin/EditorChrome';
import { ContentRow } from '../../../src/admin/ContentRow';
import {
  DISCARD_PROMPT,
  publishableConfirm,
  UNPUBLISH_PROMPT,
} from '../../../src/admin/publishableConfirm';
import { showPublishableMenu } from '../../../src/admin/publishableMenu';
import { ResumeRoleSheet } from '../../../src/admin/ResumeRoleSheet';
import { PUBLIC_SITE_ORIGIN } from '../../../src/markdown/links';
import {
  EditorOfflineNotice,
  nativeRetrySignals,
  useIsOnline,
} from '../../../src/net';
import { useSaveOnBackground } from '../../../src/notebook/useSaveOnBackground';
import { color, font } from '../../../src/theme';
import { confirmAction } from '../../../src/ui/confirm';
import { Icon } from '../../../src/ui/Icon';
import { ListRow } from '../../../src/ui/ListRow';
import { Section } from '../../../src/ui/Section';

const confirm = publishableConfirm('resume', RESUME_UNPUBLISH_NOTE);

const monthLabel = (month: string) =>
  RESUME_MONTH_PATTERN.test(month) ? formatResumeShortMonth(month) : '';

const roleMeta = (role: ExperienceDraft) => {
  const start = monthLabel(role.start);
  const end = role.present ? 'Present' : monthLabel(role.end);
  const dates = start && end ? `${start} – ${end}` : start;
  return [role.company.trim(), dates].filter(Boolean).join(' · ');
};

const moved = <T,>(rows: T[], from: number, to: number) => {
  const next = [...rows];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row!);
  return next;
};

const EDUCATION_FIELDS = [
  ['title', 'Degree'],
  ['degreeDetail', 'Degree detail (optional)'],
  ['institution', 'Institution'],
  ['location', 'Location'],
  ['year', 'Year'],
] as const;

const ResumeScreen = () => {
  const online = useIsOnline();
  const [content] = useState(createResumeContentBuilder);
  const [roleId, setRoleId] = useState<string | null>(null);
  const latest = useRef<{
    draft: ResumeDraftFields;
    entity: Resume | null | undefined;
  } | null>(null);

  const editor = useVersionedEntityEditor({
    resource: resumeResource,
    params: {},
    initialDraft: emptyResumeDraft(),
    toDraft: resumeDraftFromResume,
    getEntityId: () => 'resume',
    toPayload: (draft, saved) => resumePayload(draft, content, saved),
    conflictMessage:
      'Someone else changed the resume. Go back and open it again.',
    loadErrorFallback: 'Could not load the resume.',
    confirm,
    unpublishConfirm: UNPUBLISH_PROMPT,
    discardConfirm: DISCARD_PROMPT,
    retrySignals: nativeRetrySignals,
    beforePublish: () => {
      const { draft, entity } = latest.current ?? {};
      const role =
        draft && entity ? content.undatedRangeErrors(draft, entity)[0] : null;
      return role
        ? `Not published: fix the dates on ${roleTitle(role)} first. It has no saved dates to fall back on.`
        : true;
    },
  });
  const { draft, updateDraft, entity, dirty, save, actionBarProps } = editor;
  useEffect(() => {
    latest.current = { draft, entity };
  });
  useSaveOnBackground(dirty, save);

  const set =
    <K extends keyof ResumeDraftFields>(key: K) =>
    (value: ResumeDraftFields[K]) =>
      updateDraft((prev) => ({ ...prev, [key]: value }));
  const setRole = (id: string, patch: Partial<ExperienceDraft>) =>
    updateDraft((prev) => ({
      ...prev,
      experience: prev.experience.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    }));
  const setEducation = (id: string, patch: Partial<EducationDraft>) =>
    updateDraft((prev) => ({
      ...prev,
      education: prev.education.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    }));
  const removeEducation = async (item: EducationDraft, n: number) => {
    const name = item.title.trim() || `entry ${n}`;
    if (await confirmAction(`Remove “${name}”?`, '', 'Remove')) {
      updateDraft((prev) => ({
        ...prev,
        education: prev.education.filter((row) => row.id !== item.id),
      }));
    }
  };

  if (editor.loadError) {
    return (
      <Text style={styles.status} accessibilityRole="alert">
        {editor.loadError}
      </Text>
    );
  }

  const ready = Boolean(!editor.isLoading && entity);
  const published = entity?.status === 'published';
  // A role with bad dates saves its last saved dates, so a clean save does not
  // mean everything typed is on the server.
  const actionBar = {
    ...actionBarProps,
    dirty: actionBarProps.dirty || hasExperienceRangeError(draft),
  };
  const roleIndex = draft.experience.findIndex((row) => row.id === roleId);
  const role = draft.experience[roleIndex];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <EditorHeaderButtons
              actionBar={actionBar}
              offline={!online}
              ready={ready}
              menuLabel="Resume actions"
              onMenu={
                published
                  ? () =>
                      showPublishableMenu({
                        liveUrl: `${PUBLIC_SITE_ORIGIN}/resume`,
                        hasUnpublishedChanges:
                          actionBarProps.hasUnpublishedChanges,
                        onDiscard: actionBarProps.onDiscard,
                        onUnpublish: actionBarProps.onUnpublish,
                      })
                  : undefined
              }
            />
          ),
        }}
      />
      {editor.saveError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {editor.saveError}
        </Text>
      ) : null}
      <EditorOfflineNotice dirty={dirty} />
      {!ready || !entity ? (
        <Text style={styles.status}>Loading the resume…</Text>
      ) : (
        <>
          <PublishBar actionBar={actionBar} offline={!online} />

          <Text style={styles.section} accessibilityRole="header">
            Profile
          </Text>
          <TextField
            label="Name"
            value={draft.name}
            onChangeText={set('name')}
          />
          <TextField
            label="Headline (current role)"
            value={draft.headline}
            onChangeText={set('headline')}
          />
          <TextField
            label="Earlier roles through (year)"
            value={draft.earlierRolesThroughText}
            keyboardType="number-pad"
            maxLength={4}
            onChangeText={set('earlierRolesThroughText')}
          />
          <FieldHint>
            Roles that ended in or before this year are grouped as earlier
            roles. The PDF is regenerated on every Publish.
          </FieldHint>

          <Text style={styles.section} accessibilityRole="header">
            Summary
          </Text>
          <TextField
            label="Summary"
            value={draft.summary}
            multiline
            onChangeText={set('summary')}
          />

          <Text style={styles.section} accessibilityRole="header">
            Experience
          </Text>
          <Section>
            {draft.experience.map((row, index) => (
              <ContentRow
                key={row.id}
                title={roleTitle(row)}
                meta={roleMeta(row)}
                tags={experienceRangeError(row) ? ['Check dates'] : []}
                divider={index > 0}
                onPress={() => setRoleId(row.id)}
              />
            ))}
            <ListRow
              title="Add role"
              divider={draft.experience.length > 0}
              leading={<Icon name="plus" color={color.accent} />}
              onPress={() => {
                const added = emptyExperience();
                updateDraft((prev) => ({
                  ...prev,
                  experience: [...prev.experience, added],
                }));
                setRoleId(added.id);
              }}
            />
          </Section>
          <FieldHint>Open a role to edit, move or remove it.</FieldHint>

          <Text style={styles.section} accessibilityRole="header">
            Skills
          </Text>
          <TextField
            label="Core competencies (one per line)"
            value={draft.competenciesText}
            multiline
            onChangeText={set('competenciesText')}
          />
          <TextField
            label="Technical skills (one per line)"
            value={draft.skillsText}
            multiline
            onChangeText={set('skillsText')}
          />

          <Text style={styles.section} accessibilityRole="header">
            Education
          </Text>
          {draft.education.map((item, index) => {
            const n = index + 1;
            return (
              <View key={item.id} style={styles.entry}>
                {EDUCATION_FIELDS.map(([field, label]) => (
                  <TextField
                    key={field}
                    label={`${label}, entry ${n}`}
                    value={item[field]}
                    onChangeText={(value) =>
                      setEducation(item.id, { [field]: value })
                    }
                  />
                ))}
                <Section>
                  {index > 0 ? (
                    <ListRow
                      title={`Move entry ${n} up`}
                      onPress={() =>
                        updateDraft((prev) => ({
                          ...prev,
                          education: moved(prev.education, index, index - 1),
                        }))
                      }
                    />
                  ) : null}
                  <ListRow
                    title={`Remove entry ${n}`}
                    destructive
                    divider={index > 0}
                    onPress={() => void removeEducation(item, n)}
                  />
                </Section>
              </View>
            );
          })}
          <Section>
            <ListRow
              title="Add entry"
              leading={<Icon name="plus" color={color.accent} />}
              onPress={() =>
                updateDraft((prev) => ({
                  ...prev,
                  education: [...prev.education, emptyEducation()],
                }))
              }
            />
          </Section>

          <ResumeRoleSheet
            role={role}
            index={roleIndex}
            count={draft.experience.length}
            hasSavedDates={
              role ? content.savedDates(role, entity) !== null : false
            }
            onClose={() => setRoleId(null)}
            update={(patch) => role && setRole(role.id, patch)}
            onMove={(to) =>
              updateDraft((prev) => ({
                ...prev,
                experience: moved(prev.experience, roleIndex, to),
              }))
            }
            onRemove={() => {
              updateDraft((prev) => ({
                ...prev,
                experience: prev.experience.filter((row) => row.id !== roleId),
              }));
              setRoleId(null);
            }}
          />
        </>
      )}
    </ScrollView>
  );
};

export default ResumeScreen;

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: color.background },
  content: {
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[12],
    gap: tokens.space[2],
  },
  section: {
    ...font.semibold,
    fontSize: tokens.text.body,
    color: color.ink,
    paddingTop: tokens.space[4],
  },
  entry: { gap: tokens.space[2], paddingBottom: tokens.space[2] },
  error: {
    ...font.medium,
    fontSize: tokens.text.base,
    color: color.alert,
  },
  status: {
    ...font.regular,
    fontSize: tokens.text.base,
    color: color.inkSoft,
    textAlign: 'center',
    padding: tokens.space[6],
  },
});
