// npm run capture: refreshes the parser fixtures from the live sources through our own
// TinyFish key (proves the key works server-side). Needs the key in server/.env.

import { writeFileSync } from 'node:fs';
import { fetchPages } from '../src/tinyfish/client.js';
import { parseAllScholarships } from '../src/parse/nsp.js';

const FIXTURES = new URL('../test/fixtures/', import.meta.url);

const targets = {
  'https://scholarships.gov.in/All-Scholarships': 'nsp-all-scholarships.md',
  'https://scholarships.gov.in/': 'nsp-home.md',
  'https://mahadbt.maharashtra.gov.in/': 'mahadbt-landing.md',
  'https://www.buddy4study.com/page/the-tata-capital-pankh-scholarship-programme': 'b4s-tata-pankh.md',
  'https://www.buddy4study.com/page/hdfc-bank-parivartans-ecss-programme': 'b4s-hdfc-parivartan.md',
  'https://devfolio.co/hackathons': 'devfolio-hackathons.md',
  'https://mlh.io/seasons/2027/events': 'mlh-events.md',
};

try {
  const { results, errors } = await fetchPages({ urls: Object.keys(targets), format: 'markdown', per_url_timeout_ms: 90_000 });
  for (const r of results) {
    const name = targets[r.url];
    if (!name) continue;
    writeFileSync(new URL(name, FIXTURES), r.text);
    console.log(`saved ${name} (${r.text.length} chars, ${Math.round(r.latency_ms)} ms)`);
    if (name === 'nsp-all-scholarships.md') console.log(`  NSP parser: ${parseAllScholarships(r.text).length} schemes`);
  }
  for (const e of errors) console.error(`FAILED ${e.url}: ${e.error}${e.status ? ` (${e.status})` : ''}`);
} catch (err) {
  console.error(`capture failed: ${err.code ?? ''} ${err.message}`);
  process.exitCode = 1;
}
