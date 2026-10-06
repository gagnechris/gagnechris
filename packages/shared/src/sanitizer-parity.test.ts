// @vitest-environment jsdom
import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { describe, expect, it } from 'vitest';
import { EVERY_MARKDOWN_ELEMENT } from './fixtures/every-markdown-element.js';
import { ALLOWED_TAGS } from './sanitize-policy.js';
import { sanitizeRenderedHtml as sanitizeInBrowser } from './sanitizer-browser.js';
import { sanitizeRenderedHtml as sanitizeOnServer } from './sanitizer-server.js';

/** The DOM a browser builds from `html`, attributes sorted, so equal markup compares equal. */
const dom = (html: string): string => {
  const template = document.createElement('template');
  template.innerHTML = html;
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return JSON.stringify(node.textContent);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return `#${node.nodeName}`;
    const el = node as Element;
    const attrs = [...el.attributes]
      .map((a) => `${a.name}=${JSON.stringify(a.value)}`)
      .sort()
      .join(' ');
    const children = [...el.childNodes].map(walk).join('');
    return `<${el.localName}${attrs ? ` ${attrs}` : ''}>${children}</>`;
  };
  return [...template.content.childNodes].map(walk).join('');
};

const marked = new Marked({ gfm: true, breaks: false });

const XSS_CASES = [
  '<script>alert(1)</script><p>after</p>',
  '<img src=x onerror=alert(1)>',
  '<img src="javascript:alert(1)" alt="a">',
  '<img src="data:image/png;base64,AAAA" alt="a">',
  '<img src="//evil.example/x.png" alt="a">',
  '<img src="/media/a.png" alt="" title="t" width="10" height="">',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href="java\tscript:alert(1)">x</a>',
  '<a href="&#106;avascript:alert(1)">x</a>',
  '<a href=" javascript:alert(1)">x</a>',
  '<a href="vbscript:msgbox(1)">x</a>',
  '<a href="data:text/html,<script>alert(1)</script>">x</a>',
  '<a href="//evil.example">x</a>',
  '<a href="\\\\evil.example">x</a>',
  '<a href="ftp://example.com/f">x</a>',
  '<a href="mailto:a@example.com">m</a> <a href="tel:+15555555555">t</a>',
  '<a href="/posts/a#b">rel</a> <a href="#top">anchor</a> <a href="">empty</a>',
  '<a href="https://example.com" target="_blank" rel="opener" name="n" title="t" onclick="x()">x</a>',
  '<p onmouseover="alert(1)" style="color:red" class="c" id="i">p</p>',
  '<div data-x="1" aria-label="l">d</div>',
  '<svg onload=alert(1)><circle r="1"></circle></svg>',
  '<math><mi xlink:href="javascript:alert(1)">m</mi></math>',
  '<iframe src="https://evil.example"></iframe>',
  '<object data="x.swf"></object><embed src="x.swf">',
  '<style>body{display:none}</style><p>s</p>',
  '<textarea><img src=x onerror=alert(1)></textarea>',
  '<select><option>o</option></select>',
  '<form action="javascript:alert(1)"><button formaction="javascript:alert(1)">b</button></form>',
  '<details open ontoggle=alert(1)><summary>s</summary>d</details>',
  '<base href="https://evil.example/"><link rel="stylesheet" href="x.css">',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '<template><script>alert(1)</script></template>',
  '<!-- a comment --><p>c</p>',
  '<input type="text" value="v"><input type="checkbox" checked onclick="x()"><input type="CHECKBOX">',
  '<code class="language-ts evil">c</code><code class="evil">e</code>',
  '<ol start="3" type="a"><li>i</li></ol>',
  '<table><tr><th align="center" style="x">h</th><td align="left" colspan="2">d</td></tr></table>',
  '<blink>b</blink><marquee>m</marquee><font color="red">f</font>',
  '<p>&lt;script&gt; &amp; "quotes" \'single\'</p>',
];

describe('browser sanitizer parity with the server sanitizer', () => {
  it('keeps the same tags as sanitize-html’s defaults plus markdown’s extras', () => {
    expect(new Set(ALLOWED_TAGS)).toEqual(
      new Set([...sanitizeHtml.defaults.allowedTags, 'img', 'input', 'del']),
    );
  });

  it('builds the same DOM from every markdown element', () => {
    const html = marked.parse(EVERY_MARKDOWN_ELEMENT, {
      async: false,
    }) as string;
    expect(html).toContain('<table>');
    expect(dom(sanitizeInBrowser(html))).toBe(dom(sanitizeOnServer(html)));
  });

  it('builds the same DOM from a captioned figure and label rows', () => {
    const html =
      '<figure><img src="https://gagnechris.com/a.jpg" alt="a"><figcaption>c</figcaption></figure>' +
      '<dl><div><dt><strong>Stack</strong></dt><dd>TypeScript</dd></div></dl>';
    expect(dom(sanitizeInBrowser(html))).toBe(dom(sanitizeOnServer(html)));
  });

  it.each(XSS_CASES)('builds the same DOM from %s', (html) => {
    expect(dom(sanitizeInBrowser(html))).toBe(dom(sanitizeOnServer(html)));
  });
});
