import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/instrument-sans';
import '@fontsource/stix-two-text/400.css';
import '@fontsource/stix-two-text/600.css';
import '@fontsource/stix-two-text/400-italic.css';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './ui/App';

// When a menu closes, focus returns to its trigger, and the engine may ring it as if the
// keyboard had been used. Record how the user last acted so the style sheet can keep
// focus rings for keyboard use.
const modality = (value: 'pointer' | 'keyboard') => () => {
  document.documentElement.dataset.modality = value;
};
document.addEventListener('pointerdown', modality('pointer'), true);
document.addEventListener('keydown', modality('keyboard'), true);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
