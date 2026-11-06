import { createRoot } from 'react-dom/client';
import LegalPage from './LegalPage';
import { LAST_UPDATED, PRIVACY_SECTIONS } from './content';
import '../index.css';

createRoot(document.getElementById('legal-root')).render(
  <LegalPage
    title="Privacy Policy"
    intro={`This Dashboard runs almost entirely in your browser. It has no backend of its own, keeps no user accounts, and never receives your Google access token. Last reviewed ${LAST_UPDATED}.`}
    sections={PRIVACY_SECTIONS}
  />
);
