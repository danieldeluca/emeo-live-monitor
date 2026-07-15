import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createSyntheticEnvironment } from '../dev/syntheticEmeo';
import '../i18n';
import { App } from './App';

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
});
