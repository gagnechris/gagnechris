import { expect } from 'vitest';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { Excerpt } from '../src/ui/Excerpt';
import { MIN_TARGET } from '../src/theme';

const flatStyle = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatStyle))
    : style && typeof style === 'object'
      ? (style as Record<string, unknown>)
      : {};

const hosts = (renderer: ReactTestRenderer, type: string) =>
  renderer.root.findAll((node) => node.type === type);

const verticalSlop = (hitSlop: unknown) =>
  typeof hitSlop === 'number'
    ? hitSlop * 2
    : hitSlop && typeof hitSlop === 'object'
      ? ((hitSlop as { top?: number }).top ?? 0) +
        ((hitSlop as { bottom?: number }).bottom ?? 0)
      : 0;

/** The nearest component above a host element, skipping the host wrappers. */
const owner = (node: ReactTestInstance) => {
  let parent = node.parent;
  while (
    parent &&
    (typeof parent.type === 'string' || parent.type === node.parent?.type)
  ) {
    parent = parent.parent;
  }
  return parent?.type;
};

const CONTROLS = new Set(['Pressable', 'Switch', 'TextInput']);

/** Read by VoiceOver as one element, which hides the elements inside it. */
const isElement = (node: ReactTestInstance) =>
  (node.type as string) === 'Pressable'
    ? node.props.accessible !== false
    : typeof node.type === 'string' && node.props.accessible === true;

/** The element offers the control's job as a VoiceOver action of its own. */
const offers = (element: ReactTestInstance, control: ReactTestInstance) =>
  ((element.props.accessibilityActions ?? []) as { label?: string }[]).some(
    (action) => action.label === control.props.accessibilityLabel,
  );

/** No control hides inside another element, where VoiceOver can't reach it. */
export function expectReachable(renderer: ReactTestRenderer) {
  const controls = renderer.root.findAll(
    (node) =>
      typeof node.type === 'string' &&
      CONTROLS.has(node.type) &&
      node.props.accessible !== false &&
      !(node.props.disabled && !node.props.accessibilityRole),
  );
  for (const control of controls) {
    for (let up = control.parent; up; up = up.parent) {
      if (!isElement(up) || offers(up, control)) continue;
      expect.fail(
        `${String(control.type)} "${String(control.props.accessibilityLabel)}" sits inside "${String(up.props.accessibilityLabel)}", so VoiceOver can't reach it`,
      );
    }
  }
}

/** What VoiceOver and Dynamic Type need from every screen. */
export function expectAccessible(renderer: ReactTestRenderer) {
  expectReachable(renderer);
  for (const pressable of hosts(renderer, 'Pressable')) {
    if (pressable.props.disabled && !pressable.props.accessibilityRole)
      continue;
    // A touch area around a field VoiceOver reaches on its own.
    if (pressable.props.accessible === false) continue;
    const name = String(pressable.props.accessibilityLabel);
    expect(pressable.props.accessibilityLabel, 'labelled control').toEqual(
      expect.any(String),
    );
    expect(pressable.props.accessibilityRole, `${name}: role`).toMatch(
      /^(button|tab|checkbox|link)$/,
    );
    const style = flatStyle(pressable.props.style);
    const height = Number(style.minHeight ?? style.height ?? 0);
    expect(
      height + verticalSlop(pressable.props.hitSlop),
      `${name}: target height`,
    ).toBeGreaterThanOrEqual(MIN_TARGET);
  }
  for (const input of hosts(renderer, 'TextInput')) {
    expect(input.props.accessibilityLabel, 'labelled field').toEqual(
      expect.any(String),
    );
  }
  for (const text of hosts(renderer, 'Text')) {
    // A line cap or a scaling cap is what clips text at XXL; only an excerpt
    // of longer text may stop early.
    if (text.props.numberOfLines !== undefined) {
      expect(owner(text), `capped text: ${String(text.props.children)}`).toBe(
        Excerpt,
      );
    }
    expect(text.props.allowFontScaling).not.toBe(false);
    expect(text.props.maxFontSizeMultiplier).toBeUndefined();
    const style = flatStyle(text.props.style);
    expect(style.height, 'fixed text height').toBeUndefined();
  }
  for (const icon of hosts(renderer, 'SymbolView')) {
    expect(icon.props.accessible).toBe(false);
  }
}
