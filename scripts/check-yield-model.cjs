// Integration checks against the shipped archive; no personal records are needed.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const zlib=require('node:zlib');
const path=require('node:path');
const root=path.join(__dirname,'..');
const context=vm.createContext({console,localStorage:{getItem:()=>null,setItem(){},removeItem(){}},archiveInput:JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'data/archive.json.gz')))),termsInput:JSON.parse(fs.readFileSync(path.join(root,'data/terms.json'))),assert});
const source=fs.readFileSync(path.join(root,'app.js'),'utf8').split('\ninit().catch(')[0];
vm.runInContext(source,context);
vm.runInContext(`
archive=archiveInput;records=archive.records;rows=Object.values(records);terms=termsInput;
for(const r of rows)r.tags=[];
archive.loot.forEach(e=>{if(e.target)add(lootTo,e.target,e);add(lootFrom,e.source,e);});
archive.encounters.forEach(e=>{add(spawnTo,e.monster,e);add(spawnFrom,e.source,e);});
indexShops();
const floors=rows.filter(r=>r.type==='floor');
for(const floor of floors){
 const money=yieldFloorModel(floor,'money');if(!money)continue;
 assert.equal(money.gatherSeconds,0);assert.equal(money.goldSales,0);assert.equal(money.sales.size,0);
 assert.equal(money.materials.size===0||[...money.materials.values()].every(x=>x.gather===0),true);
 assert.ok(Number.isFinite(money.perRun)&&money.perRun>=0,floor.name);
 assert.ok(Math.abs(money.perRun-(money.goldMonster+money.goldChest)*money.visits)<1e-7);
 const material=yieldFloorModel(floor);assert.notEqual(money,material,'mode caches must not overlap');
}
const gatheringFloor=floors.find(f=>yieldFloorModel(f)?.gatherSeconds>0);
assert.ok(gatheringFloor,'fixture needs a gathering source');
assert.ok(yieldFloorModel(gatheringFloor,'money').cycleSeconds<yieldFloorModel(gatheringFloor).cycleSeconds);
// Fixed and timed treasure must never be counted in repeat gold.
const fixture=JSON.parse(JSON.stringify(floors[0]));fixture.id='test-floor';fixture.fields.monsterInfos=[];
const chest={frequency:10,appearanceConditions:10,isRoom:0,isClear:0,chest:{minGold:100,maxGold:100}};
fixture.fields.chestInfos=[chest];yieldFloorCache.clear();const repeat=yieldFloorModel(fixture,'money');
fixture.fields.chestInfos.push({...chest,frequency:1,chest:{minGold:1000000,maxGold:1000000}},{...chest,appearanceConditions:4},{...chest,isClear:1});
yieldFloorCache.clear();assert.equal(yieldFloorModel(fixture,'money').perRun,repeat.perRun);
// Supply limits must cap exposure before subtracting travel time.
yieldSettings=cleanYieldSettings({...YIELD_DEFAULTS,hours:24,food:1,transitMinutes:10});
const capped=yieldTimeBudget();assert.equal(capped.runSeconds,2880);assert.equal(capped.activeSeconds,2280);assert.equal(capped.foodLimited,true);
yieldSettings.transitMinutes=100;assert.equal(yieldTimeBudget().activeSeconds,0);
assert.equal(yieldFloorModel(floors[0],'money').perRun,0);
assert.equal(migrateYieldSettings({battleSeconds:60}).battleSeconds,YIELD_DEFAULTS.battleSeconds);
assert.equal(migrateYieldSettings({battleSeconds:123,hours:8}).battleSeconds,123);
// Open range and ranking must react to kingdom and floor restrictions.
yieldSettings={...YIELD_DEFAULTS};wikiState.kingdom=1;
const early=wikiMoneyCandidates();assert.ok(early.length>0);assert.ok(early.every(x=>wikiFloorAllowed(x.floor)));
wikiState.kingdom=17;const late=wikiMoneyCandidates();assert.ok(late.length>early.length);
const excluded=late[0].floor.dungeons[0];wikiState.excluded=[excluded];assert.ok(wikiMoneyCandidates().every(x=>x.floor.dungeons[0]!==excluded));
wikiState.excluded=[];wikiPage='money';const html=wikiMoney();assert.equal((html.match(/class="wiki-money-entry"/g)||[]).length,5);assert.equal(html.includes('20회 합계'),false);assert.equal(html.includes('도구·소모품 판매'),false);
yieldSettings.winPercent=0;yieldSettings.openPercent=0;assert.equal(wikiMoneyCandidates().length,0);
console.log('Yield checks passed: '+floors.length+' floors; clock, modes, repeat rewards, food, migration and rankings.');
`,context);
