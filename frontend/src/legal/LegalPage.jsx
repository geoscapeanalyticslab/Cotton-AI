import { useEffect, useState } from 'react';
import { LAST_UPDATED, OPERATOR } from './content';
import './legal.css';

function getInitialTheme() {
  try {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage can be unavailable in private modes */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function LegalPage({ title, intro, sections }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const base = import.meta.env.BASE_URL;

  return (
    <div className="legal-shell">
      <header className="legal-header">
        <a className="legal-brand" href={base}>
          <img src={`${base}cotton-icon-brown.png`} alt="" width="28" height="28" />
          <span>
            Cotton<span className="legal-brand-ai">AI</span> Sindh Dashboard
          </span>
        </a>
        <div className="legal-header-actions">
          <a className="legal-link" href={base}>
            &larr; Back to dashboard
          </a>
          <button
            type="button"
            className="legal-theme-toggle"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label="Toggle color theme"
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </header>

      <main className="legal-main">
        <article className="legal-doc">
          <h1>{title}</h1>
          <p className="legal-meta">
            {OPERATOR.dashboard} &middot; Last updated {LAST_UPDATED}
          </p>
          {intro && <p className="legal-intro">{intro}</p>}

          {sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2>{section.title}</h2>
              {section.blocks.map((block, i) =>
                block.type === 'ul' ? (
                  <ul key={i}>
                    {block.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={i}>{block.text}</p>
                )
              )}
            </section>
          ))}

          <p className="legal-footnote">
            This page is part of the {OPERATOR.dashboard}. See also{' '}
            <a href={`${base}privacy.html`}>Privacy Policy</a> and{' '}
            <a href={`${base}terms.html`}>Terms of Service</a>.
          </p>
        </article>
      </main>

      <footer className="legal-footer">
        <span>
          &copy; {new Date().getFullYear()} {OPERATOR.name} &middot; Data: Google
          Earth Engine (ERA5-Land, CHIRPS, Sentinel-2)
        </span>
        <nav>
          <a href={`${base}privacy.html`}>Privacy</a>
          <a href={`${base}terms.html`}>Terms</a>
          <a href={OPERATOR.repo} target="_blank" rel="noreferrer noopener">
            Source
          </a>
        </nav>
      </footer>
    </div>
  );
}
