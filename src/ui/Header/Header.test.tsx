import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../i18n';
import { Header } from './Header';

const noop = () => {};

// `ComponentProps` is imported as a type: under the modern JSX transform there
// is no `React` binding in scope, and TypeScript rejects the UMD global here.
function renderHeader(props: Partial<ComponentProps<typeof Header>> = {}) {
  return render(
    <Header
      state={{ status: 'idle' }}
      onConnect={noop}
      onDisconnect={noop}
      onChoosePort={noop}
      paused={false}
      onTogglePause={noop}
      onClear={noop}
      {...props}
    />,
  );
}

describe('Header', () => {
  it('shows the connection state at all times (FR-2)', () => {
    renderHeader();
    expect(screen.getByText('Not connected')).toBeInTheDocument();
  });

  it('names the connected port', () => {
    renderHeader({ state: { status: 'connected', port: { id: 'a', name: 'EMEO' } } });
    expect(screen.getByText('Connected to EMEO')).toBeInTheDocument();
  });

  it('offers Connect when idle and Disconnect when connected (FR-1, FR-3)', async () => {
    const onConnect = vi.fn();
    const { rerender } = renderHeader({ onConnect });
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onConnect).toHaveBeenCalled();

    rerender(
      <Header
        state={{ status: 'connected', port: { id: 'a', name: 'EMEO' } }}
        onConnect={noop} onDisconnect={noop} onChoosePort={noop}
        paused={false} onTogglePause={noop} onClear={noop}
      />,
    );
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });

  it('lets the user pick between several instruments (FR-4)', async () => {
    const onChoosePort = vi.fn();
    renderHeader({
      state: { status: 'choosing', ports: [{ id: 'a', name: 'EMEO' }, { id: 'b', name: 'Other' }] },
      onChoosePort,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Other' }));
    expect(onChoosePort).toHaveBeenCalledWith('b');
  });

  it('explains an insecure context in plain language (FR-5)', () => {
    renderHeader({ state: { status: 'unsupported', reason: 'insecure-context' } });
    expect(screen.getByText(/HTTPS/)).toBeInTheDocument();
  });

  it('toggles pause and clears (FR-15)', async () => {
    const onTogglePause = vi.fn();
    const onClear = vi.fn();
    renderHeader({ onTogglePause, onClear });
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onTogglePause).toHaveBeenCalled();
    expect(onClear).toHaveBeenCalled();
  });

  it('shows Resume while paused', () => {
    renderHeader({ paused: true });
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('offers Reconnect after a lost connection (FR-17)', () => {
    renderHeader({ state: { status: 'lost', port: { id: 'a', name: 'EMEO' } } });
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
  });

  it('shows the connecting message in requesting state', () => {
    renderHeader({ state: { status: 'requesting' } });
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
  });

  it('shows the no-ports message in error state and offers Connect button', () => {
    renderHeader({ state: { status: 'error', error: { code: 'no-ports' } } });
    expect(screen.getByText(/No instrument detected/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });

  it('shows the unsupported-browser message for no-web-midi', () => {
    renderHeader({ state: { status: 'unsupported', reason: 'no-web-midi' } });
    expect(screen.getByText(/Web MIDI/)).toBeInTheDocument();
  });

  it('announces status changes via aria-live region (FR-2)', () => {
    renderHeader();
    const statusElement = screen.getByText('Not connected').closest('span');
    expect(statusElement).toHaveAttribute('aria-live', 'polite');
    expect(statusElement).toHaveAttribute('aria-atomic', 'true');
  });
});
