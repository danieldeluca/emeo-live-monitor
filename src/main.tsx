import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './i18n';
import { App } from './ui/App';
import { createSyntheticEnvironment } from './dev/syntheticEmeo';

const params = new URLSearchParams(window.location.search);
const useSynthetic = params.has('synthetic');
// Only meaningful together with ?synthetic — real hardware isn't scripted.
const diverge = params.has('diverge');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      environment={useSynthetic ? createSyntheticEnvironment({ diverge }) : undefined}
      synthetic={useSynthetic}
    />
  </StrictMode>,
);
