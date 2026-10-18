import {
  RESUME_UNAVAILABLE_TEXT,
  SITE_LINKEDIN_URL,
  type ResumeRoleView,
  type ResumeView,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { openMarkdownLink } from '../../../src/markdown/links';
import { useSiteResume } from '../../../src/site/feed';
import { shareResumePdf, viewResumePdf } from '../../../src/site/resumePdf';
import {
  Card,
  LoadError,
  siteStyles,
  usePullToRefresh,
} from '../../../src/site/ui';
import { color, font, MIN_TARGET } from '../../../src/theme';
import { Button } from '../../../src/ui/Button';
import { showError } from '../../../src/ui/confirm';
import { PressArea } from '../../../src/ui/PressArea';
import { Screen } from '../../../src/ui/Screen';
import { SectionTitle } from '../../../src/ui/Section';

const Section = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <View style={styles.section}>
    <SectionTitle title={label} />
    <Card>{children}</Card>
  </View>
);

const roleHeading = ({ title, company }: ResumeRoleView) =>
  company ? `${title} at ${company}` : title;

const Role = ({ role, full }: { role: ResumeRoleView; full: boolean }) => (
  <View style={styles.role}>
    <Text style={styles.dates}>
      {role.note ? `${role.dates} · ${role.note}` : role.dates}
    </Text>
    <Text style={styles.roleTitle}>{roleHeading(role)}</Text>
    {full
      ? role.bullets.map((bullet, i) => (
          <View key={i} style={styles.bullet}>
            <Text style={siteStyles.body} accessible={false}>
              •
            </Text>
            <Text style={[siteStyles.body, styles.bulletText]}>{bullet}</Text>
          </View>
        ))
      : null}
  </View>
);

const Experience = ({ view }: { view: ResumeView }) => {
  const [earlierOpen, setEarlierOpen] = useState(false);
  const earlier = view.roles.filter((role) => role.earlier);
  return (
    <Section label={view.labels.experience}>
      {view.roles
        .filter((role) => !role.earlier)
        .map((role, i) => (
          <Role key={i} role={role} full />
        ))}
      {view.earlierLabel ? (
        <>
          <PressArea
            accessibilityLabel={view.earlierLabel}
            accessibilityHint={earlierOpen ? 'Hides details' : 'Shows details'}
            accessibilityState={{ expanded: earlierOpen }}
            onPress={() => setEarlierOpen((open) => !open)}
            style={styles.earlierToggle}
          >
            <Text style={styles.earlierLabel}>{view.earlierLabel}</Text>
            <Text style={siteStyles.link}>
              {earlierOpen ? 'Hide details' : 'Show details'}
            </Text>
          </PressArea>
          {earlier.map((role, i) => (
            <Role key={i} role={role} full={earlierOpen} />
          ))}
        </>
      ) : null}
    </Section>
  );
};

const SiteResumeScreen = () => {
  const resume = useSiteResume();
  const refresh = usePullToRefresh(() => resume.refetch());
  const [sharing, setSharing] = useState(false);
  const data = resume.data;

  const share = async (pdfPath: string) => {
    setSharing(true);
    try {
      await shareResumePdf(pdfPath);
    } catch {
      showError(
        'Couldn’t share the PDF',
        'Check your connection and try again.',
      );
    } finally {
      setSharing(false);
    }
  };

  return (
    <Screen refreshControl={refresh}>
      {resume.isError && !data ? <LoadError what="the resume" /> : null}
      {data && !data.available ? (
        <Text style={siteStyles.body}>{RESUME_UNAVAILABLE_TEXT}</Text>
      ) : null}
      {data?.available ? (
        <>
          <View style={styles.intro}>
            {data.headline ? (
              <Text style={styles.headline}>{data.headline}</Text>
            ) : null}
            <Text style={siteStyles.body}>{data.summary}</Text>
          </View>
          <View style={styles.actions}>
            <Button
              variant="primary"
              disabled={sharing}
              onPress={() => void share(data.pdfPath)}
            >
              Share PDF
            </Button>
            <Button onPress={() => void viewResumePdf(data.pdfPath)}>
              View PDF
            </Button>
          </View>
          <Button
            accessibilityHint="Opens in Safari"
            onPress={() => void openMarkdownLink(SITE_LINKEDIN_URL)}
          >
            LinkedIn
          </Button>
          <Experience view={data.view} />
          {data.view.competencies.length || data.view.skills.length ? (
            <Section label={data.view.labels.skills}>
              {data.view.competencies.length ? (
                <Text style={siteStyles.body}>
                  {data.view.competencies.join(' · ')}
                </Text>
              ) : null}
              {data.view.skills.map(({ label, value }, i) => (
                <Text key={i} style={siteStyles.body}>
                  {label ? (
                    <Text style={styles.skillLabel}>{`${label}: `}</Text>
                  ) : null}
                  {value}
                </Text>
              ))}
            </Section>
          ) : null}
          {data.view.education.length ? (
            <Section label={data.view.labels.education}>
              {data.view.education.map(({ year, title, place }, i) => (
                <View key={i} style={styles.role}>
                  <Text style={styles.dates}>{year}</Text>
                  <Text style={styles.roleTitle}>{title}</Text>
                  {place ? <Text style={siteStyles.muted}>{place}</Text> : null}
                </View>
              ))}
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
};

export default SiteResumeScreen;

const styles = StyleSheet.create({
  intro: { gap: tokens.space[2] },
  headline: {
    ...font.semibold,
    fontSize: tokens.text.lg,
    color: color.ink,
  },
  actions: { flexDirection: 'row', gap: tokens.space[3] },
  section: { gap: tokens.space[2] },
  role: { gap: tokens.space[1] },
  dates: {
    ...font.medium,
    fontSize: tokens.text.caption,
    color: color.muted,
  },
  roleTitle: {
    ...font.semibold,
    fontSize: tokens.text.body,
    lineHeight: 24,
    color: color.ink,
  },
  bullet: { flexDirection: 'row', gap: tokens.space[2] },
  bulletText: { flex: 1 },
  earlierToggle: {
    minHeight: MIN_TARGET,
    justifyContent: 'center',
    gap: tokens.space[1],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
    paddingTop: tokens.space[2],
  },
  earlierLabel: {
    ...font.semibold,
    fontSize: tokens.text.base,
    color: color.inkSoft,
  },
  skillLabel: { ...font.semibold },
});
