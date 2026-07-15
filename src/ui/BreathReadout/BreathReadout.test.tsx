import { render, screen } from '@testing-library/react';
import '../../i18n';
import { BreathReadout } from './BreathReadout';

describe('BreathReadout', () => {
  it('prompts the player to blow while detecting', () => {
    render(<BreathReadout detecting value={null} />);
    expect(screen.getByText(/Blow into the EMEO/)).toBeInTheDocument();
  });

  it('shows the live value once detected', () => {
    render(<BreathReadout detecting={false} value={64} />);
    expect(screen.getByTestId('breath-value')).toHaveTextContent('64');
    expect(screen.getByText(/of 127/)).toBeInTheDocument();
  });

  it('F3: shows a placeholder instead of the detect prompt when value is null but detection already happened', () => {
    render(<BreathReadout detecting={false} value={null} />);
    expect(screen.queryByText(/Blow into the EMEO/)).not.toBeInTheDocument();
    expect(screen.getByTestId('breath-value')).toHaveTextContent('—');
    expect(screen.getByText(/of 127/)).toBeInTheDocument();
  });
});
