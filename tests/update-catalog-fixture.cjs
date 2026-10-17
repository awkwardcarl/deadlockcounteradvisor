'use strict';
// Refreshes tests/fixtures/catalog-snapshot.json from the same public endpoints
// and compaction the desktop app uses for "Sync items & heroes". Run after a
// game patch, then run `npm test` to see which curated rules need review.
const fs=require('node:fs');
const path=require('node:path');
const {getJSON,ROUTES}=require('../desktop/data-service.cjs');
const {compactSnapshot}=require('../js/snapshot.cjs');
const target=path.join(__dirname,'fixtures','catalog-snapshot.json');
(async()=>{
  const [items,heroes]=await Promise.all(ROUTES.map(getJSON));
  const snapshot=compactSnapshot(items,heroes);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify(snapshot,null,1)+'\n','utf8');
  console.log(`Wrote ${snapshot.items.length} items and ${snapshot.heroes.length} heroes (build ${snapshot.build||'unknown'}) to ${path.relative(process.cwd(),target)}`);
})().catch(e=>{console.error('Fixture update failed:',e.message);process.exit(1);});
