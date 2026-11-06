/**
 * Legal copy for the Cotton-AI dashboard.
 *
 * This module is the single source of truth for both the in-app footer links
 * (standalone pages at /privacy.html and /terms.html) and anything else that
 * needs to render the policies.
 *
 * Update `LAST_UPDATED` whenever the text changes.
 */

export const LAST_UPDATED = '6 November 2026';

export const OPERATOR = {
  name: 'Geoscape Analytics Lab',
  dashboard: 'CottonAI Sindh Dashboard',
  site: 'https://geoscapeanalyticslab.github.io/Cotton-AI/',
  repo: 'https://github.com/geoscapeanalyticslab/Cotton-AI',
  issues: 'https://github.com/geoscapeanalyticslab/Cotton-AI/issues',
};

/** Paragraph: { type: 'p', text }. List: { type: 'ul', items: [] }. */
const p = (text) => ({ type: 'p', text });
const ul = (...items) => ({ type: 'ul', items });

export const PRIVACY_SECTIONS = [
  {
    id: 'scope',
    title: '1. Scope',
    blocks: [
      p(
        'This policy explains what happens to your information when you use the CottonAI Sindh Dashboard (the "Dashboard"), a public web application published at ' +
          OPERATOR.site +
          ' by ' +
          OPERATOR.name +
          ' ("we", "us"). It covers the Dashboard only, not any other website or service.'
      ),
      p(
        'The Dashboard is a static web application. We do not run a server that receives your data, and we do not maintain user accounts, databases, or mailing lists in connection with it.'
      ),
    ],
  },
  {
    id: 'what-we-collect',
    title: '2. Information we handle',
    blocks: [
      p('Most of what the Dashboard does happens entirely inside your browser.'),
      ul(
        'Google Sign-In. Signing in is optional and only needed for live Earth Engine queries. When you sign in, Google returns your email address and an OAuth 2.0 access token to the page. The token is kept in memory for the current tab, is never written to storage, and is never sent to us. Closing or reloading the tab, or clicking "Sign out", discards it (sign-out also revokes it with Google).',
        'Earth Engine requests. Once signed in, the Dashboard sends Earth Engine API requests from your browser directly to Google, authorised with your token. Those requests tell Google which area and time range you are looking at. They do not pass through any server of ours.',
        'Map interaction. The district, field and year you select are held in browser memory so the Dashboard can show the matching numbers. They are not transmitted to us or stored anywhere.',
        'Theme preference. Your light/dark choice is saved in your browser\u2019s localStorage under the key "theme". It never leaves your device.',
        'Server logs. The Dashboard is hosted on GitHub Pages. GitHub may record standard technical information such as IP address, browser type and requested URL when serving the files. We do not have access to those logs.'
      ),
      p(
        'We do not use analytics, advertising, fingerprinting, session recording, or any third-party tracking scripts.'
      ),
    ],
  },
  {
    id: 'cookies',
    title: '3. Cookies and local storage',
    blocks: [
      p(
        'The Dashboard sets no cookies of its own. The only thing it stores on your device is the "theme" preference in localStorage, which you can clear at any time through your browser settings. Google\u2019s sign-in and Earth Engine services may set their own cookies on Google domains under Google\u2019s privacy policy.'
      ),
    ],
  },
  {
    id: 'permissions',
    title: '4. What the Google permission actually allows',
    blocks: [
      p(
        'The Dashboard requests two authorisations from Google when you sign in: your basic profile email address, and the scope https://www.googleapis.com/auth/earthengine.readonly.'
      ),
      ul(
        'earthengine.readonly allows the Dashboard to run read-only Earth Engine computations \u2014 reading public datasets and computing statistics over them. It cannot create, modify or delete assets in your Earth Engine account, and it cannot read your Google Drive, Gmail, calendar, contacts, or any other Google service.',
        'Earth Engine requests are executed against a Google Cloud project operated by us, but they require your Google account to have Earth Engine access. Any limits that Google applies to your account still apply.',
        'You can revoke access at any time at https://myaccount.google.com/permissions or by clicking "Sign out" in the Dashboard. Revocation takes effect immediately; the Dashboard then falls back to precomputed data.'
      ),
    ],
  },
  {
    id: 'third-parties',
    title: '5. Third-party services',
    blocks: [
      p(
        'The Dashboard loads content from the following providers. Each has its own privacy policy and terms, which apply to their part of the request.'
      ),
      ul(
        'Google Identity Services and the Earth Engine JavaScript API (accounts.google.com, earthengine.googleapis.com) \u2014 sign-in, tokens, and live geospatial queries.',
        'GitHub Pages (github.io) \u2014 static hosting and delivery of the Dashboard files.',
        'jsDelivr (cdn.jsdelivr.net) \u2014 delivery of the Earth Engine JavaScript library.',
        'Esri ArcGIS Online (arcgisonline.com) \u2014 satellite imagery base map tiles.',
        'OpenStreetMap (tile.openstreetmap.org) \u2014 street map base map tiles.',
        'Google Fonts (fonts.googleapis.com) \u2014 the Fira Sans and Fira Code typefaces.'
      ),
      p(
        'Your browser contacts these providers directly, so they receive your IP address and standard request information. We do not receive that information.'
      ),
    ],
  },
  {
    id: 'sharing',
    title: '6. Sharing and selling',
    blocks: [
      p(
        'We do not sell, rent, trade, or share personal information, because we do not collect or hold any. There is no advertising, profiling, or data brokerage connected with the Dashboard.'
      ),
    ],
  },
  {
    id: 'retention',
    title: '7. Retention and security',
    blocks: [
      p(
        'We retain nothing, so there is nothing for us to delete. Data held in your browser (the access token in memory, the theme preference) disappears when you close the tab or clear site data.'
      ),
      p(
        'Because the Dashboard is served as static files, its security depends on the browser, on GitHub Pages, and on Google\u2019s OAuth and Earth Engine services. We use the read-only Earth Engine scope, do not store tokens, and keep the source code public so that this behaviour can be checked.'
      ),
    ],
  },
  {
    id: 'children',
    title: '8. Children',
    blocks: [
      p(
        'The Dashboard is a professional and educational tool aimed at researchers, agronomists, students and public agencies. It is not directed at children under 13, and we do not knowingly collect information from them.'
      ),
    ],
  },
  {
    id: 'rights',
    title: '9. Your choices and rights',
    blocks: [
      p(
        'You can use the Dashboard without signing in at all; it then shows precomputed district and field layers. If you do sign in, you can revoke access at any time through your Google account, clear the site\u2019s localStorage in your browser, or simply close the tab. Because we hold no personal data, there is no archive for us to export, correct or erase on request.'
      ),
      p(
        'Depending on where you live, you may have statutory rights over personal data. Since the Dashboard does not transmit personal data to us, requests about data held by Google or GitHub should be directed to those providers.'
      ),
    ],
  },
  {
    id: 'changes',
    title: '10. Changes to this policy',
    blocks: [
      p(
        'If the Dashboard starts handling data differently \u2014 for example if a backend is added \u2014 this policy will be updated and the date below changed before that feature ships. The current version is always available at ' +
          OPERATOR.site +
          'privacy.html and in the project repository.'
      ),
    ],
  },
  {
    id: 'contact',
    title: '11. Contact',
    blocks: [
      p(
        'Questions about this policy can be raised in the public issue tracker at ' +
          OPERATOR.issues +
          '. Please do not include personal or confidential information in a public issue.'
      ),
    ],
  },
];

export const TERMS_SECTIONS = [
  {
    id: 'acceptance',
    title: '1. Acceptance',
    blocks: [
      p(
        'By opening or using the CottonAI Sindh Dashboard (the "Dashboard") you agree to these terms. If you do not agree, do not use the Dashboard. If you use it on behalf of an organisation, you confirm that you may accept these terms for that organisation.'
      ),
    ],
  },
  {
    id: 'service',
    title: '2. What the Dashboard is',
    blocks: [
      p(
        'The Dashboard is a free, open web application that visualises cotton field mapping for 21 districts of Sindh, Pakistan, together with climate, vegetation and yield indicators. Some layers are precomputed; others are calculated live in your browser from Google Earth Engine datasets such as ERA5-Land, CHIRPS and Sentinel-2.'
      ),
      p(
        'The Dashboard is provided for information and research. It is not a decision-support system for farming, irrigation, credit, insurance, land tenure or regulatory purposes, and it is not a substitute for professional agronomic or legal advice.'
      ),
    ],
  },
  {
    id: 'accounts',
    title: '3. Google account and Earth Engine',
    blocks: [
      ul(
        'Live queries require you to sign in with a Google account that has Earth Engine access. You are responsible for that account and for complying with Google\u2019s terms, including the Earth Engine Terms of Service and any quota limits that apply to you.',
        'You must be old enough to hold a Google account and to consent to the permissions requested.',
        'We may change or withdraw the Google Cloud project used for queries, which can affect whether live queries work for you.'
      ),
    ],
  },
  {
    id: 'acceptable-use',
    title: '4. Acceptable use',
    blocks: [
      p('You agree not to:'),
      ul(
        'use the Dashboard in a way that breaks the law or infringes anyone\u2019s rights;',
        'interfere with, overload, or attempt to gain unauthorised access to the Dashboard, GitHub Pages, Google\u2019s services, or any network or system connected to them;',
        'automate bulk extraction of the live Earth Engine layers, or use the Dashboard to circumvent Google\u2019s quotas or access controls;',
        'misrepresent the Dashboard\u2019s output as official government statistics, or remove attribution from it;',
        'use the Dashboard where a failure or inaccuracy could lead to death, injury, significant financial loss, or environmental harm.'
      ),
    ],
  },
  {
    id: 'accuracy',
    title: '5. Data and accuracy',
    blocks: [
      p(
        'Field boundaries, crop classification, climate values, NDVI and yield figures are model outputs and estimates. They are derived from satellite data at coarse spatial and temporal resolution, are affected by cloud cover, sensor characteristics and classification error, and may be incomplete or out of date.'
      ),
      p(
        'The Dashboard may contain errors and may change without notice. Verify anything important against field observations or official sources before relying on it. The Dashboard is not an official record of any crop, area, yield or loss.'
      ),
    ],
  },
  {
    id: 'ip',
    title: '6. Intellectual property',
    blocks: [
      p(
        'The Dashboard\u2019s source code and the mappings and derived layers published with it are made available by ' +
          OPERATOR.name +
          ' through the project repository at ' +
          OPERATOR.repo +
          '. Underlying datasets remain the property of their providers and are subject to their licences and attribution requirements, including Google Earth Engine, ERA5-Land (Copernicus/ECMWF), CHIRPS (UCSB Climate Hazards Center), Sentinel-2 (Copernicus/ESA), Esri, and OpenStreetMap contributors.'
      ),
      p(
        'Nothing in these terms transfers ownership of third-party data, or grants rights beyond those in the relevant provider\u2019s licence.'
      ),
    ],
  },
  {
    id: 'availability',
    title: '7. Availability and changes',
    blocks: [
      p(
        'The Dashboard is provided free of charge and on an "as available" basis. We may modify, suspend or discontinue any part of it at any time, including the live Earth Engine features, without notice or liability. We do not promise any level of availability, uptime, or support.'
      ),
    ],
  },
  {
    id: 'warranty',
    title: '8. Disclaimer of warranties',
    blocks: [
      p(
        'To the maximum extent permitted by law, the Dashboard is provided "as is" and "as available", without warranties of any kind, whether express, implied or statutory, including any warranty of merchantability, fitness for a particular purpose, accuracy, or non-infringement.'
      ),
    ],
  },
  {
    id: 'liability',
    title: '9. Limitation of liability',
    blocks: [
      p(
        'To the maximum extent permitted by law, ' +
          OPERATOR.name +
          ' and its contributors are not liable for any indirect, incidental, special, consequential or punitive damages, or for any loss of profits, crops, revenue, data or goodwill, arising from your use of or inability to use the Dashboard, even if advised of the possibility of such damages. Where liability cannot be excluded, it is limited to the amount you paid to use the Dashboard, which is zero.'
      ),
      p(
        'Nothing in these terms excludes liability that cannot be excluded by law, including liability for death or personal injury caused by negligence, or for fraud.'
      ),
    ],
  },
  {
    id: 'third-parties',
    title: '10. Third-party services',
    blocks: [
      p(
        'The Dashboard relies on services run by others, including Google (sign-in and Earth Engine), GitHub Pages, jsDelivr, Esri and OpenStreetMap. Their terms and privacy policies apply to your use of those services. We are not responsible for their availability, content, or practices.'
      ),
    ],
  },
  {
    id: 'changes',
    title: '11. Changes to these terms',
    blocks: [
      p(
        'We may update these terms from time to time. The version published at ' +
          OPERATOR.site +
          'terms.html is the current one, and the date below shows when it last changed. Continuing to use the Dashboard after a change means you accept the updated terms.'
      ),
    ],
  },
  {
    id: 'law',
    title: '12. Governing law',
    blocks: [
      p(
        'These terms are governed by the laws of the Islamic Republic of Pakistan, without regard to conflict-of-law rules. Courts in Pakistan have non-exclusive jurisdiction over disputes arising from these terms or the Dashboard, without limiting any right you may have to bring a claim in your local courts where the law requires it.'
      ),
    ],
  },
  {
    id: 'contact',
    title: '13. Contact',
    blocks: [
      p(
        'Questions about these terms can be raised in the public issue tracker at ' +
          OPERATOR.issues +
          '.'
      ),
    ],
  },
];
