import { createRoot } from 'react-dom/client';
import LegalPage from './LegalPage';
import { LAST_UPDATED, TERMS_SECTIONS } from './content';
import '../index.css';

createRoot(document.getElementById('legal-root')).render(
  <LegalPage
    title="Terms of Service"
    intro={`These terms govern your use of the CottonAI Sindh Dashboard. The Dashboard is a free research tool; its output is an estimate, not an official record. Last reviewed ${LAST_UPDATED}.`}
    sections={TERMS_SECTIONS}
  />
);
