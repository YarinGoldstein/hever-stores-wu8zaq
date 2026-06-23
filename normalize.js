// Shared, pure normalization logic — runs in both Node (build-data.mjs) and the browser (app.js).
// Given the raw Hever datasets, produces the unified {chains, stores, ...} model.
export const SRC = {
  base: 'https://www.hvr.co.il/bs2/datasets/',
  kevaLogo: 'https://www.hvr.co.il/pics/giftcard/',
  teamimLogo: 'https://www.hvr.co.il/pics/giftcard_rest/',
  files: ['giftcard.json', 'giftcard_branches.json', 'teamimcard_branches.json', 'company_categories.json'],
};

const clean = (s) => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();
const slug = (s) => clean(s).toLowerCase().replace(/[^a-z0-9֐-׿]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
const norm = (s) => clean(s).toLowerCase().replace(/["'`.,]/g, '').replace(/^רשת\s+/, '').replace(/\s+בעמ$/, '').trim();
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n !== 0 ? n : null; };

export function buildData({ giftcard, giftBranches, teamimRaw, cats }) {
  const teamim = (teamimRaw && teamimRaw.branch) || [];
  const chains = [];
  const stores = [];
  let sid = 0;

  // Keva — shopping/retail; chain-level + branch list
  for (const c of giftcard) {
    const name = clean(c.company);
    const chainId = 'keva:' + slug(name);
    const logo = c.logo ? SRC.kevaLogo + c.logo : null;
    chains.push({
      id: chainId, card: 'keva', name, category: clean(c.company_category), logo,
      website: clean(c.website), isOnline: c.is_online === 'Y', isNew: c.is_new === 'Y',
      desc: clean(c.company_desc), productTypes: clean(c.product_types),
      instructions: { inStore: clean(c.limitations), online: clean(c.online_limitations) },
      searchWords: clean(c.search_words), branchQty: parseInt(c.branch_qty, 10) || 0,
    });
    const branches = giftBranches[c.company] || giftBranches[name] || [];
    if (branches.length === 0) {
      stores.push({ id: 's' + sid++, card: 'keva', chainId, chain: name, branch: name,
        category: clean(c.company_category), region: '', city: '', address: '', phone: '',
        lat: null, lng: null, online: true, logo, website: clean(c.website), kosher: '', handicap: '', hours: '',
        limitations: clean(c.online_limitations || c.limitations) });
    }
    for (const b of branches) {
      const lat = num(b.latitude), lng = num(b.longitude);
      const online = lat == null || lng == null;
      stores.push({ id: 's' + sid++, card: 'keva', chainId, chain: name, branch: clean(b.name) || name,
        category: clean(c.company_category), region: clean(b.region), city: '', address: clean(b.address),
        phone: clean(b.phone), lat, lng, online, logo, website: clean(c.website), kosher: '', handicap: '', hours: '',
        limitations: clean(online ? (c.online_limitations || c.limitations) : c.limitations) });
    }
  }

  // Teamim — dining; branch-level, name == chain
  const teamimChainMap = new Map();
  for (const b of teamim) {
    const name = clean(b.name);
    if (!name) continue;
    const chainId = 'teamim:' + slug(name);
    if (!teamimChainMap.has(chainId)) {
      teamimChainMap.set(chainId, {
        id: chainId, card: 'teamim', name, category: clean(b.category), logo: b.img ? SRC.teamimLogo + b.img : null,
        website: clean(b.website), isOnline: false, isNew: b.is_new === 'Y',
        desc: clean(b.desc), productTypes: clean(b.product_types),
        instructions: { inStore: clean(b.limitations), online: '' },
        searchWords: clean(b.search_words), branchQty: 0, types: new Set(),
      });
    }
    const ch = teamimChainMap.get(chainId);
    ch.branchQty++;
    if (b.type) ch.types.add(clean(b.type));
    if (!ch.logo && b.img) ch.logo = SRC.teamimLogo + b.img;
    const lat = num(b.latitude), lng = num(b.longitude);
    const online = lat == null || lng == null;
    stores.push({ id: 's' + sid++, card: 'teamim', chainId, chain: name, branch: clean(b.name),
      category: clean(b.category), region: clean(b.area), city: clean(b.city), address: clean(b.address),
      phone: clean(b.phone), lat, lng, online, logo: ch.logo, website: clean(b.website),
      kosher: clean(b.kosher), handicap: b.handicap === 'Y' ? 'Y' : '', hours: clean(b.hours),
      type: clean(b.type), delivery: clean(b.delivery), limitations: clean(b.limitations) });
  }
  for (const ch of teamimChainMap.values()) { ch.types = [...ch.types].filter(Boolean).join(', '); chains.push(ch); }

  // acceptsBoth (Keva ∩ Teamim by normalized chain name)
  const teamimNames = new Set(chains.filter((c) => c.card === 'teamim').map((c) => norm(c.name)));
  const bothNames = new Set(chains.filter((c) => c.card === 'keva').map((c) => norm(c.name)).filter((n) => n && teamimNames.has(n)));
  for (const c of chains) c.acceptsBoth = bothNames.has(norm(c.name));
  for (const s of stores) s.acceptsBoth = bothNames.has(norm(s.chain));

  return {
    generatedAt: new Date().toISOString(),
    source: 'hvr.co.il public datasets (giftcard, giftcard_branches, teamimcard_branches)',
    totals: {
      chains: chains.length,
      kevaChains: chains.filter((c) => c.card === 'keva').length,
      teamimChains: chains.filter((c) => c.card === 'teamim').length,
      stores: stores.length,
      kevaStores: stores.filter((s) => s.card === 'keva').length,
      teamimStores: stores.filter((s) => s.card === 'teamim').length,
      mappable: stores.filter((s) => s.lat != null).length,
      acceptsBothChains: bothNames.size,
    },
    cards: {
      keva: { label: 'חבר של קבע', kind: 'קניות וצרכנות', color: '#f5a623', page: 'https://www.hvr.co.il/site/pg/gift_card_company' },
      teamim: { label: 'חבר טעמים', kind: 'מסעדות ובתי קפה', color: '#2f6fb0', page: 'https://www.hvr.co.il/site/pg/teamim_card_store' },
    },
    categories: cats,
    chains,
    stores,
  };
}
