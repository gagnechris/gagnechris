import { describe, expect, test } from 'vitest';
import { DEFAULT_RESUME, projectPageView } from '@gagnechris/shared/render';
import {
  renderProjectPageBodyHtml,
  renderProjectsIndexBodyHtml,
  renderResumeBodyHtml,
} from '@gagnechris/public-ui/server';
import { SAMPLE_PROJECTS } from '@gagnechris/shared/fixtures/sample-projects';
import { projectPageViewFromDocument } from '../projects/publishedProject';
import { projectsIndexFromDocument } from '../projects/publishedProjects';
import { resumeViewFromDocument } from '../resume/publishedResume';

const parse = (html: string) =>
  new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

/** The markup published before each page body became one `<main>`. */
const legacy = (html: string, outer: string, inner: string) =>
  html
    .replace(`<main class="${outer}`, `<div class="${outer}`)
    .replace(/<\/main>$/, '</div>')
    .replace(inner, inner.replace('<div', '<main'))
    .replace(/<\/div>(<\/div>)$/, '</main>$1');

describe('pages published before the <main> rule still parse until republished', () => {
  test('projects index', () => {
    const html = renderProjectsIndexBodyHtml(SAMPLE_PROJECTS);
    const old = legacy(
      html,
      'projects-index',
      '<div class="projects-index__list">',
    );
    expect(old).toContain('<div class="projects-index"');
    expect(old).toMatch(/<main class="projects-index__list"><ul/);
    expect(projectsIndexFromDocument(parse(old))).toEqual(
      projectsIndexFromDocument(parse(html)),
    );
    expect(projectsIndexFromDocument(parse(html))).not.toHaveLength(0);
  });

  test('project page', () => {
    const html = renderProjectPageBodyHtml(
      projectPageView(SAMPLE_PROJECTS[0]!, []),
    );
    const old = legacy(html, 'project-page', '<div class="project-main">');
    expect(old).toMatch(/^<div class="project-page"/);
    expect(old).toContain('<main class="project-main">');
    expect(projectPageViewFromDocument(parse(old))).toEqual(
      projectPageViewFromDocument(parse(html)),
    );
    expect(projectPageViewFromDocument(parse(html))).not.toBeNull();
  });

  test('resume', () => {
    const html = renderResumeBodyHtml(DEFAULT_RESUME);
    const old = legacy(html, 'resume-page', '<div class="resume-body">');
    expect(old).toMatch(/^<div class="resume-page/);
    expect(old).toContain('<main class="resume-body">');
    expect(resumeViewFromDocument(parse(old))).toEqual(
      resumeViewFromDocument(parse(html)),
    );
    expect(resumeViewFromDocument(parse(html))).not.toBeNull();
  });
});
