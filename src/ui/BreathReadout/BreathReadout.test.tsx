import { render, screen } from '@testing-library/react';
import '../../i18n';
import { BreathReadout } from './BreathReadout';

describe('BreathReadout', () => {
  it('prompts the player to blow while detecting', () => {
    render(<BreathReadout detecting readout={{ kind: 'single', value: null }} />);
    expect(screen.getByText(/Blow into the EMEO/)).toBeInTheDocument();
  });

  it('shows the live value once detected', () => {
    render(<BreathReadout detecting={false} readout={{ kind: 'single', value: 64 }} />);
    expect(screen.getByTestId('breath-value')).toHaveTextContent('64');
    expect(screen.getByText(/of 127/)).toBeInTheDocument();
  });

  it('F3: shows a placeholder instead of the detect prompt when value is null but detection already happened', () => {
    render(<BreathReadout detecting={false} readout={{ kind: 'single', value: null }} />);
    expect(screen.queryByText(/Blow into the EMEO/)).not.toBeInTheDocument();
    expect(screen.getByTestId('breath-value')).toHaveTextContent('—');
    expect(screen.getByText(/of 127/)).toBeInTheDocument();
  });

  it('renders a stacked, colour-matched row per series when split (design §15)', () => {
    render(
      <BreathReadout
        detecting={false}
        readout={{
          kind: 'split',
          rows: [
            { label: 'Breath (CC2)', colorVar: '--color-breath', value: 87 },
            { label: 'Expression (CC11)', colorVar: '--color-expression', value: 62 },
            { label: 'Volume (CC7)', colorVar: '--color-volume', value: 74 },
          ],
        }}
      />,
    );

    expect(screen.getByText('Breath (CC2)')).toBeInTheDocument();
    expect(screen.getByText('Expression (CC11)')).toBeInTheDocument();
    expect(screen.getByText('Volume (CC7)')).toBeInTheDocument();

    const values = screen.getAllByTestId('breath-split-value').map((el) => el.textContent);
    expect(values).toEqual(['87', '62', '74']);

    // The collapsed single-value view must not also be present.
    expect(screen.queryByTestId('breath-value')).not.toBeInTheDocument();
  });

  it('colours each split row to match its series (data-driven colour, per design §15.2)', () => {
    render(
      <BreathReadout
        detecting={false}
        readout={{
          kind: 'split',
          rows: [{ label: 'Expression (CC11)', colorVar: '--color-expression', value: 62 }],
        }}
      />,
    );

    const row = screen.getByText('Expression (CC11)').closest('li');
    expect(row).toHaveStyle({ color: 'var(--color-expression)' });
  });
});
