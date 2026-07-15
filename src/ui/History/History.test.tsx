import { render, screen } from '@testing-library/react';
import '../../i18n';
import { History } from './History';

describe('History', () => {
  it('shows both naming systems for every note, with no toggle (FR-7 deviation)', async () => {
    render(<History notes={[{ note: 70, start: 0, end: null }]} paused={false} />);
    expect(await screen.findByText('A♯4')).toBeInTheDocument();
    expect(screen.getByText('La♯4')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('lists newest first (FR-9)', async () => {
    render(
      <History
        notes={[{ note: 60, start: 0, end: 100 }, { note: 72, start: 20000, end: null }]}
        paused={false}
      />,
    );
    await screen.findByText('C5');
    const names = screen.getAllByTestId('history-en').map((el) => el.textContent);
    expect(names).toEqual(['C5', 'C4']);
  });

  it('renders nothing when no notes have been played', () => {
    render(<History notes={[]} paused={false} />);
    expect(screen.queryAllByTestId('history-en')).toHaveLength(0);
  });
});
