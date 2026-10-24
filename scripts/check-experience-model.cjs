// Native return-branch fixtures and integration checks against public game definitions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),z=require('node:zlib');
const root=path.join(__dirname,'..');
const context=vm.createContext({console,assert,localStorage:{getItem:()=>null},archiveInput:JSON.parse(z.gunzipSync(fs.readFileSync(path.join(root,'data/archive.json.gz')))),buildingInput:JSON.parse(fs.readFileSync(path.join(root,'data/buildings.json'))),termsInput:JSON.parse(fs.readFileSync(path.join(root,'data/terms.json')))});
vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').split('\ninit().catch(')[0],context);
vm.runInContext(`
archive=archiveInput;records=archive.records;rows=Object.values(records);buildingData=buildingInput;terms=termsInput;for(const r of rows)r.tags=[];indexShops();
// Independent native branch table: combat multiplier represented as numerator/denominator.
const cases=[[3,2,1,2],[2,2,1,2],[1,1,1,4],[0,1,2,8],[-1,1,4,16],[-2,1,6,32],[-3,1,8,64],[-4,0,1,Infinity],[-10,0,1,Infinity]];
let casesChecked=0;
for(const [delta,numerator,denominator,timeDivisor]of cases)for(const R of [0,1,5,6,7,11,12,23,99,1000])for(const T of [0,1,7,8,31,32,63,64,3600]){
 const p=experienceReturnParts(R,T,delta);
 assert.equal(p.combatExperience,Math.trunc(R*numerator/denominator));assert.equal(p.timeExperience,Math.trunc(T/timeDivisor));casesChecked++;
}
const migrated=cleanYieldSettings({adventureLevel:10.8,experienceStartFloor:3.3,hours:5});assert.equal(migrated.hours,5);assert.equal(Object.hasOwn(migrated,'adventureLevel'),false);assert.equal(Object.hasOwn(migrated,'experienceStartFloor'),false);
wikiState.kingdom=17;yieldSettings={...YIELD_DEFAULTS};
const all=wikiExperienceCandidates();assert.ok(all.length);assert.ok(all.every((x,i,a)=>Number.isFinite(x.perRun)&&x.perRun===x.combatExperience+x.timeExperience&&x.gatherSeconds===0&&(!i||a[i-1].perRun>=x.perRun)));
const h=wikiExperience();assert.ok(h.includes('귀환 기본 경험치'));assert.ok(h.includes('총 획득 경험치가 아닙니다'));assert.equal((h.match(/class="wiki-money-entry"/g)||[]).length,5);
const id=all[0].floor.dungeons[0];wikiState.excluded=[id];assert.ok(wikiExperienceCandidates().every(x=>!x.floor.dungeons.includes(id)));wikiState.excluded=[];wikiState.maxFloors={[id]:0};assert.ok(wikiExperienceCandidates().every(x=>!x.floor.dungeons.includes(id)));wikiState.maxFloors={};
assert.ok(all.every(x=>x.referenceLevel===x.floorLevel&&x.delta===0&&x.combatExperience===Math.trunc(x.combatPool/2)&&x.timeExperience===Math.trunc(Math.floor(x.activeSeconds/10)/8)));
assert.ok(all.every(x=>x.floorLevel===x.floor.level&&x.referenceLevel===x.floor.level));
assert.ok(h.includes('해당 층만 반복 탐험'));assert.ok(!h.includes('1층 출발'));
// Changing an earlier floor cannot affect the target-only reference or payout.
const deep=all.find(x=>x.floor.floor>1&&records[records[x.floor.dungeons[0]].fields.caveLevelMasters[0].ref].id!==x.floor.id);assert.ok(deep);
const first=records[records[deep.floor.dungeons[0]].fields.caveLevelMasters[0].ref],oldLevel=first.level;
const snapshot=experienceFloorModel(deep.floor);first.level=oldLevel+100;
assert.equal(experienceFloorModel(deep.floor).referenceLevel,snapshot.referenceLevel);assert.equal(experienceFloorModel(deep.floor).perRun,snapshot.perRun);first.level=oldLevel;
assert.equal((h.match(/data-experience-floor=/g)||[]).length,0);assert.ok(h.includes('data-experience-expand'));assert.equal((experienceFloorTable(all).match(/data-experience-floor=/g)||[]).length,all.length);
assert.ok(!h.includes('data-yield-setting="adventureLevel"'));assert.ok(!h.includes('data-yield-setting="experienceStartFloor"'));
const before=all[0].perRun;yieldSettings.adventureLevel=99;yieldSettings.experienceStartFloor=999;assert.equal(wikiExperienceCandidates()[0].perRun,before);delete yieldSettings.adventureLevel;delete yieldSettings.experienceStartFloor;
assert.equal(experienceFloorModel(all[0].floor,0),null);
const same=experienceFloorModel(all[0].floor,all[0].floorLevel);assert.equal(same.perRun,before);
const lower=experienceFloorModel(all[0].floor,Math.max(1,all[0].floorLevel-1));assert.ok(lower.perRun>=same.perRun);
assert.equal(cleanYieldSettings({experienceLevel:25}).experienceLevel,25);
for(const level of [0,-1,2.5,10000,NaN,null])assert.equal(cleanYieldSettings({experienceLevel:level}).experienceLevel,null);
yieldSettings={...YIELD_DEFAULTS,experienceLevel:10};const levelSelected=wikiExperienceCandidates();assert.ok(levelSelected.length);assert.ok(levelSelected.every(x=>x.referenceLevel===10&&x.delta===x.floor.level-10));
assert.ok(levelSelected.every(x=>x.perRun===experienceFloorModel(x.floor,10).perRun));
assert.ok(wikiExperience().includes('모험가 Lv. 10'));assert.ok(wikiExperience().includes('data-yield-setting="experienceLevel"'));
yieldSettings=cleanYieldSettings({...yieldSettings,experienceLevel:0});assert.equal(wikiExperienceCandidates()[0].perRun,before);
yieldSettings={...YIELD_DEFAULTS,transitMinutes:600};assert.equal(wikiExperienceCandidates().length,0);
yieldSettings={...YIELD_DEFAULTS,winPercent:0};const noWin=experienceFloorModel(all[0].floor);assert.equal(noWin.combatExperience,0);assert.ok(noWin.timeExperience>=0);
console.log('Experience checks passed: '+casesChecked+' native return fixtures; automatic per-floor reference, legacy settings ignored, all-floor table, 5 unique dungeon entries, and no gathering.');
`,context);
