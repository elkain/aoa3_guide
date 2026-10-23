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
const testDungeon={id:'experience-test',fields:{caveLevelMasters:[{ref:'exp-a'},{ref:'exp-b'},{ref:'exp-c'},{ref:'exp-d'}]}};
records['experience-test']=testDungeon;[10,11,12,13].forEach((level,i)=>records[['exp-a','exp-b','exp-c','exp-d'][i]]={level});
const target={floor:4,dungeons:['experience-test']};
assert.equal(experienceAverageLevel(target,1),11);assert.equal(experienceAverageLevel(target,3),12);assert.equal(experienceAverageLevel(target,4),13);assert.equal(experienceAverageLevel(target,5),null);assert.equal(experienceAverageLevel(target,0),null);
for(const id of ['experience-test','exp-a','exp-b','exp-c','exp-d'])delete records[id];
assert.equal(cleanYieldSettings({adventureLevel:10.8,experienceStartFloor:3.3}).adventureLevel,11);assert.equal(cleanYieldSettings({experienceStartFloor:3.3}).experienceStartFloor,3);assert.equal(cleanYieldSettings({experienceStartFloor:-5}).experienceStartFloor,1);assert.equal(cleanYieldSettings({adventureLevel:Infinity}).adventureLevel,0);
wikiState.kingdom=17;yieldSettings={...YIELD_DEFAULTS,adventureLevel:10,experienceStartFloor:1};
const all=wikiExperienceCandidates();assert.ok(all.length);assert.ok(all.every((x,i,a)=>Number.isFinite(x.perRun)&&x.perRun===x.combatExperience+x.timeExperience&&x.gatherSeconds===0&&(!i||a[i-1].perRun>=x.perRun)));
const h=wikiExperience();assert.ok(h.includes('귀환 기본 경험치'));assert.ok(h.includes('총 획득 경험치가 아닙니다'));assert.equal((h.match(/class="wiki-money-entry"/g)||[]).length,5);
const id=all[0].floor.dungeons[0];wikiState.excluded=[id];assert.ok(wikiExperienceCandidates().every(x=>!x.floor.dungeons.includes(id)));wikiState.excluded=[];wikiState.maxFloors={[id]:0};assert.ok(wikiExperienceCandidates().every(x=>!x.floor.dungeons.includes(id)));wikiState.maxFloors={};
yieldSettings.experienceStartFloor=3;assert.ok(wikiExperienceCandidates().every(x=>x.floor.floor>=3));
yieldSettings.adventureLevel=0;assert.equal(experienceFloorModel(all[0].floor),null);assert.ok(wikiExperience().includes('미설정'));
yieldSettings={...YIELD_DEFAULTS,adventureLevel:10,experienceStartFloor:1,transitMinutes:600};assert.ok(wikiExperienceCandidates().every(x=>x.perRun===0));
yieldSettings={...YIELD_DEFAULTS,adventureLevel:10,experienceStartFloor:1,winPercent:0};const noWin=experienceFloorModel(all[0].floor);assert.equal(noWin.combatExperience,0);assert.ok(noWin.timeExperience>=0);
console.log('Experience checks passed: '+casesChecked+' native return fixtures; average floor, settings, scope, caps excluded, 5 unique dungeon entries, and no gathering.');
`,context);
