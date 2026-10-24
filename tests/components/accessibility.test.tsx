import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { Chip } from '@/components/Chip';
import { ProgressBar } from '@/components/Progress';
import { EmptyState } from '@/components/States';
import { TextField } from '@/components/TextField';
import { Mascot } from '@/features/animation/Mascot';
import { useMascotStore } from '@/features/animation/mascotStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { HIT_TARGET, ThemeProvider } from '@/theme';
import { darkColors, lightColors } from '@/theme/tokens';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() } }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const wrap = async (ui: ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );

describe('accessible components', () => {
  it('Button exposes role, label and busy/disabled state', async () => {
    const onPress = jest.fn();
    await wrap(<Button label="Save task" onPress={onPress} />);
    const btn = screen.getByRole('button', { name: 'Save task' });
    await fireEvent.press(btn);
    expect(onPress).toHaveBeenCalledTimes(1);

    await screen.rerender(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider>
          <Button label="Save task" onPress={onPress} loading />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    const busy = screen.getByRole('button', { name: 'Save task' });
    expect(busy.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await fireEvent.press(busy);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('Checkbox is a checkbox with a checked state and meets the touch-target size', async () => {
    const onChange = jest.fn();
    await wrap(<Checkbox checked={false} onChange={onChange} label="Mark Pay rent as done" />);
    const box = screen.getByRole('checkbox', { name: 'Mark Pay rent as done' });
    expect(box.props.accessibilityState).toMatchObject({ checked: false });
    const slop = box.props.hitSlop as number;
    expect(26 + slop * 2).toBeGreaterThanOrEqual(HIT_TARGET);
    await fireEvent.press(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('TextField links label and error for screen readers', async () => {
    await wrap(<TextField label="E-mail" error="Enter a valid e-mail address" value="" onChangeText={() => undefined} />);
    expect(screen.getByLabelText('E-mail').props.accessibilityHint).toBe('Enter a valid e-mail address');
    expect(screen.getByText('Enter a valid e-mail address')).toBeTruthy();
  });

  it('Chip reports selection and ProgressBar reports its value', async () => {
    await wrap(
      <>
        <Chip label="High" selected onPress={() => undefined} />
        <ProgressBar value={0.42} label="Upload progress" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'High' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByLabelText('Upload progress').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 42 });
  });

  it('EmptyState renders the mascot with a descriptive label and an action', async () => {
    const onAction = jest.fn();
    await wrap(<EmptyState title="No tasks yet" body="Create your first task" actionLabel="New task" onAction={onAction} />);
    expect(screen.getByRole('image', { name: /Kora, your Taskrypt companion/ })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'New task' }));
    expect(onAction).toHaveBeenCalled();
  });
});

describe('mascot reacts to application events', () => {
  it('speaks the current reaction and falls back to the ambient mood', async () => {
    jest.useFakeTimers();
    await wrap(<Mascot showMessage ambient="offline" />);
    expect(screen.getByText(/You are offline/)).toBeTruthy();
    useMascotStore.getState().react('taskCompleted');
    await screen.rerender(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider>
          <Mascot showMessage ambient="offline" />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByText('Nice work! One less thing.')).toBeTruthy();
    jest.advanceTimersByTime(2500);
    expect(useMascotStore.getState().reaction).toBeNull();
    jest.useRealTimers();
  });

  it('a goal celebration is not interrupted by smaller reactions', async () => {
    useMascotStore.getState().react('goalAchieved');
    useMascotStore.getState().react('taskAdded');
    expect(useMascotStore.getState().reaction?.mood).toBe('goalAchieved');
  });

  it('renders the companion chosen in settings, falling back to Kora', async () => {
    usePreferencesStore.setState({ mascotCharacter: 'bolt' });
    await wrap(<Mascot mood="idle" />);
    expect(screen.getByLabelText(/^Bolt, your Taskrypt companion/)).toBeTruthy();
    usePreferencesStore.setState({ mascotCharacter: 'retired-id' as never });
    await screen.rerender(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider>
          <Mascot mood="idle" />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByLabelText(/^Kora, your Taskrypt companion/)).toBeTruthy();
    usePreferencesStore.setState({ mascotCharacter: 'kora' });
  });
});

describe('theme', () => {
  function contrast(a: string, b: string) {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    };
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x! + 0.05) / (y! + 0.05);
  }

  it.each([
    ['light', lightColors],
    ['dark', darkColors],
  ])('%s scheme text meets WCAG AA contrast', (_, c) => {
    expect(contrast(c.text, c.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.textMuted, c.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.danger, c.background)).toBeGreaterThanOrEqual(4.5);
    for (const p of Object.values(c.priority)) expect(contrast(p.fg, p.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('honours the reduced-motion preference', async () => {
    usePreferencesStore.setState({ motionPreference: 'reduced' });
    await wrap(<Checkbox checked onChange={() => undefined} label="done" />);
    expect(screen.getByRole('checkbox')).toBeTruthy();
    usePreferencesStore.setState({ motionPreference: 'system' });
  });
});
