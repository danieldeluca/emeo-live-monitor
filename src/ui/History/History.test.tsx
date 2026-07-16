import { act, render, screen } from '@testing-library/react';
import '../../i18n';
import { History } from './History';

describe('History', () => {
  it('shows both naming systems for every note, with no toggle (FR-7 deviation)', async () => {
    render(
      <History notes={[{ note: 70, start: 0, end: null }]} paused={false} contentToken={0} />,
    );
    expect(await screen.findByText('A♯4')).toBeInTheDocument();
    expect(screen.getByText('La♯4')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('lists newest first (FR-9)', async () => {
    render(
      <History
        notes={[{ note: 60, start: 0, end: 100 }, { note: 72, start: 20000, end: null }]}
        paused={false}
        contentToken={0}
      />,
    );
    await screen.findByText('C5');
    const names = screen.getAllByTestId('history-en').map((el) => el.textContent);
    expect(names).toEqual(['C5', 'C4']);
  });

  it('renders nothing when no notes have been played', () => {
    render(<History notes={[]} paused={false} contentToken={0} />);
    expect(screen.queryAllByTestId('history-en')).toHaveLength(0);
  });

  it('detects an append+prune that leaves length unchanged (steady state)', async () => {
    // Regression test: once the 60s history window is full, every note-on
    // prunes roughly one old note, so `notes.length` stops changing even
    // though the visible set genuinely changes. `History` must still notice.
    const notes = [
      { note: 60, start: 0, end: 100 },
      { note: 62, start: 20000, end: null },
    ];
    render(<History notes={notes} paused={false} contentToken={0} />);
    await screen.findByText('C4');
    expect(screen.getByText('D4')).toBeInTheDocument();

    // Let the rAF loop's first pass settle (it establishes its own baseline
    // length/start on the very first tick after mount) before mutating, so
    // the mutation below is what the component must react to, not the mount.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Simulate one note-on plus one prune, in place: length is unchanged
    // (2 -> 2), but the newest `start` moves from 20000 to 40000. The gap
    // to the surviving note is 20000ms * 0.06 px/ms = 1200px, far past the
    // 26px MIN_SPACING_PX collision threshold, so the label is never dropped
    // for spacing reasons.
    notes.shift();
    notes.push({ note: 64, start: 40000, end: null });

    expect(await screen.findByText('E4')).toBeInTheDocument();
    expect(screen.queryByText('C4')).not.toBeInTheDocument();
  });
});
