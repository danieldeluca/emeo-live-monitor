import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MidiAccessLike, MidiInputLike } from '../core/midi/types';
import { createSyntheticEnvironment } from '../dev/syntheticEmeo';
import '../i18n';
import { App } from './App';

function fakeInput(id: string, name: string): MidiInputLike {
  return { id, name, state: 'connected', onmidimessage: null };
}

describe('App', () => {
  it('shows Not connected on load, with a hint (§156)', () => {
    render(<App environment={createSyntheticEnvironment()} />);
    expect(screen.getByText('Not connected')).toBeInTheDocument();
    expect(screen.getByText(/Connect your EMEO/)).toBeInTheDocument();
  });

  it('connects to the synthetic instrument and reports it', async () => {
    render(<App environment={createSyntheticEnvironment()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('Connected to Synthetic EMEO')).toBeInTheDocument();
  });

  it('prompts the player to blow until the breath source is detected', async () => {
    render(<App environment={createSyntheticEnvironment()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText(/Blow into the EMEO/)).toBeInTheDocument();
  });

  it('toggles pause without disconnecting (design §7.5)', async () => {
    render(<App environment={createSyntheticEnvironment()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('Connected to Synthetic EMEO');
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.getByText('Connected to Synthetic EMEO')).toBeInTheDocument();
  });

  it('F1c: closes a note left sounding when the connection is lost, so it can be pruned instead of orphaned forever (FR-17)', async () => {
    const input = fakeInput('emeo', 'EMEO');
    const access: MidiAccessLike = { inputs: new Map([[input.id, input]]), onstatechange: null };
    const env = { isSecureContext: true, requestMIDIAccess: async () => access };

    // The App effect that closes open notes on disconnect stamps `end` with
    // performance.now(). Pin it so the cutoff arithmetic below is exact
    // regardless of how long the suite has been running.
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(2000);
    try {
      render(<App environment={env} />);
      await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
      await screen.findByText('Connected to EMEO');

      // A note starts sounding and never receives a note-off.
      input.onmidimessage!({ data: new Uint8Array([0x90, 60, 100]), timeStamp: 1000 });
      await screen.findByText('C4');

      // The cable is unplugged mid-note (FR-17).
      input.state = 'disconnected';
      act(() => access.onstatechange!({ port: input }));
      await screen.findByText(/Connection lost/);
      // The note is now closed at end = performance.now() = 2000 (mocked).

      // Reconnect, then let enough time pass (past the 60s note-history
      // cutoff, measured from the closed note's `end`) for it to be pruned.
      // That only happens if it actually received an `end`: an unclosed
      // note reads as `end ?? Infinity`, never satisfies the cutoff, and
      // would remain visible forever — the bug this finding fixes.
      input.state = 'connected';
      await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
      await screen.findByText('Connected to EMEO');

      input.onmidimessage!({
        data: new Uint8Array([0x90, 61, 100]),
        timeStamp: 2000 + 60_000 + 1,
      });

      await screen.findByText('C♯4');
      expect(screen.queryByText('C4')).not.toBeInTheDocument();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('F2: clears the stage even while paused (design §7.5)', async () => {
    render(<App environment={createSyntheticEnvironment()} synthetic />);
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('Connected to Synthetic EMEO');

    // The synthetic performance's first note-on fires at elapsed = 600ms.
    await waitFor(
      () => expect(screen.queryAllByTestId('history-en').length).toBeGreaterThan(0),
      { timeout: 2000 },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));

    // History empties even though the display is paused.
    await waitFor(() => expect(screen.queryAllByTestId('history-en')).toHaveLength(0));
    // Clear does not imply Resume — Pause and Clear are independent (§7.5).
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('F3: keeps breath detection alive through Clear — a placeholder, not the detect prompt (design §7.5)', async () => {
    render(<App environment={createSyntheticEnvironment()} synthetic />);
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('Connected to Synthetic EMEO');

    // Wait for the breath source to lock and the numeric readout to appear.
    await screen.findByText(/of 127/, {}, { timeout: 3000 });

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.queryByText(/Blow into the EMEO/)).not.toBeInTheDocument();
    expect(screen.getByTestId('breath-value')).toHaveTextContent('—');
    expect(screen.getByText(/of 127/)).toBeInTheDocument();
  });

  it('F4: freezes the breath readout while paused (design §7.5)', async () => {
    render(<App environment={createSyntheticEnvironment()} synthetic />);
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('Connected to Synthetic EMEO');
    await screen.findByText(/of 127/, {}, { timeout: 3000 });

    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const frozenText = screen.getByTestId('breath-value').textContent;

    // Breath keeps streaming from the synthetic instrument while paused, so
    // if the readout were not gated it would very likely change here.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    expect(screen.getByTestId('breath-value').textContent).toBe(frozenText);
  });
});

describe('App debug flag (F5)', () => {
  const originalUrl = `${window.location.pathname}${window.location.search}`;

  afterEach(() => {
    window.history.pushState(null, '', originalUrl);
  });

  it('exposes window.__emeoResetBreathDetection behind ?debug and cleans it up on unmount', () => {
    window.history.pushState(null, '', '/?debug');
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { unmount } = render(<App environment={createSyntheticEnvironment()} />);
    expect(typeof window.__emeoResetBreathDetection).toBe('function');

    unmount();
    expect(window.__emeoResetBreathDetection).toBeUndefined();

    infoSpy.mockRestore();
  });

  it('does not expose it without the debug flag', () => {
    window.history.pushState(null, '', '/');
    render(<App environment={createSyntheticEnvironment()} />);
    expect(window.__emeoResetBreathDetection).toBeUndefined();
  });
});
