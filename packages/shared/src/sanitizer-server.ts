import sanitizeHtml from 'sanitize-html';
import {
  ALLOWED_ATTRIBUTES,
  ALLOWED_TAGS,
  CODE_CLASS,
  DROP_CONTENT_TAGS,
  IMAGE_SCHEMES,
  isTaskCheckbox,
  LINK_SCHEMES,
  URL_ATTRIBUTES,
} from './sanitize-policy.js';

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...ALLOWED_TAGS],
  allowedAttributes: Object.fromEntries(
    Object.entries(ALLOWED_ATTRIBUTES).map(([tag, attrs]) => [tag, [...attrs]]),
  ),
  allowedClasses: { code: [CODE_CLASS] },
  allowedSchemes: [...LINK_SCHEMES],
  allowedSchemesByTag: { img: [...IMAGE_SCHEMES] },
  allowedSchemesAppliedToAttributes: [...URL_ATTRIBUTES],
  allowProtocolRelative: false,
  nonTextTags: [...DROP_CONTENT_TAGS],
  exclusiveFilter: (frame) =>
    frame.tag === 'input' && !isTaskCheckbox(frame.attribs.type),
  transformTags: {
    input: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, disabled: '' },
    }),
  },
};

/** The publisher and API sanitizer; the browser build resolves `#sanitizer` to sanitizer-browser.ts. */
export const sanitizeRenderedHtml = (html: string): string =>
  sanitizeHtml(html, SANITIZE_OPTIONS);
