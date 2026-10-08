import { NOTEBOOK_AREA_STORAGE_KEY } from '@gagnechris/shared';
import { act } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import UpcomingScreen from '../app/(tabs)/upcoming/index';
import { memoryStore, Providers, render, byLabel } from '../test/render';
import { readStoredArea } from './area';

describe('area switch', () => {
  it('defaults to Work and ignores values it does not know', async () => {
    expect(await readStoredArea(memoryStore().store)).toBe('work');
    expect(
      await readStoredArea(
        memoryStore({ [NOTEBOOK_AREA_STORAGE_KEY]: 'home' }).store,
      ),
    ).toBe('work');
    const throwing = {
      getItem: async () => {
        throw new Error('locked');
      },
      setItem: async () => {},
    };
    expect(await readStoredArea(throwing)).toBe('work');
  });

  it('keeps the chosen area across a relaunch', async () => {
    const { store, data } = memoryStore();
    const first = await render(
      <Providers store={store}>
        <UpcomingScreen />
      </Providers>,
    );
    expect(byLabel(first, 'Work').props.accessibilityState).toEqual({
      selected: true,
    });

    await act(async () => {
      byLabel(first, 'Personal').props.onPress();
    });
    expect(data.get(NOTEBOOK_AREA_STORAGE_KEY)).toBe('personal');
    expect(byLabel(first, 'Personal').props.accessibilityState).toEqual({
      selected: true,
    });
    first.unmount();

    const relaunched = await render(
      <Providers store={store}>
        <UpcomingScreen />
      </Providers>,
    );
    expect(byLabel(relaunched, 'Personal').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(byLabel(relaunched, 'Work').props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it('uses the key the web app stores its area under', () => {
    expect(NOTEBOOK_AREA_STORAGE_KEY).toBe('gagnechris.notebook.areaFilter');
  });
});
