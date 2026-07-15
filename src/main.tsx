import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './i18n';
import { App } from './ui/App';
import { createSyntheticEnvironment } from './dev/syntheticEmeo';

const useSynthetic = new URLSearchParams(window.location.search).has('synthetic');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      environment={useSynthetic ? createSyntheticEnvironment() : undefined}
      synthetic={useSynthetic}
    />
  </StrictMode>,
);
