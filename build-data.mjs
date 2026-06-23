// Builds data.json from Hever's public datasets using the shared normalizer.
// Reusable by the GitHub Action (fetches live) and locally (HVR_LOCAL=1 reads ./raw).
// No login required — these endpoints are public + CORS-open.
import fs from 'node:fs';
import { buildData, SRC } from './normalize.js';

const LOCAL = process.env.HVR_LOCAL === '1';
const stripBom = (s) => s.replace(/^﻿/, '');

async function load(name) {
  if (LOCAL) return JSON.parse(stripBom(fs.readFileSync(new URL(`./raw/${name}`, import.meta.url), 'utf8')));
  const r = await fetch(SRC.base + name, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`fetch ${name} -> ${r.status}`);
  return JSON.parse(stripBom(await r.text()));
}

const [giftcard, giftBranches, teamimRaw, cats] = await Promise.all([
  load('giftcard.json'),
  load('giftcard_branches.json'),
  load('teamimcard_branches.json'),
  load('company_categories.json'),
]);

const out = buildData({ giftcard, giftBranches, teamimRaw, cats });
fs.writeFileSync(new URL('./data.json', import.meta.url), JSON.stringify(out));
const { chains, stores, categories, ...meta } = out;
fs.writeFileSync(new URL('./data.pretty.json', import.meta.url), JSON.stringify(meta, null, 2));
console.log(JSON.stringify(out.totals, null, 2));
