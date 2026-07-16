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

describe('App breath divergence (Task V7, design §15)', () => {
  // Stage is the sole owner of "are we split" (design §15.1, Task V7 fix):
  // it derives the split window from the canvas's real height via
  // visibleWindowMs. jsdom has no layout engine, so an unmocked canvas
  // always reports getBoundingClientRect() = 0×0, which would make that
  // window permanently 0 and Stage's split would never go true in these
  // tests. Give it a small but genuine, non-zero size instead — 60px tall
  // yields a real ~900ms window (visibleWindowMs's own formula: height ×
  // (1 − nowLineFraction) / pxPerMs = 60 × 0.9 / 0.06), so these tests
  // exercise the real shared mechanism rather than special-casing it away.
  let rectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    rectSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(DOMRect.fromRect({ width: 300, height: 60 }));
  });

  afterEach(() => {
    rectSpy.mockRestore();
  });

  it('shows a single collapsed value and no split rows when the controllers agree (default synthetic)', async () => {
    render(<App environment={createSyntheticEnvironment()} synthetic />);
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('Connected to Synthetic EMEO');

    await screen.findByText(/of 127/, {}, { timeout: 3000 });

    expect(screen.queryByText('Expression (CC11)')).not.toBeInTheDocument();
    expect(screen.queryByText('Volume (CC7)')).not.toBeInTheDocument();
  });

  it('splits into three colour-matched, labelled rows when the controllers diverge (?diverge)', async () => {
    render(<App environment={createSyntheticEnvironment({ diverge: true })} synthetic />);
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('Connected to Synthetic EMEO');

    expect(await screen.findByText('Breath (CC2)', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('Expression (CC11)')).toBeInTheDocument();
    expect(screen.getByText('Volume (CC7)')).toBeInTheDocument();
    // The collapsed single-value view is not also rendered alongside the split rows.
    expect(screen.queryByTestId('breath-value')).not.toBeInTheDocument();
  });

  it("collapses the split readout back to a single value once the divergence scrolls off the graph's visible window", async () => {
    // Task V7 fix: the readout no longer judges "still split" against its
    // own fixed constant — it just reads Stage's splitRef, and Stage's split
    // is real: `now` is a real performance.now() read inside its rAF loop,
    // compared against real event timestamps (design §6 — MIDI timestamps
    // share the performance.now() epoch). So proving the collapse now means
    // letting real wall-clock time actually pass the (mocked-small, see
    // `beforeEach` above) window, rather than scripting a fixed-offset jump
    // the way the old READOUT_WINDOW_MS-based version of this test did.
    // Event *timestamps* are still hand-scripted (same fake-input technique
    // as the F1c test above) so qualification/divergence stay deterministic;
    // only the collapse itself is driven by a real, awaited delay.
    const input = fakeInput('emeo', 'EMEO');
    const access: MidiAccessLike = { inputs: new Map([[input.id, input]]), onstatechange: null };
    const env = { isSecureContext: true, requestMIDIAccess: async () => access };

    render(<App environment={env} />);
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('Connected to EMEO');

    // Anchored to real performance.now(), like the real MIDI timestamps and
    // the synthetic instrument (see syntheticEmeo.ts) both are — Stage reads
    // real performance.now() as "now", so its split decision only makes
    // sense measured against the same clock.
    const origin = performance.now();
    const send = (offsetMs: number, controller: number, value: number) => {
      act(() => {
        input.onmidimessage!({
          data: new Uint8Array([0xb0, controller, value]),
          timeStamp: origin + offsetMs,
        });
      });
    };

    // Qualify CC2/CC11/CC7 as breath sources (design §8: >=20 updates, >=8
    // distinct values, range >=32, inside a rolling 3s window) with an
    // identical sweep across all three, matching the real instrument's habit
    // of mirroring breath onto all three at once. 10ms steps (as the real
    // instrument uses) also matter here for a second reason: the readout is
    // itself throttled to ~83ms (READOUT_HZ) in event-time, so steps need to
    // be spaced widely enough to actually cross that throttle more than
    // once — 1ms steps would let only the very first published sample ever
    // update the readout. The whole sequence's ~350ms synthetic-offset span
    // is still tiny next to the real ~900ms window being tested below.
    let offset = 0;
    for (let i = 0; i < 25; i++) {
      const value = 10 + i * 4; // 25 distinct values, range 96
      send(offset, 2, value);
      send(offset, 11, value);
      send(offset, 7, value);
      offset += 10;
    }

    // One diverging frame: spread 80 > tolerance 2.
    send(offset, 2, 64);
    send(offset, 11, 20);
    send(offset, 7, 100);
    offset += 10;

    // A frame is only evaluated once the *next* frame's first sample
    // arrives (design §15.1) — send a run of identical follow-up frames,
    // which also gives the throttled readout room to catch up to split.
    for (let i = 0; i < 10; i++) {
      send(offset, 2, 64);
      send(offset, 11, 64);
      send(offset, 7, 64);
      offset += 10;
    }

    // Everything above ran synchronously, in one burst, with no yield to the
    // event loop — so Stage's rAF loop (a real requestAnimationFrame, distinct
    // from this synchronous script) has not had a chance to run even once yet,
    // and its splitRef is still at its initial `false`. Yield briefly so it
    // does, picking up the now-diverged divergenceRef.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // The readout only recomputes inside the breath-event handler (design
    // §15.1) — it does not poll splitRef on its own — so one more sample is
    // needed now that Stage has actually caught up, to make the readout
    // observe the split it already has.
    offset += 500;
    send(offset, 2, 64);
    send(offset, 11, 64);
    send(offset, 7, 64);

    expect(await screen.findByText('Expression (CC11)')).toBeInTheDocument();

    // Let real time actually pass Stage's real (mocked-small, ~900ms)
    // visible window with no further divergence — this is what makes
    // Stage's own splitRef go false, honestly, rather than a scripted jump.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1300));
    });

    // A final non-diverging sample lets the throttled readout catch up to
    // Stage's now-collapsed split state (the readout only updates inside the
    // breath-event handler, per design §15.1).
    send(offset + 10_000, 2, 64);
    send(offset + 10_000, 11, 64);
    send(offset + 10_000, 7, 64);

    expect(screen.queryByText('Expression (CC11)')).not.toBeInTheDocument();
    expect(screen.getByTestId('breath-value')).toBeInTheDocument();
  });

  it('still freezes the readout while paused, and still does not re-show the detect prompt after Clear, with multiple tracked series', async () => {
    render(<App environment={createSyntheticEnvironment({ diverge: true })} synthetic />);
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('Connected to Synthetic EMEO');
    await screen.findByText('Expression (CC11)', {}, { timeout: 5000 });

    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const frozenRows = screen.getAllByTestId('breath-split-value').map((el) => el.textContent);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    expect(screen.getAllByTestId('breath-split-value').map((el) => el.textContent)).toEqual(
      frozenRows,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText(/Blow into the EMEO/)).not.toBeInTheDocument();
  });

  it('collapses the split readout back to a single value when Clear is clicked (Task V7 gap)', async () => {
    render(<App environment={createSyntheticEnvironment({ diverge: true })} synthetic />);
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('Connected to Synthetic EMEO');

    // Wait for the split readout to appear. The diverge test's timing works because
    // the synthetic instrument pushes the controllers apart enough to trigger split.
    await screen.findByText('Expression (CC11)', {}, { timeout: 5000 });
    expect(screen.getByText('Volume (CC7)')).toBeInTheDocument();

    // Split rows are visible, single collapsed view is hidden.
    expect(screen.queryByTestId('breath-value')).not.toBeInTheDocument();

    // Click Clear.
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));

    // Split rows must be gone.
    expect(screen.queryByText('Expression (CC11)')).not.toBeInTheDocument();
    expect(screen.queryByText('Volume (CC7)')).not.toBeInTheDocument();

    // Collapsed single form is back. After clear with no new data,
    // clear() set readout to {kind:'single', value:null}, so BreathReadout
    // renders either the single-value element or a placeholder.
    // F3 test asserts the breath-value element shows "—".
    expect(screen.getByTestId('breath-value')).toBeInTheDocument();
    expect(screen.getByTestId('breath-value')).toHaveTextContent('—');

    // Detection survives Clear (design §7.5) — no re-detect prompt.
    expect(screen.queryByText(/Blow into the EMEO/)).not.toBeInTheDocument();
  });
});
