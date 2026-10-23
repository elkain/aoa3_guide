'use strict';
const TYPES={dungeon:'던전',floor:'층별 정보',monster:'몬스터',weapon:'무기',armor:'방어구',accessory:'장신구',item:'도구·아이템',material:'재료',job:'직업',skill:'스킬',building:'건물',map:'지도',status:'상태 이상',trap:'몬스터 특수기',character:'캐릭터 원형',road:'길·방',achievement:'업적'};
const PLAYER_TYPES=new Set(['dungeon','floor','monster','weapon','armor','accessory','item','material','job','skill','building','map','status','trap']);
const LOOT={'monster-drop':'몬스터 보상','chest':'보물상자','chest-gold':'골드 상자','gathering':'채집 재료'};
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=value=>value===null||value===undefined?'—':typeof value==='number'?value.toLocaleString('ko-KR'):String(value);
let buildingData,buildingGroup='base';
let guildDungeonData,guildDungeonMode=false,guildData,terms,conditionData,archive,records,rows=[],selected='dungeon',filtered=[],limit=60;
const shopTo=new Map(),shopFrom=new Map();
const lootTo=new Map(),lootFrom=new Map(),spawnTo=new Map(),spawnFrom=new Map();
const add=(map,key,value)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(value);};
const getName=id=>records[id]?displayName(records[id]):id;
const levelText=r=>r.level===null||r.level===undefined?'—':r.maxLevel!==undefined&&r.maxLevel!==null&&r.maxLevel!==r.level?`${r.level}–${r.maxLevel}`:String(r.level);
const jump=id=>records[id]?`<button class="ref-button" data-id="${esc(id)}">${esc(getName(id))} ↗</button>`:guildDungeonData?.traps[id]?`<button class="ref-button" data-guild-trap="${esc(id)}">함정 정보 보기 ↗</button>`:`<span>이름 정보 없음</span>`;
let label={};

// Tags summarize explicit serialized fields; numeric enums retain their codes.
function itemTags(row){
 if(!['weapon','armor','accessory','item','material'].includes(row.type))return [];
 const f=row.fields,a=f.ability||{},tags=[];
 const put=(name,field,value)=>tags.push({name,field,value});
 if(a.isMagic===1||f.isMagic===1)put(row.type==='weapon'?'마법 무기':row.type==='item'?'마법 아이템':'마법 장비',a.isMagic===1?'ability.isMagic':'isMagic',1);
 for(const [key,name] of Object.entries({autoHealHP:'HP 자동 회복',autoHealMP:'MP 자동 회복',stealHPRate:'HP 흡수',stealMPValue:'MP 흡수',magicGuard:'마법 방어 보정',addMagicPower:'마력 보정',addFaith:'신앙 보정',addAgility:'민첩 보정',addIntelligence:'지력 보정',addDexterity:'손재주 보정',addLeader:'통솔 보정',addDefense:'방어 보정',addDamage:'피해 보정',addCrit:'치명타 보정',addCritDefense:'치명타 방어 보정',addShieldAvoid:'방패 회피 보정',adjustmentHitRate:'명중 보정',adjustmentCritPoint:'치명타 보정',damageReflectionValue:'피해 반사',damageReflectionAttributeValue:'속성 피해 반사',isHandMagicAttack:'손 마법 공격'})){
  if(typeof a[key]==='number'&&a[key]!==0)put(name,'ability.'+key,a[key]);
 }
 for(const [keys,name] of [[['adjustmentMinDamage','adjustmentMaxDamage'],'피해 범위 보정'],[['adjustmentMinDefenseValue','adjustmentMaxDefenseValue'],'방어 범위 보정'],[['adjustmentMinPowerRate','adjustmentMaxPowerRate'],'필요 근력 보정']]){
  const values=keys.filter(k=>a[k]!==undefined).map(k=>a[k]);
  if(values.some(v=>v!==0))put(name,keys.map(k=>'ability.'+k).join(', '),values);
 }
 for(const [key,name] of Object.entries({invalidAttributes:'속성 무효',strongAttribute:'속성 저항',weakAttribute:'속성 약점',invalidEffectOnCreatureKinds:'상태 효과 무효'})){
  for(const code of a[key]||[])put(name+' · '+namedField(row,'ability.'+key,code),'ability.'+key,code);
 }
 for(const [key,name] of Object.entries({addAdditionalEffect:'추가 속성',effectAttack:'공격 효과',dwellingSpirit:'정령 깃듦',lightEffectType:'빛 효과'})){
  if(typeof f[key]==='number'&&f[key]!==0)put(name+' · '+namedField(row,key,f[key]),key,f[key]);
 }
 for(const [key,name] of Object.entries({isTwoHand:'양손',allTarget:'전체 대상',withBackTarget:'후열 대상 포함',replacesCane:'지팡이 대체',isBrokenIfUse:'사용 시 파손'}))if(f[key]===1)put(name,key,1);
 if(f.canGetMaterial?.file===0&&records[f.canGetMaterial.ref])put('재료 채집','canGetMaterial',getName(f.canGetMaterial.ref));
 return tags;
}
function uniqueTags(row){return [...new Map((row.tags||[]).map(t=>[t.name,t])).values()];}
const concise=text=>String(text).replace(/ \(-?\d+\)$/,'');
function tagMarkup(row,compact=false){
 const tags=uniqueTags(row),count=compact?3:6,pills=list=>'<span class="item-tags">'+list.map(t=>'<span class="effect-tag">'+esc(concise(t.name))+'</span>').join('')+'</span>';
 if(!tags.length)return '';
 return pills(tags.slice(0,count))+(tags.length>count?(compact?'<span class="effect-tag tag-more">+'+(tags.length-count)+'</span>':'<details class="more-effects"><summary>효과 '+(tags.length-count)+'개 더 보기</summary>'+pills(tags.slice(count))+'</details>'):'');
}
function groupExact(entries,key){const groups=new Map();for(const entry of entries){const k=key(entry);if(!groups.has(k))groups.set(k,{entry,members:[]});groups.get(k).members.push(entry);}return [...groups.values()];}
function lootGroups(entries){return groupExact(entries,e=>JSON.stringify([e.kind,e.source,e.target,e.acquisition,e.craftLevel,e.frequency,e.appearanceConditions,e.isRoom,e.chest||null,e.chest?{...chestContext(e).definition,key:undefined}:null]));}
function encounterGroups(entries){return groupExact(entries,e=>{const match=e.field.match(/^monsterInfos\[(\d+)\]/),group=match?records[e.source]?.fields.monsterInfos[Number(match[1])]:null;return JSON.stringify([e.source,e.monster,e.levelAdjustment,e.frequency,e.appearanceConditions,e.isRoom,group?{...group,key:undefined}:null]);});}
function schemaFor(row){return {object:terms.recordTypes[row.type]};}
function schemaField(schema,key){return schema?.object?terms.classes[schema.object]?.fields[key]:null;}
function pathSchema(row,path){let node=schemaFor(row);for(const key of path.split('.'))node=schemaField(node,key);return node?.array||node;}
function enumText(id,value){const entry=terms.enums[id]?.values[String(value)];return entry?entry.ko+' ('+value+')':'등록되지 않은 값 ('+num(value)+')';}
function typedText(value,schema){if(schema?.enum)return enumText(schema.enum,value);if(schema?.boolean)return value===1||value===true?'예':value===0||value===false?'아니요':num(value);return num(value);}
function namedField(row,path,value){return typedText(value,pathSchema(row,path));}
function fieldTitle(path){return path.split('.').map(k=>label[k]||k).join(' · ');}
function displayName(row){
 if(!row)return '';
 if(row.type==='job'&&!/[가-힣]/.test(row.name)){const e=Object.values(terms.enums).find(e=>e.name==='Job.Kind');return Object.values(e?.values||{}).find(v=>v.name===row.internal)?.ko||row.name;}
 if(row.type==='achievement'&&!/[가-힣]/.test(row.name))return row.fields.achievementLevels?.[0]?.LCName||row.name;
 if(row.type==='road'&&!/[가-힣]/.test(row.name))return namedField(row,'direction',row.fields.direction)+' · 길';
 if(row.type==='trap'&&!/[가-힣]/.test(row.name))return '몬스터 특수기 · '+namedField(row,'effect',row.fields.effect);
 return row.name;
}
async function readArchive(){
 const response=await fetch('data/archive.json.gz');
 if(!response.ok)throw new Error(`데이터 응답 오류 (${response.status})`);
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes[0]===31&&bytes[1]===139){
  if(!('DecompressionStream'in window))throw new Error('압축 데이터를 지원하는 최신 Chrome·Edge·Safari·Firefox로 열어주세요.');
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
 }
 return JSON.parse(new TextDecoder().decode(bytes));
}
function fillSelect(id,type){
 $(id).innerHTML+=rows.filter(r=>r.type===type).sort((a,b)=>a.internal.localeCompare(b.internal,'en',{numeric:true})).map(r=>`<option value="${esc(r.id)}">${esc(displayName(r))}</option>`).join('');
}
function setType(type,group=buildingGroup){
 if(type==='building')buildingGroup=group==='job'?'job':'base';
 wikiActive=false;guideActive=false;modeSwitch(false);
 if(!PLAYER_TYPES.has(type))return;
 guildDungeonMode=false;
 $('browser-panel').hidden=false;$('result-actions').hidden=false;$('intro-title').textContent='AoA3 데이터 찾기';$('intro-subtitle').textContent='장비·아이템 획득처와 던전 정보를 한곳에서.';
 selected=type;limit=60;
 ['map','dungeon','floor','kind','tag'].forEach(id=>$(id).value='');
 document.querySelectorAll('nav button').forEach(b=>{b.classList.toggle('active',b.dataset.type===type&&(!b.dataset.buildingGroup||b.dataset.buildingGroup===buildingGroup));b.setAttribute('aria-pressed',String(b.dataset.type===type&&(!b.dataset.buildingGroup||b.dataset.buildingGroup===buildingGroup)));});
 const subset=rows.filter(r=>r.type===type);
 const tagNames=[...new Set(subset.flatMap(r=>r.tags.map(t=>t.name)))].sort((a,b)=>a.localeCompare(b,'ko'));
 $('tag').innerHTML='<option value="">전체 태그</option>'+tagNames.map(name=>'<option value="'+esc(name)+'">'+esc(concise(name))+'</option>').join('');
 $('tag').disabled=!tagNames.length;
 $('map').disabled=!subset.some(r=>r.maps.length);
 $('dungeon').disabled=!subset.some(r=>r.dungeons.length);
 $('floor').disabled=type!=='floor';
 const codes=[...new Set(subset.map(r=>r.fields.kind).filter(v=>v!==undefined))].sort((a,b)=>a-b);
 $('kind').innerHTML='<option value="">전체 종류</option>'+codes.map(v=>`<option value="${v}">${esc(concise(namedField(subset[0],'kind',v)))}</option>`).join('');
 $('kind').disabled=!codes.length;$('kind-filter').hidden=!codes.length;$('tag-filter').hidden=!tagNames.length;
 $('result-title').textContent=(type==='building'?(buildingGroup==='job'?'직업 건물':'기본 건물'):TYPES[type])+' 목록';$('current-section').textContent=type==='building'?(buildingGroup==='job'?'직업 건물':'기본 건물'):TYPES[type];if(type==='building'){$('intro-title').textContent='건물 성장과 해금';$('intro-subtitle').textContent='건물별 레벨 해금 · 필요 왕국 레벨 · 골드와 재료를 확인하세요.';}render();
}
function render(){
 const q=$('query').value.trim().normalize('NFKC').toLocaleLowerCase(),map=$('map').value,dungeon=$('dungeon').value,kind=$('kind').value,tag=$('tag').value;
 const min=$('min-level').value,max=$('max-level').value,floor=$('floor').value;
 filtered=rows.filter(r=>r.type===selected&&(selected!=='building'||buildingData.buildings[r.id]?.category===buildingGroup)&&(!guildDungeonMode||Boolean(guildDungeonData.dungeons[r.id]))&&(!q||[displayName(r),r.name,r.english,r.japanese,r.internal,...r.tags.map(t=>t.name)].some(s=>s.normalize('NFKC').toLocaleLowerCase().includes(q)))&&(!tag||r.tags.some(t=>t.name===tag))&&(!map||r.maps.includes(map))&&(!dungeon||r.dungeons.includes(dungeon))&&(!kind||String(r.fields.kind)===kind)&&(!min||(r.type==='building'?r.fields.needCastleLevel:r.level)!==null&&(r.type==='building'?r.fields.needCastleLevel:(r.maxLevel??r.level))>=Number(min))&&(!max||(r.type==='building'?r.fields.needCastleLevel:r.level)!==null&&(r.type==='building'?r.fields.needCastleLevel:r.level)<=Number(max))&&(!floor||selected!=='floor'||r.floor===Number(floor)));
 filtered.sort((a,b)=>$('sort').value==='name'?a.name.localeCompare(b.name,'ko'):((selected==='building'?a.fields.needCastleLevel:(a.level??Infinity))-(selected==='building'?b.fields.needCastleLevel:(b.level??Infinity)))*($('sort').value==='level-desc'?-1:1)||a.name.localeCompare(b.name,'ko'));
 $('result-count').textContent=`${filtered.length.toLocaleString()}개 기록`;
 $('rows').innerHTML=filtered.length?filtered.slice(0,limit).map(r=>{
  if(r.type==='building')return buildingListRow(r);
  const places=[...r.maps.map(getName),...r.dungeons.filter(id=>id!==r.id).slice(0,2).map(getName)].join(' / ');
  const caption=guildDungeonMode?guildDungeonData.dungeons[r.id].floors.length+'개 층에 길드 추가 콘텐츠 · '+places:r.type==='dungeon'?`${r.fields.caveLevelMasters.length}개 층 · ${places||r.english}`:places||r.english||r.japanese||r.internal;
  return `<button class="row" data-id="${esc(r.id)}" ${guildDungeonMode?'data-guild-record="'+esc(r.id)+'"':''}><span class="level"><small>${r.type==='dungeon'?(guildDungeonMode?'기본 레벨':'레벨 범위'):'레벨'}</small>${esc(levelText(r))}</span><span><span class="row-name">${esc(displayName(r))}</span><span class="row-subtitle">${esc(caption)}</span>${tagMarkup(r,true)}</span><span class="row-meta">${esc(r.fields.kind!==undefined?concise(namedField(r,'kind',r.fields.kind)):TYPES[r.type])}</span><span class="row-tag">${r.type==='floor'?r.floor+'층':r.type==='dungeon'?r.fields.caveLevelMasters.length+'개 층':['weapon','armor','accessory','item','material'].includes(r.type)?((shopTo.get(r.id)||[]).length+lootGroups(lootTo.get(r.id)||[]).length)+'개 획득처':''}</span><span class="arrow" aria-hidden="true">↗</span></button>`;
 }).join(''):'<p class="empty">조건에 맞는 기록이 없습니다.<br>검색어나 필터를 바꿔보세요.</p>';
 if(selected==='building')$('rows').innerHTML=buildingTabs()+$('rows').innerHTML;
 $('more').hidden=filtered.length<=limit;$('more').textContent=`다음 ${Math.min(60,filtered.length-limit)}개 보기 (${Math.min(limit,filtered.length)} / ${filtered.length})`;
}
function buildingTabs(){return '<div class="building-tabs" aria-label="건물 분류"><button data-building-group="base" aria-pressed="'+(buildingGroup==='base')+'">기본 건물 · 32</button><button data-building-group="job" aria-pressed="'+(buildingGroup==='job')+'">직업 건물 · 19</button></div><p class="muted-note">건물을 선택하면 각 레벨의 해금 내용과 그 레벨에 도달하는 데 필요한 골드·재료를 볼 수 있습니다.</p>';}
function buildingListRow(r){const b=buildingData.buildings[r.id],first=b.stages[0];return '<button class="row building-row" data-id="'+esc(r.id)+'"><span class="level"><small>왕국</small>'+r.fields.needCastleLevel+'</span><span><span class="row-name">'+esc(displayName(r))+'</span><span class="row-subtitle">'+(b.job?esc(getName(b.job))+' 훈련 · ':'')+'건설 '+num(first.gold)+' G · Lv. 1–'+b.stages.length+' 성장 정보</span>'+(b.prerequisite!=='0'?'<span class="row-subtitle">선행 건물: '+esc(getName(b.prerequisite))+'</span>':'')+'</span><span class="row-meta">'+(b.category==='job'?'직업 건물':'기본 건물')+'</span><span class="arrow" aria-hidden="true">↗</span></button>';}
function buildingSection(row){
 const b=buildingData.buildings[row.id];if(!b)return '';
 const materials=s=>s.materials.length?s.materials.map(m=>jump(m.id)+' × '+num(m.count)).join('<br>'):'필요 재료 없음';
 const prereq=b.prerequisite!=='0'?'<p>건설 선행 조건: '+jump(b.prerequisite)+' 건설</p>':'';
 const jobNote=b.job?'<p class="muted-note">시설 레벨은 직업 훈련 상한입니다. 모험가 레벨·필요 능력·경험치·골드 등 개인 훈련 조건도 충족해야 합니다. 시설을 올린다고 직업 레벨이 자동으로 오르지는 않습니다.</p>':'';
 return '<section class="detail-section building-growth"><h3>레벨별 해금과 건설·레벨업 요구사항</h3><p>각 행은 <strong>표시된 레벨에 도달하는 비용</strong>입니다. Lv. 1은 건설, Lv. 2는 1 → 2 확장에 해당합니다. 왕국 레벨은 건물 레벨과 별도입니다.</p>'+prereq+jobNote+(b.paidExpansion?'<p class="wiki-note">이 시설은 확장 시 별도 구매 조건이 있습니다. 아래 골드는 게임 내 골드 견적이며 현금 결제 비용을 뜻하지 않습니다.</p>':'')+'<div class="wiki-table-wrap"><table class="wiki-table building-level-table"><thead><tr><th>목표 레벨</th><th>해금·이용 범위</th><th>필요 왕국</th><th>필요 골드·재료</th></tr></thead><tbody>'+b.stages.map(s=>'<tr><th scope="row">Lv. '+s.level+'<small>'+(s.level===1?'건설':(s.level-1)+' → '+s.level)+'</small></th><td>'+s.features.map(x=>'<div>'+esc(x)+'</div>').join('')+(s.links.length?'<div class="building-unlock-links">'+s.links.map(jump).join(' ')+'</div>':'')+(s.stock.length?'<details class="building-stock"><summary>이 레벨 취급 품목 '+s.stock.length+'종</summary>'+s.stock.map(jump).join(' ')+'</details>':'')+'</td><td>Lv. '+s.kingdom+'</td><td><strong>'+num(s.gold)+' G</strong>'+(s.requirements?.length?'<div class="building-materials">'+s.requirements.map(x=>jump(x.building)+' Lv. '+x.level+' 이상').join('<br>')+'</div>':'')+'<div class="building-materials">'+materials(s)+'</div></td></tr>').join('')+'</tbody></table></div><p class="muted-note">등록된 단계 기준입니다. 품목은 해당 레벨의 취급 목록이며 새로 추가된 상품만을 뜻하지 않습니다. 재료 이름을 누르면 수급처를 확인할 수 있습니다.</p></section>';
}

function reset(){['query','map','dungeon','min-level','max-level','floor','kind','tag'].forEach(id=>$(id).value='');$('sort').value='level';limit=60;render();}
function fieldValue(value,depth=0,schema=null){
 if(schema?.enum)return esc(enumText(schema.enum,value));
 if(schema?.boolean)return esc(typedText(value,schema));
 if(value&&typeof value==='object'&&'ref'in value&&'file'in value)return value.ref==='0'?'없음':value.file===0?jump(value.ref):'추가 정보 확인 중';
 if(value&&typeof value==='object'){
  if(depth>6)return `<pre>${esc(JSON.stringify(value,null,2))}</pre>`;
  const pairs=Object.entries(value);
  return `<details><summary>${Array.isArray(value)?pairs.length+'개 항목':'필드 펼치기'}</summary>${pairs.map(([k,v])=>`<div class="raw-field"><span>${esc(label[k]||k)}</span><div>${fieldValue(v,depth+1,schema?.array||schemaField(schema,k))}</div></div>`).join('')}</details>`;
 }
 return esc(value);
}
function tiles(pairs){return `<div class="detail-grid">${pairs.map(([name,value])=>`<div class="detail-stat"><span>${esc(name)}</span><strong>${esc(num(value))}</strong></div>`).join('')}</div>`;}
function properties(row){
 const f=row.fields;
 let keys=[];
 if(row.type==='dungeon')keys=['recoveryChestDay'];
 if(row.type==='floor')keys=['isDark','maxMonsterAppearanceCount'];
 if(row.type==='monster')keys=['gold'];
 if(row.type==='weapon')keys=['kind','_power','_damage','_critPoint','_price'];
 if(['armor','accessory'].includes(row.type))keys=['_power','_defense','_baseValue','_price'];
 if(row.type==='job')keys=['needAbility','canAttack','canAvoid'];
 if(row.type==='building')return tiles([['분류',buildingData.buildings[row.id]?.category==='job'?'직업 건물':'기본 건물'],['건설 가능 왕국 레벨',f.needCastleLevel],['건설 골드',num(buildingData.buildings[row.id]?.stages[0]?.gold)+' G']]);
 if(row.type==='item')keys=['price','canUseCount','getMaterialTime','isBrokenIfUse'];
 if(row.type==='map')keys=['searchTime'];
 if(row.type==='skill')keys=['useMP','kind','targetType','targetRange'];
 const playerLabels={_power:'필요 근력',_damage:'기본 공격력',_defense:'기본 방어력',_baseValue:'기본 능력',_price:'기본 가격',_critPoint:'치명타',gold:'보상 골드'};
 return tiles([['레벨',levelText(row)],...keys.filter(k=>k in f&&f[k]!==''&&f[k]!==null).map(k=>[playerLabels[k]||label[k]||k,concise(namedField(row,k,f[k]))])]);
}
function conditionName(type,code){const id=Object.keys(terms.enums).find(id=>terms.enums[id].name.endsWith('.'+type));return id?enumText(id,code):'등록되지 않은 값 ('+num(code)+')';}
function indexShops(){
 for(const shop of rows.filter(r=>r.type==='building'&&['ShopWeapon','ShopArmor','ShopAccessory','ShopItem'].includes(r.internal))){
  (shop.fields.needLevelUPs||[]).forEach((stage,index)=>{
   for(const field of ['weaponMasters','armorMasters','accessoryMasters','itemMasters'])for(const ref of stage[field]||[]){
    if(ref.file!==0||!records[ref.ref])continue;
    const entry={shop:shop.id,target:ref.ref,index,field,stage};add(shopTo,ref.ref,entry);add(shopFrom,shop.id,entry);
   }
  });
 }
 for(const r of rows)if(shopTo.has(r.id))r.tags.push({name:'상점 취급',field:'building.needLevelUPs',value:shopTo.get(r.id).map(e=>({shop:e.shop,path:'needLevelUPs['+e.index+'].'+e.field,castleLevel:e.stage.castleLevel}))});
}
function shopRows(entries,inbound=true){
 if(!entries?.length)return '';
 const groups=groupExact(entries,e=>JSON.stringify([e.shop,e.target,e.index,e.stage]));
 return '<div class="acquisition-list">'+groups.map(({entry:e})=>{
  const f=records[e.shop].fields,materials=e.stage.needMaterials||[];
  return '<article class="acquisition-card"><div class="acquisition-head"><span class="source-chip">상점</span>'+jump(inbound?e.shop:e.target)+'</div><p class="acquisition-summary">상점 '+(e.index+1)+'단계 · 성 레벨 '+esc(num(e.stage.castleLevel))+'</p><details><summary>확장 재료 · 건설 조건</summary><p class="muted-note">해당 단계의 확장 재료이며 아이템 구매 비용이 아닙니다.</p><div>'+ (materials.length?materials.map(m=>fieldValue(m.materialMaster)+' × '+esc(num(m.count))).join('<br>'):'확장 재료 없음')+'</div><p>건설: 성 레벨 '+esc(num(f.needCastleLevel))+' · 비용 '+esc(num(f.buildingPrice))+'</p>'+(f.needBuildingMaster?.ref&&f.needBuildingMaster.ref!=='0'?'<p>선행 건물: '+fieldValue(f.needBuildingMaster)+'</p>':'')+'</details></article>';
 }).join('')+'</div>';
}
function chestContext(entry){
 const floor=records[entry.source],index=entry.field.match(/^chestInfos\[(\d+)\]/)?.[1];
 return {floor,dungeon:records[floor?.dungeons[0]],definition:index!==undefined?floor?.fields.chestInfos?.[Number(index)]:null};
}
function acquisitionLifecycle(entry){
 if(!entry.chest){
  if(entry.kind!=='monster-drop')return '';
  const places=[...new Set((spawnTo.get(entry.source)||[]).filter(e=>{const i=e.field.match(/^monsterInfos\[(\d+)\]/)?.[1];return i!==undefined&&records[e.source].fields.monsterInfos[Number(i)].isClear===1;}).map(e=>e.source))];
  return places.length?'<details><summary>클리어 관련 출현 장소 '+places.length+'곳</summary>'+places.map(jump).join('<br>')+'</details>':'';
 }
 const {definition:c,dungeon}=chestContext(entry),code=conditionData.enums.AppearanceConditions[String(entry.appearanceConditions)];
 const badges=[c?.isClear===1?'클리어 연계 상자':'',code==='One'||code==='PartyOne'?'단회 획득 후보':''].filter(Boolean);
 return (badges.length?'<div class="lifecycle-badges">'+badges.map(x=>'<span>'+x+'</span>').join('')+'</div>':'')+'<p class="muted-note">상자 복구 일수: '+esc(num(dungeon?.fields.recoveryChestDay))+'</p>'+(c?.LCMessage||c?.LCClearMessage?'<details><summary>발견 · 획득 메시지</summary>'+[c?.LCMessage,c?.LCClearMessage].filter(Boolean).map(x=>'<p>'+esc(x)+'</p>').join('')+'</details>':'');
}
function chestConditions(entry){
 const c=entry.chest,t=c.trap||{},need=c.needItem;
 const value=(name,key,v)=>'<div class="condition-line"><span>'+esc(name)+'</span><strong>'+esc(key.endsWith('appearanceConditions')?concise(conditionName('AppearanceConditions',v)):key.endsWith('frequency')?concise(conditionName('Frequency',v)):key.endsWith('isRoom')?(v===1?'예':'아니요'):num(v))+'</strong></div>';
 const spawn=value('출현 조건','appearanceConditions',entry.appearanceConditions)+value('출현 빈도','frequency',entry.frequency)+value('방 내부','isRoom',entry.isRoom)+value('발견 지력 판정값','foundIntelligenceValue',c.foundIntelligenceValue);
 let opening=value('손재주 판정값','dexterityValue',c.dexterityValue)+value('마법 판정값','magicValue',c.magicValue);
 opening+='<div class="condition-line"><span>필요 아이템</span><strong>'+(need?.ref&&need.ref!=='0'?fieldValue(need):'없음')+'</strong></div>';
 const trap=t.trapMaster;
 opening+='<div class="condition-line"><span>연결된 함정</span><strong>'+(trap?.ref&&trap.ref!=='0'?fieldValue(trap):'없음')+'</strong></div>';
 if(trap?.ref&&trap.ref!=='0')opening+='<details class="trap-conditions"><summary>함정의 출현 조건</summary>'+value('함정 조건','trap.appearanceConditions',t.appearanceConditions)+value('함정 빈도','trap.frequency',t.frequency)+value('함정의 방 내부','trap.isRoom',t.isRoom)+'<div class="detail-code">'+esc(t.key||'')+'</div></details>';
 return {spawn,opening};
}
function lootRows(entries,inbound=false){
 if(!entries.length)return '';
 const groups=lootGroups(entries),renderGroup=({entry:e,members})=>{
  const target=inbound?jump(e.source):e.target?jump(e.target):'골드';
  let body='';
  if(e.chest){
   const conditions=chestConditions(e);
   body='<p class="acquisition-summary">'+esc(concise(conditionName('AppearanceConditions',e.appearanceConditions)))+' · '+esc(concise(conditionName('Frequency',e.frequency)))+(e.chest.addLevel?' · 추가 레벨 '+esc(num(e.chest.addLevel)):'')+'</p>'+acquisitionLifecycle(e)+'<details><summary>발견 조건 · 오픈 조건</summary><p class="muted-note">판정값은 실제 필요한 능력치와 다를 수 있습니다.</p><div class="chest-condition-grid"><section><h4>드롭·출현 / 발견 조건</h4>'+conditions.spawn+'</section><section><h4>오픈 관련 조건</h4>'+conditions.opening+'</section></div></details>';
   if(e.kind==='chest-gold')body='<p>골드 '+esc(num(e.chest.minGold))+'–'+esc(num(e.chest.maxGold))+'</p>'+body;
  }else if(e.kind==='monster-drop'){
   body='<p class="acquisition-summary">획득 빈도: '+esc(concise(conditionName('AcquisitionProbability',e.acquisition)))+(e.craftLevel?' · 제작 레벨 '+esc(num(e.craftLevel)):'')+'</p>'+acquisitionLifecycle(e);
  }else body='<p class="acquisition-summary">출현 빈도: '+esc(concise(conditionName('Frequency',e.frequency)))+' · '+(e.isRoom===1?'방 내부':'통로')+'</p>';
  return '<article class="acquisition-card"><div class="acquisition-head"><span class="source-chip">'+LOOT[e.kind]+'</span>'+target+'</div>'+body+'</article>';
 };
 return '<div class="acquisition-list">'+groups.slice(0,12).map(renderGroup).join('')+'</div>'+(groups.length>12?'<details class="more-sources"><summary>나머지 '+(groups.length-12)+'개 획득처 보기</summary><div class="acquisition-list">'+groups.slice(12).map(renderGroup).join('')+'</div></details>':'');
}
function encounterRows(entries,monsterView=false){
 if(!entries.length)return '<p class="muted-note">등록된 몬스터 배치가 없습니다.</p>';
 const groups=encounterGroups(entries);
 return '<div class="encounter-list">'+groups.map(({entry:e,members})=>'<div class="encounter-item"><div>'+jump(monsterView?e.source:e.monster)+'</div><p>추가 레벨 '+esc(num(e.levelAdjustment))+' · '+esc(concise(conditionName('Frequency',e.frequency)))+' · '+esc(concise(conditionName('AppearanceConditions',e.appearanceConditions)))+' · '+(e.isRoom===1?'방 내부':'통로')+'</p></div>').join('')+'</div>';
}
function acquisitionSection(id){
 const shops=shopTo.get(id)||[],loot=lootTo.get(id)||[],n=lootGroups(loot).length;
 if(!shops.length&&!loot.length)return '<section class="detail-section"><h3>획득처</h3><p class="muted-note">직접 연결된 획득처가 없습니다.</p></section>';
 return '<section class="detail-section"><h3>획득처</h3>'+(shops.length?'<details class="source-group" open><summary>상점 획득처 <span>'+shops.length+'</span></summary>'+shopRows(shops)+'</details>':'')+(loot.length?'<details class="source-group" open><summary>탐험 획득처 <span>'+n+'</span></summary>'+lootRows(loot,true)+'</details>':'')+'</section>';
}

function clearTargets(floor,guild=false){
 const visible=e=>e.isClear===1&&(guild||e.appearanceConditions!==4);
 return {chests:floor.fields.chestInfos.map((e,i)=>({e,i})).filter(({e})=>visible(e)),monsters:floor.fields.monsterInfos.map((e,i)=>({e,i})).filter(({e})=>visible(e))};
}
function clearChestLoot(floor,guild=false){const indices=new Set(clearTargets(floor,guild).chests.map(x=>x.i));return (lootFrom.get(floor.id)||[]).filter(e=>indices.has(Number(e.field.match(/^chestInfos\[(\d+)\]/)?.[1])));}
function floorGoal(floor,guild=false){
 const f=floor.fields,t=clearTargets(floor,guild),goals=[];
 const when=e=>esc(concise(conditionName('AppearanceConditions',e.appearanceConditions)))+' · '+esc(concise(conditionName('Frequency',e.frequency)));
 for(const {e} of t.monsters)goals.push('<li>토벌: '+e.wrapMonsterMasters.map(m=>jump(m.master.ref)).join(' + ')+'<small>'+when(e)+'</small></li>');
 for(const {e} of t.chests){const c=e.chest,names=['weapon','armor','accessory','item','material'].map(k=>c[k]?.ref).filter(id=>id&&id!=='0');goals.push('<li>상자 열기: '+(names.length?names.map(jump).join(' · '):'골드 상자')+'<small>'+when(e)+'</small></li>');}
 const count=f.countToClear>0?f.countToClear:1;
 return (goals.length?'<p>아래 클리어 대상 행동 중 '+count+'회 완료'+(count>1?' (같은 층의 누적 횟수)':'')+'.</p><ul class="clear-goals">'+goals.join('')+'</ul>':'<p class="muted-note">별도 클리어 대상이 등록되어 있지 않습니다. 다음 층으로 탐험을 이어가세요.</p>')+(f.clearConditionsDoorCount>0?'<p>다음 층 진행: 문 '+f.clearConditionsDoorCount+'개 열기. 이전에 해당 문을 연 기록에 따른 통과 처리도 있습니다.</p>':'')+(f.isClear===1?'<p class="muted-note">다음 층으로 가려면 이 층의 클리어 대상 처리가 필요합니다. 기존 획득·클리어 기록으로 통과할 수 있는 경우도 있습니다.</p>':'');
}
function clearSection(row,guild=false){
 if(!['floor','dungeon'].includes(row.type))return '';
 const floors=row.type==='floor'?[row]:row.fields.caveLevelMasters.map(x=>records[x.ref]);
 const last=row.type==='dungeon'?floors.at(-1):null;
 const rewardNote=(guild?guildClearRewards(row.type==='floor'?records[row.dungeons[0]]:row):'')+'<p class="muted-note">최종 층의 클리어 대상 처리가 끝나면 던전 클리어로 판정합니다. 기본 모험 경험치 보너스는 1,000이며 실제 획득량은 게임의 배율·상한에 따라 달라집니다. 몬스터의 확률 드롭은 별도입니다.</p>';
 if(last)return '<section class="detail-section"><h3>던전 클리어 조건과 보상</h3><p>최종 목표: '+(guild?guildJump(last.id):jump(last.id))+'</p>'+rewardNote+'<div class="clear-floor-list">'+floors.map(f=>'<details class="source-group"'+(f===last?' open':'')+'><summary>'+f.floor+'층'+(f===last?' · 최종 목표':' · 진행 조건')+'</summary>'+floorGoal(f,guild)+(clearChestLoot(f,guild).length?'<h4>클리어 대상 상자 보상</h4>'+lootRows(clearChestLoot(f,guild)):'')+'</details>').join('')+'</div></section>';
 const loot=clearChestLoot(row,guild);
 return '<section class="detail-section"><h3>클리어 조건 · 층 진행</h3>'+floorGoal(row,guild)+(loot.length?'<h4>클리어 대상 상자 보상</h4><p class="muted-note">해당 상자를 찾아 열 때 얻는 내용물입니다. 상자를 열면 클리어 처리도 진행됩니다. 발견·오픈 조건을 함께 확인하세요.</p>'+lootRows(loot):'<p class="muted-note">별도로 지정된 클리어 보상 상자는 없습니다. 몬스터 보상은 각 몬스터 정보에서 확인하세요.</p>')+rewardNote+'</section>';
}
function guildClearRewards(dungeon){
 const floors=dungeon?(dungeon.fields.caveLevelMasters||[]).map(x=>records[x.ref]).filter(Boolean):[];
 const last=floors.at(-1),offset=dungeon?.fields.addGuildEventLevel;
 const base=last&&Number.isFinite(last.level)&&Number.isFinite(offset)?last.level+offset:null;
 return '<section class="detail-section guild-level-guide"><h3>길드 이벤트 클리어 보상</h3><div class="guild-level-table"><table><thead><tr><th>보상</th><th>지급 기준</th></tr></thead><tbody><tr><td>공헌도</td><td>일반 길드원 +1 · 리더·서브리더 +2</td></tr><tr><td>모험 경험치</td><td>파티 캐릭터별 이벤트 레벨 × 50 (기본 지급량)</td></tr><tr><td>랭크</td><td>참가 캐릭터에 클리어 랭크 보정. 현재 랭크·생존·부상 상태에 따라 달라집니다.</td></tr></tbody></table></div><p>이벤트 레벨 = 최종 층 기본 레벨 + 지역 고유 보정 + 리더가 설정한 추가 레벨.</p>'+(base!==null?'<p>이 지역은 설정 +0일 때 이벤트 레벨 '+num(base)+' · 기본 모험 경험치 '+num(base*50)+'. 설정 +5일 때 이벤트 레벨 '+num(base+5)+' · 기본 모험 경험치 '+num((base+5)*50)+'.</p>':'')+'<p class="muted-note">최종 층 클리어 후 지급됩니다. 실제 모험 경험치는 게임 배율·경험치 상한에 따라 달라집니다. 공헌도는 난이도에 비례하지 않습니다. 탐험 중 상자 내용물·몬스터 드롭은 별도 획득이며, 이미 클리어한 동일 이벤트에는 재도전할 수 없습니다.</p></section>';
}
function guildLevelGuide(dungeon){
 const offset=dungeon?Number(dungeon.fields.addGuildEventLevel)||0:null;
 return '<section class="detail-section guild-level-guide"><h3>길드 이벤트 · 추가 레벨에 따른 변화</h3><p>유효 추가 레벨 = 리더가 설정한 추가 레벨 + 던전 고유 보정'+(offset!==null?' <strong>'+offset+'</strong>':'')+'.</p>'+(offset!==null?'<p>이 던전에서 설정 +0 → 유효 +'+offset+', 설정 +5 → 유효 +'+(offset+5)+'.</p>':'<p>던전 고유 보정은 지역마다 0–2입니다. 각 길드 던전 상세에서 확인하세요.</p>')+'<div class="guild-level-table"><table><thead><tr><th>항목</th><th>추가 레벨을 1 높이면</th></tr></thead><tbody><tr><td>몬스터</td><td>생성 시 배치 추가 레벨에 +1. 능력치 계산에 반영됩니다.</td></tr><tr><td>상자 발견·잠금 해제</td><td>발견 및 손재주·마법 해제 판정의 난도 기준에 +1.</td></tr><tr><td>함정</td><td>발견·해제·저항 판정의 난도 기준에 +1.</td></tr><tr><td>상자 장비</td><td>장비 강화 처리에 넘기는 기준값이 +1. 실제 강화 여부·결과는 상자 설정과 무작위 처리에 따릅니다.</td></tr><tr><td>상자 골드</td><td>일부 상자에 추가 레벨 보정이 적용됩니다. 무작위 출현 상자는 별도 계산을 사용합니다.</td></tr></tbody></table></div><p class="muted-note">상자 장비의 기준값은 층 레벨 + 유효 추가 레벨입니다. 모든 장비가 확정으로 +1 강화되거나 드롭 확률이 오르는 뜻은 아닙니다. 설정을 높여도 클리어 목표 자체는 바뀌지 않습니다.</p></section>';
}

function openRecord(id,mode='normal'){
 const r=records[id];if(!r||!PLAYER_TYPES.has(r.type))return;
 if(!$('detail').open)$('detail').showModal();$('detail-type').textContent=mode==='guild'?'길드 추가 콘텐츠 · 기본 지역':TYPES[r.type];
 let special='';
 if(r.type==='dungeon')special='<section class="detail-section"><h3>층별 기록</h3>'+r.fields.caveLevelMasters.map(v=>{const f=records[v.ref];return '<button class="related" data-id="'+esc(f.id)+'">'+f.floor+'층<small>레벨 '+num(f.level)+' · 몬스터 '+encounterGroups(spawnFrom.get(f.id)||[]).length+'개 배치 유형 · 보물·채집 '+lootGroups(lootFrom.get(f.id)||[]).length+'개 경로</small></button>';}).join('')+'</section>';
 if(r.type==='floor')special='<section class="detail-section"><h3>몬스터</h3>'+encounterRows(spawnFrom.get(id)||[])+'</section><section class="detail-section"><h3>보물상자 · 채집 재료</h3>'+lootRows((lootFrom.get(id)||[]).filter(e=>!clearChestLoot(r).includes(e)))+'</section>';
 if(r.type==='monster')special='<section class="detail-section"><h3>보상</h3>'+lootRows(lootFrom.get(id)||[])+'</section><details class="source-group"><summary>출현 장소</summary>'+encounterRows(spawnTo.get(id)||[],true)+'</details>';
 if(['weapon','armor','accessory','item','material'].includes(r.type))special=acquisitionSection(id);
 if(r.type==='material'){
  special=materialRecommendationDetail(r)+'<details class="source-group"><summary>다른 획득처 · 참고 자료</summary>'+special+'</details>';
 }
 if(r.internal==='Guild'&&r.type==='building')special='<section class="detail-section"><h3>길드 활용</h3><button data-view="guild">가입·상점·이벤트 안내 보기 ↗</button></section>';
 if(shopFrom.has(id))special='<section class="detail-section"><h3>단계별 상점 취급 목록</h3>'+shopRows(shopFrom.get(id),false)+'</section>';
 if(r.type==='building')special=buildingSection(r)+special;
 if(mode==='guild'&&r.type==='dungeon')special=guildDungeonContent(r);
 else if(mode==='guild'&&r.type==='floor')special=guildFloorContent(r);
 else if(r.type==='dungeon'&&guildDungeonData.dungeons[r.id])special='<section class="detail-section"><button data-guild-record="'+esc(r.id)+'">길드 추가 몬스터·보물 보기 ↗</button></section>'+special;
 if(['dungeon','floor'].includes(r.type))special='<p><button data-guide-plan="'+esc(r.type==='floor'?r.dungeons[0]:r.id)+'"'+(mode==='guild'?' data-guide-event="true"':'')+'>이 던전 공략 가이드 →</button></p>'+clearSection(r,mode==='guild')+special;
 if(['weapon','armor','accessory','item','material'].includes(r.type))special='<p><button data-guide-target="'+esc(r.id)+'">이 아이템 획득 가이드 →</button></p>'+special;
 const parent=r.type==='floor'?r.dungeons[0]:null;
 $('detail-body').innerHTML='<div class="detail-heading"><h2 id="detail-title">'+esc(displayName(r))+'</h2>'+(parent?'<div>'+(mode==='guild'?guildJump(parent):jump(parent))+'</div>':'')+'</div>'+(r.description?'<p class="record-description">'+esc(r.description)+'</p>':'')+properties(r)+(r.tags.length?'<section class="detail-effects"><h3>효과</h3>'+tagMarkup(r)+'</section>':'')+special;
 $('detail').scrollTop=0;history.replaceState(null,'',(mode==='guild'?'#guild-record/':'#record/')+encodeURIComponent(id));
}
const guildJump=id=>'<button class="ref-button" data-guild-record="'+esc(id)+'">'+esc(getName(id))+' ↗</button>';
function openGuildDungeons(){
 if($('detail').open)$('detail').close();
 setType('dungeon');guildDungeonMode=true;reset();
 $('intro-title').textContent='길드 던전';$('intro-subtitle').textContent='길드 추가 몬스터·보물이 있는 지역입니다. 이벤트 난이도는 리더 설정에 따라 달라집니다.';$('current-section').textContent='길드 던전';$('result-title').textContent='길드 추가 콘텐츠가 있는 던전';
 document.querySelectorAll('nav button').forEach(b=>{const active=b.dataset.view==='guild-dungeons';b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});

}
function guildFloorInfo(floor){const d=guildDungeonData.dungeons[floor.dungeons[0]];return d?.floors.find(f=>f.id===floor.id);}
function guildFloorContent(floor){
 const info=guildFloorInfo(floor);if(!info)return '<p class="muted-note">이 층에는 별도 길드 추가 콘텐츠가 없습니다.</p>';
 const monsters=(spawnFrom.get(floor.id)||[]).filter(e=>e.appearanceConditions===4),loot=(lootFrom.get(floor.id)||[]).filter(e=>e.appearanceConditions===4&&!clearChestLoot(floor,true).includes(e));
 const traps=info.trapIndices.map(i=>floor.fields.trapInfos[i]);
 return guildLevelGuide(records[floor.dungeons[0]])+'<p class="muted-note">길드 전용 추가 콘텐츠입니다. 기본 지역을 먼저 공략하고 파티가 도시에 있을 때 이벤트에 참가하세요.</p>'+(monsters.length?'<section class="detail-section"><h3>길드 몬스터</h3>'+encounterRows(monsters)+'</section>':'')+(loot.length?'<section class="detail-section"><h3>길드 보물 · 보상</h3>'+lootRows(loot)+'</section>':'')+(traps.length?'<section class="detail-section"><h3>길드 함정</h3><div class="acquisition-list">'+traps.map(t=>guildTrapCard(t.trapMaster.ref)).join('')+'</div></section>':'');
}
function guildDungeonContent(dungeon){
 const d=guildDungeonData.dungeons[dungeon.id];
 if(!d)return '<p class="muted-note">별도 길드 추가 콘텐츠가 등록되어 있지 않습니다.</p>';
 return guildLevelGuide(dungeon)+'<p class="muted-note">기본 던전 레벨과 길드 이벤트 난이도는 다릅니다. 실제 개최 지역·추가 난이도는 길드 이벤트에서 확인하세요.</p><section class="detail-section"><h3>길드 추가 콘텐츠가 있는 층</h3>'+d.floors.map(info=>{const floor=records[info.id];return '<article class="guild-floor-card"><div>'+guildJump(floor.id)+'</div><p>기본 레벨 '+num(floor.level)+' · '+[info.monsterIndices.length?'몬스터 편성 '+info.monsterIndices.length+'개':'',info.chestIndices.length?'보물상자 '+info.chestIndices.length+'개':'',info.trapIndices.length?'함정 '+info.trapIndices.length+'개':''].filter(Boolean).join(' · ')+'</p></article>';}).join('')+'</section><button data-id="'+esc(dungeon.id)+'">기본 던전 정보 보기</button>';
}
function guildTrapCard(id){
 const data=guildDungeonData.traps[id];if(!data)return '<p>함정 정보 확인 중</p>';
 const f=data.fields,text=f.LCIncidenceMessage||f.LCDiscoverMessage||'길드 이벤트 함정';
 const typed=(field,value)=>concise(typedText(value,schemaField({object:'4160'},field)));
 const roles=[];
 if(f.discoverJob!==undefined&&typed('discoverJob',f.discoverJob)!=='없음')roles.push('발견 관련 직업: '+typed('discoverJob',f.discoverJob));
 if(f.releaseJob!==undefined&&typed('releaseJob',f.releaseJob)!=='없음')roles.push('해제 관련 직업: '+typed('releaseJob',f.releaseJob));
 return '<article class="acquisition-card"><p>'+esc(text.replaceAll('%1','모험가'))+'</p>'+(roles.length?'<p class="muted-note">'+esc(roles.join(' · '))+'</p>':'')+(f.LCDiscoverMessage?'<details><summary>발견 시 안내</summary><p>'+esc(f.LCDiscoverMessage.replaceAll('%1','모험가'))+'</p></details>':'')+'</article>';
}
function openGuildTrap(id){if(!$('detail').open)$('detail').showModal();$('detail-type').textContent='길드 이벤트 함정';$('detail-body').innerHTML='<h2 id="detail-title">함정 정보</h2>'+guildTrapCard(id);$('detail').scrollTop=0;}
const GUILD_GUIDES=[
 {title:'가입 · 운영',items:[['가입하려면','길드 검색에서 길드를 찾아 소개와 리더를 확인하세요. 길드 검색은 길드 시설 2레벨부터 표시됩니다.'],['직접 만들려면','길드 창설 기능은 시설 3레벨부터 표시됩니다. 길드명은 2–20자, 소개글은 10–200자, 세계관은 최대 400자입니다.'],['활동 유지','길드 생성 안내에는 2주 이상 발언이 없으면 길드가 사라질 수 있다고 안내되어 있습니다. 운영 중에는 게임 내 공지도 확인하세요.']]},
 {title:'길드 상점 · 공헌도',items:[['구매 비용','길드원이 등록한 장비를 구매할 때는 골드와 공헌도가 필요합니다. 자신의 장비를 다시 구매하는 확인창은 골드 비용만 안내합니다.'],['공헌도 얻기','공헌도가 부족하면 길드 이벤트를 진행해 쌓을 수 있다고 안내합니다. 장비를 받을 수 있는 모험가도 필요합니다.'],['판매와 회수','장비 판매 화면에서 길드를 선택할 수 있습니다. 길드 판매 가격은 일반 상점의 두 배로 안내되며, 팔리지 않은 장비는 직접 다시 사야 합니다.'],['재판매 제한','복원된 아이템과 길드 이벤트에서 구매한 아이템은 길드에 판매할 수 없습니다. 이미 판매 중인 장비가 있으면 해당 장비가 구매되거나 직접 회수된 뒤 다시 판매합니다.'],['현재 판매 품목','상점 재고는 길드원의 등록과 구매에 따라 달라집니다. 지금 판매 중인 장비와 가격은 게임의 길드 상점에서 확인하세요.']]},
 {title:'재료 교환',items:[['교환 방법','전달할 재료와 원하는 재료를 선택하고 수량을 정해 교환을 신청합니다. 거래가 성사되면 재료를 받습니다.'],['받을 수 있는 재료','한 번도 얻지 못한 재료는 교환으로 받을 수 없습니다. 전달할 재료의 보유 수량도 충분해야 합니다.'],['가입 직후 제한','길드에 익숙해지기 전에는 교환할 수 없다는 안내가 있습니다. 바로 이용되지 않으면 길드에 더 머문 뒤 다시 시도하세요. 정확한 대기 시간은 안내에 없습니다.'],['교환 신청 바꾸기','새 재료로 교환 신청을 바꾸면 기존에 신청한 재료는 돌아오지 않는다고 안내합니다. 변경 전에 품목과 수량을 확인하세요.']]},
 {title:'길드 이벤트',items:[['참가 전 준비','해당 지역을 먼저 공략한 상태여야 하며, 파티가 도시에 있어야 합니다. 앱 버전이 맞지 않으면 업데이트가 필요합니다.'],['재도전 제한','이미 클리어했거나 종료된 이벤트에는 도전할 수 없습니다.'],['일반 탐험과 다른 점','일반 탐험과 다른 적·함정·보물상자가 등장할 수 있고 모험가가 사망할 수도 있습니다. 도전 전에 리더에게 지역과 난이도를 확인하세요.'],['리더의 이벤트 만들기','시설 5레벨부터 이벤트 만들기 기능이 표시됩니다. 지도·지역·난이도·종료 시간을 정하고 멤버에게 내용을 알려주세요. 이벤트 이름은 2–20자, 설명은 10–1000자, 클리어 메시지는 최대 200자입니다.']]}
];
async function openGuild(){
 wikiActive=false;guideActive=false;modeSwitch(false);
 guildDungeonMode=false;
 if($('detail').open)$('detail').close();
 if(!guildData){const response=await fetch('data/guild.json');if(!response.ok)throw new Error('길드 안내를 읽지 못했습니다.');guildData=await response.json();}
 $('browser-panel').hidden=true;$('result-actions').hidden=true;$('more').hidden=true;$('current-section').textContent='길드';$('intro-title').textContent='길드 활용 안내';$('intro-subtitle').textContent='시설 해금부터 상점·재료 교환·이벤트까지.';$('result-title').textContent='길드에서 할 수 있는 일';$('result-count').textContent='';
 document.querySelectorAll('nav button').forEach(b=>{const active=b.dataset.view==='guild';b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 const building=records[guildData.buildingId],f=building.fields;
 const levels=[...new Set(guildData.features.map(x=>x.level))].sort((a,b)=>a-b);
 const dungeonLink='<section class="guild-section"><h3>길드 던전</h3><p class="muted-note">길드 추가 콘텐츠가 있는 '+guildDungeonData.stats.dungeons+'개 지역을 찾아보세요.</p><button data-view="guild-dungeons">길드 던전 목록 보기 ↗</button></section>';
 const unlocks='<section class="guild-section"><h3>시설 레벨별 기능</h3><div class="guild-unlocks">'+levels.map(level=>'<article><span class="guild-level">Lv. '+level+'</span><div>'+guildData.features.filter(x=>x.level===level).map(x=>'<span>'+esc(x.name)+'</span>').join('')+'</div></article>').join('')+'</div><p class="muted-note">내 마을에 건설하는 길드 시설의 레벨 기준입니다.</p></section>';
 const cards=GUILD_GUIDES.map(section=>'<details class="guild-topic"><summary>'+section.title+' <span>'+section.items.length+'개 항목</span></summary><div class="guild-guide-cards">'+section.items.map(([title,text])=>'<article><h4>'+title+'</h4><p>'+esc(text)+'</p></article>').join('')+'</div></details>').join('');
 const upgrades='<details class="guild-upgrades"><summary>시설 확장 재료 보기</summary><div class="guild-guide-cards">'+f.needLevelUPs.map((stage,index)=>'<article><h4>시설 '+(index+1)+'단계 · 성 레벨 '+num(stage.castleLevel)+'</h4><p>'+((stage.needMaterials||[]).map(m=>fieldValue(m.materialMaster)+' × '+esc(num(m.count))).join('<br>')||'필요 재료 없음')+'</p></article>').join('')+'</div></details>';
 $('rows').innerHTML='<div class="guild-guide"><div class="guild-overview"><div><small>시설 건설</small><strong>성 레벨 '+num(f.needCastleLevel)+'</strong></div><div><small>건설 비용</small><strong>'+num(buildingData.buildings[guildData.buildingId]?.stages[0]?.gold)+' G</strong></div><div><small>길드 검색</small><strong>시설 Lv. 2</strong></div><div><small>길드 창설</small><strong>시설 Lv. 3</strong></div></div>'+dungeonLink+guildClearRewards()+guildLevelGuide()+unlocks+cards+buildingSection(building)+'</div>';

}
function showGuild(){return openGuild().catch(error=>{$('error').hidden=false;$('error').textContent=error.message;});}
function download(filename,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportCSV(){
 const quote=value=>{let s=String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return'"'+s.replaceAll('"','""')+'"';};
 const keys=['type','name','level','maxLevel','tags','maps','dungeons'];
 const headers={id:'식별자',type:'종류',name:'한국어 이름',english:'영문 이름',japanese:'일본어 이름',internal:'내부 이름',level:'레벨',maxLevel:'최대 레벨',tags:'태그',maps:'지도',dungeons:'던전'};
 const lines=[keys.map(k=>headers[k]),...filtered.map(r=>keys.map(k=>k==='name'?displayName(r):k==='type'?TYPES[r.type]:k==='tags'?uniqueTags(r).map(t=>concise(t.name)).join(' / '):['maps','dungeons'].includes(k)?r[k].map(getName).join(' / '):r[k]))];
 download('aoa3-'+selected+'.csv','\uFEFF'+lines.map(row=>row.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8');
}
// Player guides turn verified records into preparation and acquisition decisions.
let guideActive=false,guideTab='prepare';
const guideState={dungeon:'',map:'',item:'',query:'',symptom:'progress',guild:false};
const GUIDE_TABS=[['prepare','던전 공략 준비','출발 전 준비와 층별 목표'],['equipment','장비·재료 구하기','원하는 효과에서 획득 경로까지'],['blocked','막힌 이유 찾기','실패한 단계부터 확인'],['event','길드 이벤트 준비','참가 조건과 추가 난도']];
const guideOptions=(list,value,empty)=>'<option value="">'+empty+'</option>'+list.map(r=>'<option value="'+esc(r.id)+'"'+(r.id===value?' selected':'')+'>'+esc(displayName(r))+'</option>').join('');
const guideStep=(n,title,body)=>'<article class="guide-step"><span class="guide-number">'+n+'</span><div><h3>'+esc(title)+'</h3>'+body+'</div></article>';
function modeSwitch(guide){document.querySelectorAll('[data-workspace]').forEach(b=>{b.classList.toggle('active',(b.dataset.workspace==='guide')===guide);b.setAttribute('aria-pressed',String((b.dataset.workspace==='guide')===guide));});}
function openGuide(tab=guideTab){
 wikiActive=false;
 if(!GUIDE_TABS.some(t=>t[0]===tab))tab='prepare';
 guideActive=true;guideTab=tab;guildDungeonMode=false;
 if($('detail').open)$('detail').close();
 $('browser-panel').hidden=true;$('result-actions').hidden=true;$('more').hidden=true;
 $('current-section').textContent='플레이 가이드';$('intro-title').textContent='이번 탐험, 무엇부터 할까요?';$('intro-subtitle').textContent='목표를 고르면 준비할 것과 다음 행동을 안내합니다.';$('result-title').textContent='플레이 가이드';$('result-count').textContent='';modeSwitch(true);
 document.querySelectorAll('nav button').forEach(b=>{const active=b.dataset.view==='guide';b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 const maps=rows.filter(r=>r.type==='map').sort((a,b)=>displayName(a).localeCompare(displayName(b),'ko'));
 const dungeons=rows.filter(r=>r.type==='dungeon'&&(!guideState.map||r.maps.includes(guideState.map))).sort((a,b)=>(a.level??Infinity)-(b.level??Infinity)||a.name.localeCompare(b.name,'ko'));
 if(guideState.dungeon&&!dungeons.some(d=>d.id===guideState.dungeon))guideState.dungeon='';
 let controls='<label>탐험할 지도<select id="guide-map">'+guideOptions(maps,guideState.map,'전체 지도')+'</select></label>';
 if(tab==='equipment')controls+='<label class="guide-search">장비 이름·원하는 효과<input id="guide-query" type="search" value="'+esc(guideState.query)+'" placeholder="예: 회피, HP 자동 회복, 마법 무기"></label><label class="guide-toggle"><input id="guide-guild" type="checkbox"'+(guideState.guild?' checked':'')+'>길드 전용 경로도 포함</label>';
 else controls+='<label>목표 던전<select id="guide-dungeon">'+guideOptions(dungeons,guideState.dungeon,'던전을 선택하세요')+'</select></label>';
 if(tab==='blocked')controls+='<label>어느 단계에서 막혔나요?<select id="guide-symptom">'+[['progress','다음 층으로 못 감'],['chest','원하는 상자를 발견 못 함'],['opening','상자를 못 엶'],['drop','몬스터를 잡아도 안 나옴'],['battle','전투에서 패배함'],['entry','길드 이벤트에 참가 못 함']].map(([v,n])=>'<option value="'+v+'"'+(guideState.symptom===v?' selected':'')+'>'+n+'</option>').join('')+'</select></label>';
 $('rows').innerHTML='<div class="player-guide"><div class="guide-tabs" aria-label="가이드 종류">'+GUIDE_TABS.map(([v,n,d])=>'<button data-guide-tab="'+v+'" aria-pressed="'+(v===tab)+'" class="'+(v===tab?'active':'')+'"><strong>'+n+'</strong><small>'+d+'</small></button>').join('')+'</div><div class="guide-controls">'+controls+'</div><div id="guide-output" aria-live="polite"></div></div>';
 $('guide-map').onchange=()=>{guideState.map=$('guide-map').value;openGuide();};
 if(tab==='equipment'){
  $('guide-query').oninput=()=>{guideState.query=$('guide-query').value;guideState.item='';renderGuide();};
  $('guide-guild').onchange=()=>{guideState.guild=$('guide-guild').checked;renderGuide();};
 }else $('guide-dungeon').onchange=()=>{guideState.dungeon=$('guide-dungeon').value;renderGuide();};
 if(tab==='blocked')$('guide-symptom').onchange=()=>{guideState.symptom=$('guide-symptom').value;renderGuide();};
 renderGuide();
}
function guideWelcome(){return '<div class="guide-empty"><h3>가고 싶은 던전을 선택하세요</h3><p>게임에서 현재 갈 수 있는 지역을 고르세요. 출발 준비 → 층별 목표 → 보상 확인 순서로 안내합니다.</p><p class="muted-note">여기에 표시하는 레벨은 데이터의 기본 레벨이며 권장 파티 레벨이나 클리어 보장은 아닙니다.</p></div>';}
function guidePrepare(dungeon,event=false){
 if(!dungeon)return guideWelcome();
 const floors=dungeon.fields.caveLevelMasters.map(x=>records[x.ref]);
 const chests=floors.flatMap(f=>f.fields.chestInfos.filter(c=>event||c.appearanceConditions!==4));
 const needs=[...new Set(chests.map(c=>c.chest.needItem?.ref).filter(id=>id&&id!=='0'))];
 const monsters=[...new Set(floors.flatMap(f=>(spawnFrom.get(f.id)||[]).filter(e=>event||e.appearanceConditions!==4).map(e=>e.monster)))].map(id=>records[id]);
 const threats=[['invalidPhysics','물리 공격 무효','물리 공격만으로 출발하지 말고 마법 공격 수단을 점검하세요.'],['invalidBow','활 공격 무효','활 이외의 공격 수단을 확인하세요.'],['isFly','비행 몬스터','해당 몬스터의 특수기와 공격 조건을 확인하세요.'],['invalidDamage','피해 무효 설정','상세 정보를 열어 별도 공략 조건을 확인하세요.']].map(([k,n,a])=>{const ms=monsters.filter(m=>m?.fields[k]===1);return ms.length?'<li><strong>'+n+'</strong> — '+a+'<div>'+ms.map(m=>jump(m.id)).join(' ')+'</div></li>':'';}).filter(Boolean);
 const dark=floors.filter(f=>f.fields.isDark===1);
 const traps=floors.filter(f=>f.fields.trapInfos.some(t=>(event||t.appearanceConditions!==4)&&t.frequency!==0)||f.fields.chestInfos.some(c=>(event||c.appearanceConditions!==4)&&c.chest.trap?.trapMaster?.ref!=='0'&&c.chest.trap?.trapMaster?.ref));
 const prep='<ul class="guide-checks">'+(needs.length?'<li><strong>필요 아이템부터 챙기기</strong><div>'+needs.map(jump).join(' ')+'</div><p>일부 상자를 여는 데 연결된 아이템입니다. 아이템 상세에서 획득처를 확인하세요.</p></li>':'<li>상자 개봉에 별도로 연결된 필요 아이템은 없습니다. 손재주·마법 판정은 따로 확인하세요.</li>')+(dark.length?'<li><strong>어둠 대비</strong> — '+dark.map(f=>f.floor+'층').join(', ')+'은 어두운 층입니다. 조명·어둠 대응 수단을 점검하세요.</li>':'')+(traps.length?'<li><strong>함정 대비</strong> — '+traps.map(f=>f.floor+'층').join(', ')+'에 함정이 연결되어 있습니다. 발견·해제 수단과 회복 준비를 확인하세요.</li>':'')+'</ul>';
 const targets='<div class="guide-floor-route">'+floors.map(f=>'<details class="source-group"'+(f===floors.at(-1)?' open':'')+'><summary>'+f.floor+'층'+(f===floors.at(-1)?' · 최종 목표':'')+' · 기본 레벨 '+esc(num(f.level))+'</summary>'+floorGoal(f,event)+'<p>'+(event?guildJump(f.id):jump(f.id))+'</p></details>').join('')+'</div>';
 const rewards=clearChestLoot(floors.at(-1),event);
 return '<div class="guide-context"><strong>'+esc(displayName(dungeon))+'</strong><span>'+floors.length+'개 층 · 기본 레벨 '+esc(levelText(dungeon))+'</span>'+(event?guildJump(dungeon.id):jump(dungeon.id))+'</div>'+guideStep(1,'출발 전에 챙길 것',prep)+guideStep(2,'전투 수단 점검',threats.length?'<p class="muted-note">아래는 몬스터 설정에 따른 준비 제안입니다. 실제 승패는 파티 구성과 장비에 따라 달라집니다.</p><ul class="guide-checks">'+threats.join('')+'</ul>':'<p>각 층의 몬스터 편성과 특수기를 확인하고, 주력 공격·회복 수단이 준비됐는지 점검하세요.</p>')+guideStep(3,'이번 탐험의 진행 순서',targets)+guideStep(4,'목표 보상을 확인하고 반복 여부 결정',rewards.length?'<p>최종 목표에 연결된 상자입니다. 발견·개봉 조건을 통과해야 내용물을 얻습니다.</p>'+lootRows(rewards):'<p>최종 층에 별도 클리어 보상 상자는 연결되어 있지 않습니다. 던전 상세와 각 몬스터 보상에서 목표 아이템을 확인하세요.</p>')+'<p class="guide-tip">상자를 못 찾거나 보상이 안 나왔다면 <button data-guide-tab="blocked">막힌 이유 찾기 →</button>에서 실패한 단계부터 확인하세요.</p>';
}
function guideAcquisitionRoutes(item){
 const routes=[];
 for(const loot of lootTo.get(item.id)||[]){
  if(loot.kind==='monster-drop')for(const spawn of spawnTo.get(loot.source)||[])routes.push({loot,floor:records[spawn.source],monster:records[loot.source],spawn});
  else routes.push({loot,floor:records[loot.source],monster:null,spawn:null});
 }
 const allowed=routes.filter(x=>x.floor?.type==='floor'&&(!guideState.map||x.floor.maps.includes(guideState.map))&&(guideState.guild||(x.spawn||x.loot).appearanceConditions!==4));
 return groupExact(allowed,x=>{const index=x.spawn?.field.match(/^monsterInfos\[(\d+)\]/)?.[1],party=index!==undefined?x.floor.fields.monsterInfos[Number(index)]:null;return JSON.stringify([x.floor.id,x.monster?.id||null,x.spawn?{...x.spawn,field:undefined}:null,party?{...party,key:undefined}:null,x.loot]);}).map(g=>g.entry).sort((a,b)=>(a.floor.level??Infinity)-(b.floor.level??Infinity)||a.floor.floor-b.floor.floor);
}
function guideEquipment(){
 const q=guideState.query.trim().normalize('NFKC').toLocaleLowerCase();
 if(!guideState.item){
  if(!q)return '<div class="guide-empty"><h3>원하는 장비나 효과를 입력하세요</h3><p>예를 들어 “마법 무기”, “HP 자동 회복”, “회피”로 찾은 뒤, 원하는 아이템을 선택하세요. 재료 이름으로도 찾을 수 있습니다.</p></div>';
  const items=rows.filter(r=>['weapon','armor','accessory','item','material'].includes(r.type)&&[displayName(r),...r.tags.map(t=>t.name)].some(s=>s.normalize('NFKC').toLocaleLowerCase().includes(q)));
  return '<p class="muted-note">'+items.length+'개 후보 · 이름·효과가 일치하는 후보입니다. 획득 경로는 선택 후 확인하세요.</p><div class="guide-item-grid">'+items.slice(0,30).map(r=>'<button data-guide-item="'+esc(r.id)+'"><strong>'+esc(displayName(r))+'</strong><small>'+TYPES[r.type]+' · 기본 레벨 '+esc(levelText(r))+'</small>'+tagMarkup(r,true)+'</button>').join('')+'</div>'+(items.length>30?'<p>처음 30개를 표시합니다. 이름이나 효과를 더 입력해 좁혀보세요.</p>':'')+(!items.length?'<p class="empty">일치하는 후보가 없습니다. 게임 내 이름이나 더 짧은 효과명으로 찾아보세요.</p>':'');
 }
 const item=records[guideState.item],shops=shopTo.get(item.id)||[],routes=guideAcquisitionRoutes(item);
 const renderRoute=x=>{const guild=(x.spawn||x.loot).appearanceConditions===4;const source=guild?guildJump(x.floor.id):jump(x.floor.id);return '<article class="guide-route"><div class="acquisition-head"><span class="source-chip">'+(guild?'길드 전용 · ':'')+(x.monster?'몬스터 드롭':x.loot.kind==='gathering'?'채집':'상자 개봉')+'</span>'+source+'</div><p>'+(x.monster?jump(x.monster.id)+'를 만나 토벌한 뒤 드롭을 확인하세요.':x.loot.kind==='gathering'?'해당 층에서 재료를 채집하세요.':'해당 층에서 상자를 발견하고 열어야 합니다.')+'</p>'+(x.spawn?'<p class="muted-note">출현: '+esc(concise(conditionName('Frequency',x.spawn.frequency)))+' · '+esc(concise(conditionName('AppearanceConditions',x.spawn.appearanceConditions)))+' / 드롭: '+esc(concise(conditionName('AcquisitionProbability',x.loot.acquisition)))+'</p>':'')+'<details><summary>시도 전에 확인할 조건</summary>'+lootRows([x.loot])+'</details><button data-guide-plan="'+esc(x.floor.dungeons[0])+'"'+(guild?' data-guide-event="true"':'')+'>이 던전 공략 준비 →</button></article>';};
 return '<div class="guide-context"><strong>'+esc(displayName(item))+'</strong>'+jump(item.id)+'<button data-guide-back>다른 후보 선택</button></div>'+guideStep(1,'상점으로 해결할 수 있는지 먼저 확인',shops.length?'<p>확률 획득을 시도하기 전에 상점 취급 단계와 내 마을의 확장 상태를 확인하세요. 현재 재고와 구매 가능 여부는 게임에서 확인해야 합니다.</p>'+shopRows(shops):'<p>고정 상점 취급 정보가 없습니다. 아래 탐험 경로를 확인하세요.</p>')+guideStep(2,'내가 갈 수 있는 획득 경로 선택','<p>선택한 지도에서 '+routes.length+'개 경로를 찾았습니다. 기본 층 레벨이 낮은 순이며, 드롭 효율 순위는 아닙니다.</p><div class="guide-routes">'+routes.slice(0,10).map(renderRoute).join('')+'</div>'+(routes.length>10?'<details><summary>나머지 '+(routes.length-10)+'개 경로 보기</summary>'+routes.slice(10).map(renderRoute).join('')+'</details>':'')+(!routes.length?'<p>현재 지도·길드 조건에 맞는 경로가 없습니다. 지도를 전체로 바꾸거나 길드 전용 경로 포함을 선택해보세요.</p>':''))+guideStep(3,'반복하기 전에 확인','<p>한 번만 또는 파티별로 획득 기록을 확인하는 경로는 같은 파티로 반복해도 다시 등장하지 않을 수 있습니다. 상자 복구와 획득 기록을 확인하세요. 빈도 이름은 정확한 획득 확률이나 시간당 효율을 뜻하지 않습니다.</p>');
}
const GUIDE_DIAGNOSES={
 progress:['다음 층으로 못 갈 때',['현재 층의 토벌·상자 개봉 목표를 확인하세요. 단순히 층에 도착한 것만으로 완료되지는 않습니다.','필요 횟수가 여러 번이면 이번 탐험에서 지정 행동을 그 횟수만큼 처리했는지 확인하세요.','문 개방 조건이 있으면 문을 먼저 여세요. 기존 획득·클리어 기록으로 통과하는 예외도 있습니다.']],
 chest:['상자를 못 찾았을 때',['먼저 일반 탐험에서 나오는 상자인지 길드 이벤트 전용인지 확인하세요.','출현 조건과 빈도를 확인하세요. 무작위 출현이면 한 번 탐험했다고 반드시 등장하지 않습니다.','이전에 얻은 기록이나 파티별 기록이 영향을 주는 조건인지 확인하세요.','상자 등장과 발견 판정은 구분해야 합니다. 발견 지력 판정값과 해당 층·길드 추가 난도를 확인하세요.']],
 opening:['상자를 발견했지만 못 열었을 때',['필요 아이템이 연결되어 있는지 먼저 확인하고 챙기세요.','상자의 손재주·마법 판정값을 확인하세요. 표시값 하나가 그대로 성공을 보장하는 필요 능력치는 아닙니다.','함정이 연결되어 있는지 확인하고 발견·해제·회복 수단을 점검하세요.','길드 이벤트라면 추가 레벨이 개봉 판정 난도에도 반영됩니다.']],
 drop:['몬스터를 잡아도 아이템이 안 나올 때',['원하는 아이템의 획득처가 그 몬스터의 드롭인지, 같은 던전의 상자인지 먼저 구분하세요.','그 몬스터의 드롭 빈도를 확인하세요. 클리어 목표 몬스터라도 아이템 드롭이 확정되는 것은 아닙니다.','획득처 가이드에서 다른 상점·상자·몬스터 경로를 비교하세요.','추가 레벨을 올렸다는 이유만으로 드롭 확률이 높아진다고 판단하지 마세요.']],
 battle:['전투에서 패배했을 때',['이번 층에 나오는 몬스터 편성과 특수기를 확인하세요.','물리·활 공격 무효 등 공격 수단을 막는 설정이 있는지 점검하세요.','어두운 층과 함정으로 전투 전 상태가 나빠졌는지 게임 로그에서 확인하세요.','길드 이벤트는 설정한 추가 레벨과 던전 고유 보정이 함께 적용됩니다. 난도를 낮출 수 있는지 리더와 확인하세요.']],
 entry:['길드 이벤트에 참가하지 못할 때',['해당 기본 지역을 먼저 클리어했는지 확인하세요.','파티가 도시에 있는지 확인하세요.','이미 클리어한 이벤트 또는 종료된 이벤트인지 확인하세요.','앱 버전이 맞는지 확인하고 필요한 경우 업데이트하세요.']]};
function guideBlocked(dungeon){const [title,steps]=GUIDE_DIAGNOSES[guideState.symptom];return '<div class="guide-empty"><h3>'+title+'</h3><p>아래 순서로 확인하세요. 현재 파티·세이브·실패 로그를 읽은 결과는 아니므로 실제 원인을 확정하지 않습니다.</p></div>'+steps.map((text,i)=>guideStep(i+1,'확인 '+(i+1),'<p>'+text+'</p>')).join('')+(dungeon?'<details class="guide-local" open><summary>'+esc(displayName(dungeon))+'의 실제 진행 조건 확인</summary>'+guidePrepare(dungeon)+'</details>':'<p class="guide-tip">목표 던전을 선택하면 해당 지역의 실제 층별 조건과 함께 확인할 수 있습니다.</p>')+'<button data-guide-tab="equipment">원하는 아이템의 다른 획득처 찾아보기 →</button>';}
function guideEvent(dungeon){return guideStep(1,'참가 가능 상태부터 확인','<ul class="guide-checks"><li>기본 지역 공략을 완료했는지 확인하세요.</li><li>파티가 도시에 있고 앱 버전이 맞는지 확인하세요.</li><li>이미 클리어했거나 종료된 이벤트는 재도전할 수 없습니다.</li></ul>')+guideStep(2,'보상보다 먼저 추가 난도 확인',guildLevelGuide(dungeon)+guildClearRewards(dungeon))+(dungeon?guideStep(3,'선택한 이벤트 지역의 준비와 목표',guidePrepare(dungeon,true)):'<p class="guide-tip">목표 던전을 고르면 지역 고유 보정과 출발 준비를 함께 볼 수 있습니다. 실제 개최 지역·추가 레벨·종료 시간은 게임 이벤트 화면에서 확인하세요.</p>');}
function renderGuide(){const dungeon=records[guideState.dungeon];$('guide-output').innerHTML=guideTab==='equipment'?guideEquipment():guideTab==='blocked'?guideBlocked(dungeon):guideTab==='event'?guideEvent(dungeon):guidePrepare(dungeon);}
function guideClick(event){
 const tab=event.target.closest('[data-guide-tab]');if(tab){openGuide(tab.dataset.guideTab);return true;}
 const target=event.target.closest('[data-guide-target]');if(target){guideState.item=target.dataset.guideTarget;openGuide('equipment');return true;}
 const item=event.target.closest('[data-guide-item]');if(item){guideState.item=item.dataset.guideItem;renderGuide();return true;}
 if(event.target.closest('[data-guide-back]')){guideState.item='';renderGuide();return true;}
 const plan=event.target.closest('[data-guide-plan]');if(plan){guideState.dungeon=plan.dataset.guidePlan;openGuide(plan.dataset.guideEvent?'event':'prepare');return true;}
 return false;
}

// Wiki curation is an explicit policy, not a drop-rate or survival simulator.
let wikiActive=false,wikiPage='home';
let wikiState={kingdom:0,search:0,query:'',moneyMode:'repeat',openMaps:null,excluded:[],maxFloors:{},party:[]};
try{const saved=JSON.parse(localStorage.getItem('aoa3-wiki-progress-v1')||'null');if(saved&&typeof saved==='object')for(const key of ['kingdom','search','openMaps','excluded','maxFloors'])if(key in saved)wikiState[key]=saved[key];}catch{}
wikiState.kingdom=Number.isInteger(wikiState.kingdom)&&wikiState.kingdom>=0&&wikiState.kingdom<=17?wikiState.kingdom:0;wikiState.search=Number.isInteger(wikiState.search)&&wikiState.search>=0&&wikiState.search<=17?wikiState.search:0;wikiState.openMaps=Array.isArray(wikiState.openMaps)?wikiState.openMaps.filter(x=>typeof x==='string'):null;wikiState.excluded=Array.isArray(wikiState.excluded)?wikiState.excluded.filter(x=>typeof x==='string'):[];
wikiState.maxFloors=wikiState.maxFloors&&typeof wikiState.maxFloors==='object'&&!Array.isArray(wikiState.maxFloors)?Object.fromEntries(Object.entries(wikiState.maxFloors).filter(([id,n])=>typeof id==='string'&&Number.isInteger(n)&&n>=0&&n<=1000)):{};
const WIKI_PAGES={home:'공략 위키 대문',materials:'재료 수급',money:'돈 수급 던전',experience:'경험치 던전',party:'생존과 파티 구성',progress:'왕국 성장과 지역 개방'};
function wikiSave(){try{localStorage.setItem('aoa3-wiki-progress-v1',JSON.stringify({kingdom:wikiState.kingdom,search:wikiState.search,openMaps:wikiState.openMaps,excluded:wikiState.excluded,maxFloors:wikiState.maxFloors}));}catch{}}
function wikiSearchBuilding(){return rows.find(r=>r.type==='building'&&r.internal==='SearchArea');}
function wikiMapGate(map){const stage=Number(map.fields.searchlevel)+1;return {stage,kingdom:wikiSearchBuilding().fields.needLevelUPs[stage-1]?.castleLevel??Infinity};}
function wikiPotentialMap(map){const gate=wikiMapGate(map);return (!wikiState.kingdom||gate.kingdom<=wikiState.kingdom)&&(!wikiState.search||gate.stage<=wikiState.search);}
function wikiMapAllowed(id){const m=records[id];return m?.type==='map'&&wikiPotentialMap(m)&&(!Array.isArray(wikiState.openMaps)||wikiState.openMaps.includes(id));}
function wikiFloorAllowed(floor){return floor?.type==='floor'&&(!Object.hasOwn(wikiState.maxFloors,floor.dungeons[0])||floor.floor<=wikiState.maxFloors[floor.dungeons[0]])&&!wikiState.excluded.includes(floor.dungeons[0])&&floor.maps.some(wikiMapAllowed);}
function wikiSetup(){const max=wikiSearchBuilding().fields.needLevelUPs.length;return '<details class="progress-disclosure"'+(['money','experience'].includes(wikiPage)&&!wikiState.kingdom?' open':'')+'><summary><span>내 왕국 · 탐험 범위</span><strong>'+ (wikiState.kingdom?'왕국 Lv. '+wikiState.kingdom:'미설정 · 전체 후보') +'</strong><span>설정 변경</span></summary><aside class="wiki-profile"><div><strong>내 왕국의 수급 범위</strong><small>왕국 조건은 개방 가능한 후보입니다. 시설 확장·탐색·던전 발견은 별도로 필요합니다.</small></div><label>왕국 레벨<select id="wiki-kingdom"><option value="0">미설정 · 전체 후보</option>'+Array.from({length:max},(_,i)=>'<option value="'+(i+1)+'"'+(wikiState.kingdom===i+1?' selected':'')+'>'+(i+1)+'</option>').join('')+'</select></label><label>탐색 스토어 현재 단계<select id="wiki-search"><option value="0">미설정 · 왕국 조건만 반영</option>'+Array.from({length:max},(_,i)=>'<option value="'+(i+1)+'"'+(wikiState.search===i+1?' selected':'')+'>'+(i+1)+'단계</option>').join('')+'</select></label><button data-wiki="progress">지역 개방 조정 →</button></aside></details>';}
function openWiki(page='home'){
 if(!(page in WIKI_PAGES))page='home';wikiActive=true;wikiPage=page;guideActive=false;guildDungeonMode=false;if($('detail').open)$('detail').close();
 modeSwitch(true);$('browser-panel').hidden=true;$('result-actions').hidden=true;$('more').hidden=true;$('current-section').textContent=WIKI_PAGES[page];$('intro-title').textContent=WIKI_PAGES[page];$('intro-subtitle').textContent='재료를 모으고, 자금을 마련하고, 살아 돌아오는 탐험.';$('result-title').textContent='AoA3 공략 위키';$('result-count').textContent='';
 document.querySelectorAll('nav button').forEach(b=>{const active=b.dataset.wiki===page;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 $('rows').innerHTML='<div class="wiki-shell">'+(page==='home'?'':wikiSetup())+'<article class="wiki-article" id="wiki-article"></article></div>';
 if(page!=='home'){$('wiki-kingdom').onchange=()=>{wikiState.kingdom=Number($('wiki-kingdom').value)||0;wikiSave();openWiki(page);};$('wiki-search').onchange=()=>{wikiState.search=Number($('wiki-search').value)||0;wikiSave();openWiki(page);};}
 renderWiki();
}
function wikiLink(page,text){return '<button class="wiki-link" data-wiki="'+page+'">'+esc(text||WIKI_PAGES[page])+'</button>';}
function wikiHome(){return '<div class="home-heading"><span class="section-kicker">YOUR NEXT ADVENTURE</span><h2>오늘의 탐험을 준비하세요.</h2><p>필요한 재료와 자금부터, 다음 모험을 위한 성장까지.</p></div><div class="supply-portals"><button class="supply-card material-portal" data-wiki="materials"><span class="portal-top"><span>GATHERING</span><span class="portal-symbol">♧</span></span><strong>재료 채집</strong><span class="portal-question">필요한 재료를 어디서 모을까?</span><span>재료별 추천 던전 · 층 · 채집 도구</span><span class="portal-bottom">수급처 비교하기 <b>↗</b></span></button><button class="supply-card gold-portal" data-wiki="money"><span class="portal-top"><span>GOLD FARMING</span><span class="portal-symbol">◈</span></span><strong>돈 수급 던전</strong><span class="portal-question">이번 탐험의 자금이 필요하다면.</span><span>던전 1~5위 · 몬스터와 상자 골드</span><span class="portal-bottom">골드 수급처 찾기 <b>↗</b></span></button><button class="supply-card experience-portal" data-wiki="experience"><span class="portal-top"><span>EXPERIENCE</span><span class="portal-symbol">✦</span></span><strong>경험치 던전</strong><span class="portal-question">모험가의 성장을 준비하려면?</span><span>던전 1~5위 · 귀환 기본 경험치 비교</span><span class="portal-bottom">경험치 던전 찾기 <b>↗</b></span></button></div><div class="directory-heading"><div><span class="section-kicker">ADVENTURER’S LIBRARY</span><h2>주제별로 찾아보기</h2></div><span>분류 → 목록 → 상세 정보</span></div>'+hubCards()+'<div class="home-progress"><span class="home-progress-mark">◎</span><div><h3>내 진행 상황에 맞는 추천</h3><p>왕국 레벨 · 개방 지역 · 도달 층을 설정해 수급 범위를 좁혀보세요.</p></div>'+wikiLink('progress','진행 상황 설정 →')+'</div><p class="wiki-note">추천은 선택한 진행 조건을 기준으로 계산합니다. 실제 파티·세이브를 자동으로 읽지는 않습니다.</p>';}

function wikiRisk(floor){const f=floor.fields;return (f.isDark===1?1:0)+(f.trapInfos.some(t=>t.frequency!==0)?1:0);}
// Reviewed native base draws. The timed renewal approximation below documents
// the additional scenario assumptions separately from these probabilities.
const MATERIAL_FREQUENCY_DRAW={10:0.5,11:0.375,12:0.09375,13:0.03125};
const MATERIAL_REWARD_DRAW={1:0.5,3:0.25,2:0.1875,4:0.05625,5:0.00625};
function materialRewardChance(monster,materialId){
 const slots=monster.fields.rewardMaterials||[];let chance=0;
 for(const [code,p] of Object.entries(MATERIAL_REWARD_DRAW)){const same=slots.filter(s=>String(s.acquisition)===code);if(same.length)chance+=p*same.filter(s=>s.materialMaster.ref===materialId).length/same.length;}
 return chance;
}
function materialSelectionWeights(entries,kind){
 const weights=new Map(entries.map(e=>[e,0]));
 for(const [code,p] of Object.entries(MATERIAL_FREQUENCY_DRAW)){
  let pool=kind==='gathering'?entries.filter(e=>e.frequency===5||e.frequency===Number(code)):entries.filter(e=>e.frequency===Number(code));
  if(kind==='monster'&&!pool.length)pool=entries.filter(e=>e.frequency===5);
  if(pool.length)for(const e of pool)weights.set(e,weights.get(e)+p/pool.length);
 }
 return weights;
}
function materialToolAccessible(tool){
 if(!wikiState.kingdom)return true;
 if((shopTo.get(tool.id)||[]).some(e=>Math.max(e.stage.castleLevel,records[e.shop].fields.needCastleLevel)<=wikiState.kingdom))return true;
 return (lootTo.get(tool.id)||[]).some(e=>e.kind==='monster-drop'?(spawnTo.get(e.source)||[]).some(sp=>sp.appearanceConditions!==4&&sp.frequency!==0&&wikiFloorAllowed(records[sp.source])):e.appearanceConditions!==4&&e.frequency!==0&&wikiFloorAllowed(records[e.source]));
}
function materialNumber(n){return Number(n).toLocaleString('ko-KR',{maximumFractionDigits:6});}
// Analytical renewal approximation, not a replay of the full navigation engine.
// Native Party.NextProcessingInterval / GameSettings: one adventure tick = 10 real seconds.
// SpendAdventureTimeInterval (5) is in-game minutes, not elapsed real seconds.
const ADVENTURE_TICK_SECONDS=10;
// Anonymous aggregate calibration only; personal histories stay outside this repository.
const YIELD_CALIBRATION=Object.freeze({histories:472,timingTrainSegments:39893,timingValidationSegments:9473,navigationTrainSegments:41008,navigationValidationSegments:9970,roomWeightMultiplier:0.3651968230314175,validationOldMAE:146.37496041380766,validationNewMAE:17.85143456137828});
const YIELD_DEFAULTS={runs:20,hours:10,battleSeconds:34.304551,overheadSeconds:6.188817,chestSeconds:33.653434,transitMinutes:0,food:20,winPercent:100,openPercent:100,adventureLevel:0,experienceStartFloor:1};
function cleanYieldSettings(value){const out={...YIELD_DEFAULTS};for(const [key,min,max] of [['adventureLevel',0,100],['experienceStartFloor',1,1000],['runs',1,1000],['food',0,1000],['hours',0.1,240],['battleSeconds',0,3600],['overheadSeconds',0,3600],['chestSeconds',0,3600],['transitMinutes',0,14400],['winPercent',0,100],['openPercent',0,100]]){const n=value?.[key];if(typeof n==='number'&&Number.isFinite(n))out[key]=Math.max(min,Math.min(max,['runs','food','adventureLevel','experienceStartFloor'].includes(key)?Math.round(n):n));}return out;}
function migrateYieldSettings(saved){
 const value={...saved};for(const [key,old]of Object.entries({battleSeconds:60,overheadSeconds:30,chestSeconds:15}))if(value[key]===old)delete value[key];return cleanYieldSettings(value);
}
let yieldSettings={...YIELD_DEFAULTS};
try{const current=localStorage.getItem('aoa3-yield-model-v2');yieldSettings=current?cleanYieldSettings(JSON.parse(current)):migrateYieldSettings(JSON.parse(localStorage.getItem('aoa3-yield-model-v1')||'null'));}catch{}
let yieldFloorCache=new Map(),yieldCacheKey='';
function yieldSettingsPanel(){
 const money=['money','experience'].includes(wikiPage),controls=[...(!money?[['runs','재료 평가 반복 횟수','회',1,1000]]:[]),['hours','회당 탐험 시간 상한','시간',0.1,240],['food','가져갈 식량 · 0은 제한 없음','개',0,1000],['battleSeconds','전투 1건당 추가 지연','초',0,3600],['overheadSeconds','구간당 기타 추가 지연','초',0,3600],['chestSeconds','상자 처리 추가 지연 · 근사값','초',0,3600],['transitMinutes','회당 목표 층 밖 소요 시간','분',0,14400],['winPercent','전투 보상 획득률','%',0,100],['openPercent','상자 발견·개봉 성공률','%',0,100]];
 return '<details class="wiki-method yield-settings"><summary>계산 조건 · 회당 최대 '+yieldSettings.hours+'시간 · 식량 '+(yieldSettings.food||'제한 없음')+'</summary><p>이동은 모험 1틱당 실제 10초로 계산합니다. 처리 시간은 이동 중 겹치는 시간을 제외한 추가 지연입니다. 단회 대상은 완료했고 시간 복구형 대상은 아직 재활성화되지 않은 반복 수급을 가정합니다. 기본값은 실제 기록으로 보정했으며 파티에 맞게 바꿀 수 있습니다.</p><div class="wiki-inline-controls">'+controls.map(([key,label,unit,min,max])=>'<label>'+label+' ('+unit+')<input type="number" data-yield-setting="'+key+'" min="'+min+'" max="'+max+'" step="any" value="'+yieldSettings[key]+'"></label>').join('')+'</div><button data-yield-reset>실측 보정 기본값 복원</button><p class="muted-note">식량 한도와 시간 상한 중 먼저 도달하는 시점까지만 계산합니다. 목표 층 밖 소요 시간은 그 한도에서 차감합니다. 공포·부상에 따른 조기 귀환은 파티별 차이가 커 자동 예측하지 않습니다.'+(money?' 채집 행동·채집 시간·아이템 판매액은 모두 제외합니다.':' 재료 평가는 채집과 몬스터 드롭을 합산합니다. 반복 횟수는 측정 표본 수가 아닙니다.')+'</p></details>';
}
function yieldPolicy(){return '<details class="wiki-method"><summary>평가 기준 · 실제 기록으로 보정한 범위</summary><p>472개 모험 기록을 확인하고 일반 모험의 완료된 구간을 대조했습니다. 채집이 실행된 구간·층 전환·귀환 구간은 시간 보정에서 제외했습니다. 개인 세이브와 모험별 기록은 사이트에 공개하지 않습니다.</p><p>이동 간격은 게임 코드의 10초를 적용합니다. 이동 중 이벤트가 겹치는 것을 고려해 구간당 기타 지연 '+yieldNumber(YIELD_DEFAULTS.overheadSeconds)+'초, 전투당 추가 지연 '+yieldNumber(YIELD_DEFAULTS.battleSeconds)+'초, 상자 처리 추가 지연(근사) '+yieldNumber(YIELD_DEFAULTS.chestSeconds)+'초를 기본값으로 사용합니다. 사용자가 조정한 값이 있으면 그 값을 우선합니다.</p><p>보정에 사용하지 않은 다른 던전의 9,473개 구간에서 시간 절대오차 평균은 기존 약 146.4초에서 17.9초로 줄었습니다. 관측된 전투 완료 건수와 골드 획득 메시지 수를 입력한 조건부 시간 검증이며, 골드·전체 탐험 수익의 예측 정확도가 같은 수준이라는 뜻은 아닙니다.</p><p>상자 시간 계수는 모든 개봉을 직접 측정한 값이 아니라 골드 획득 메시지를 대리변수로 맞춘 값입니다. 발견·개봉·보상 메시지가 다르면 오차가 커질 수 있습니다. 상자 발견 수와 골드 메시지 수가 달랐던 별도 검증 25구간의 시간 절대오차 평균은 약 152초였습니다. 이 계수를 모든 상자의 실제 처리 시간으로 해석하지 마세요.</p><p>방 가중치를 실측 경로에 맞춰 보정합니다. 별도 검증 구간의 방 방문 합계 오차는 약 +81.7%에서 −11.3%로 줄었습니다. 개별 던전·파티의 실제 동선을 완전히 재현하지는 않습니다. 표본이 적은 던전별 드롭 확률이나 상자 골드 자체는 실측 평균으로 덮어쓰지 않았습니다.</p><p>골드는 반복 상자와 몬스터의 직접 골드만 합산합니다. 단회·시간 복구·길드·클리어 표시 보상과 채집·재료·도구·소모품·장비 판매액은 합산하지 않습니다. 보상에서 제외한 후보도 추첨 경쟁에는 남깁니다. 식량·치료 비용 차감 전 수입입니다. 재료 평가는 채집 도구 충분·직업 추가 보상 없음 조건으로 별도 계산합니다.</p><p>단회 대상은 완료했고 시간 복구형 대상은 아직 재활성화되지 않아 실행되지 않는 일반 반복 수급 조건입니다. 반복형 클리어 전투는 보상을 제외하더라도 전투 시간에 포함하며, 첫 호출에서 클리어 전투가 잡히면 추가 편성을 만들지 않습니다. 시간 복구형 보상이 다시 활성화되거나 미완료 대상이 있는 파티의 수익·소요 시간은 달라질 수 있습니다.</p><p>식량 소진 시점은 식사 주기와 처리 지연을 반영한 근사입니다. 층 이동·중도 귀환과 캐릭터 사망, 추가 레벨·보상 보정은 완전한 전투 시뮬레이션 대상이 아닙니다. 시간당 수입은 입력한 시간 상한 대신 실제로 계산한 탐험 시간을 분모로 사용합니다.</p></details>';}
function yieldSummary(x,unit){return '<strong>'+yieldNumber(x.perRun)+' '+unit+'</strong><small>1회 평균 추정 · 목표 층 '+yieldNumber(x.activeSeconds/3600)+'시간</small><small>시간당 '+yieldNumber(x.perHour)+' '+unit+'</small>';}
function yieldNumber(n){return Number(n).toLocaleString('ko-KR',{maximumFractionDigits:n>0&&n<0.01?6:2});}
function expectedMonsterGold(base){return base<=0?0:base===1?7/6:base;}
function yieldTimeBudget(){
 // Eating is requested after 288 ticks; completed meals add 3 processing ticks.
 const foodSeconds=yieldSettings.food>0?(288+(yieldSettings.food-1)*291)*ADVENTURE_TICK_SECONDS:Infinity;
 const runSeconds=Math.min(yieldSettings.hours*3600,foodSeconds),activeSeconds=Math.max(0,runSeconds-yieldSettings.transitMinutes*60);
 return {runSeconds,activeSeconds,foodLimited:foodSeconds<yieldSettings.hours*3600};
}
function yieldTotals(perRun){const {runSeconds}=yieldTimeBudget();return {perRun,total:perRun*yieldSettings.runs,perHour:runSeconds>0?perRun/(runSeconds/3600):0};}
// Candidate competition is preserved even when the selected reward is excluded.
// Normal repeat-farming scenario: non-type10 entries are already unavailable.
// Type10 clear battles still execute and consume time; their payouts are not credited.
function yieldSelectionWeights(entries,kind,context,additional=false){
 const weights=new Map(entries.map(e=>[e,0]));
 for(const [code,p]of Object.entries(MATERIAL_FREQUENCY_DRAW)){
  let pool=entries.filter(e=>e.frequency===Number(code)&&e.appearanceConditions!==4);
  if(!pool.length)pool=entries.filter(e=>e.frequency===5&&e.appearanceConditions!==4);
  if(!pool.length)pool=entries.filter(e=>e.frequency===5);
  if(context!=='room')pool=pool.filter(e=>!e.isRoom);
  if(kind==='monster'&&additional)pool=pool.filter(e=>!e.isClear&&e.appearanceConditions!==4);
  if(pool.length)for(const e of pool)weights.set(e,weights.get(e)+p/pool.length);
 }
 return weights;
}
function yieldMonsterSchedule(floor,context){
 const groups=floor.fields.monsterInfos,first=yieldSelectionWeights(groups,'monster',context),extra=yieldSelectionWeights(groups,'monster',context,true);
 // A scheduled clear battle blocks extra calls; other completed/time-restored
 // candidates compete in selection but do not schedule under this scenario.
 const trigger=groups.reduce((p,e)=>p+(e.appearanceConditions===10&&!e.isClear?(first.get(e)||0):0),0);
 const attempts=Math.max(0,floor.fields.maxMonsterAppearanceCount-1);
 return new Map(groups.map(e=>[e,e.appearanceConditions===10?(first.get(e)||0)+trigger*attempts*(extra.get(e)||0):0]));
}
function yieldRepeatTarget(e){return e.appearanceConditions===10&&!e.isClear;}
// Native Material.Price / Item.BasePrice / Equip.GetSellPrice; fresh, unbroken loot.
function yieldEquipBasePrice(level,threshold){if(!Number.isInteger(level)||level<1)return 0;let value=100*2**(Math.min(level,threshold)-1);for(let i=threshold;i<level;i++)value=Math.trunc(value*1.4);return Math.max(100,value);}
function yieldSaleUnitPrice(record){
 if(record?.type==='item'){const base=record.fields.price>0?record.fields.price:yieldEquipBasePrice(record.fields.level,12);return Math.max(1,Math.trunc(base/10));}
 return 0;
}
const monsterSaleRewardCache=new Map();
function monsterItemSaleRewards(monster){
 if(monsterSaleRewardCache.has(monster.id))return monsterSaleRewardCache.get(monster.id);
 const f=monster.fields,all=[...(f.rewardWeapons||[]),...(f.rewardArmors||[]),...(f.rewardAccessorys||[]),...(f.rewardItems||[])],result=[];
 for(const slot of f.rewardItems||[]){const same=all.filter(x=>x.acquisition===slot.acquisition),chance=(MATERIAL_REWARD_DRAW[slot.acquisition]||0)/(same.length||1);if(chance&&records[slot.itemMaster.ref]?.type==='item')result.push({id:slot.itemMaster.ref,chance});}
 monsterSaleRewardCache.set(monster.id,result);return result;
}
function yieldSaleBreakdown(model){const list=[...model.sales.values()].sort((a,b)=>b.quantity*b.unitPrice-a.quantity*a.unitPrice);return '<details class="wiki-method"><summary>장비 제외 판매 수익 내역</summary><p>획득한 도구·소모품·환금용 아이템을 전량 판매하는 가정입니다. 판매가로 확인되지 않은 재료 가격은 합산하지 않습니다. 도구·소모품은 획득 직후의 미사용·비파손 상태로 계산하며, 무기·방어구·장신구는 제외합니다. 실제 판매 전에는 필요한 도구와 소모품을 남겨두세요.</p>'+(list.length?'<div class="wiki-table-wrap"><table class="wiki-table"><thead><tr><th>판매 품목</th><th>회당 예상 수량</th><th>개당 판매가</th><th>회당 판매 기대액</th></tr></thead><tbody>'+list.map(x=>'<tr><th>'+jump(x.id)+'</th><td>'+yieldNumber(x.quantity*model.visits)+'</td><td>'+yieldNumber(x.unitPrice)+' 골드</td><td>'+yieldNumber(x.quantity*x.unitPrice*model.visits)+' 골드</td></tr>').join('')+'</tbody></table></div>':'<p>현재 계산 조건에서 판매 수익이 있는 품목이 없습니다.</p>')+'</details>';}

function yieldFloorModel(floor,mode='materials'){
 const money=mode==='money',cacheId=floor.id+':'+mode;
 const key=JSON.stringify([yieldSettings,wikiState.kingdom,wikiState.search,wikiState.openMaps,wikiState.excluded,wikiState.maxFloors]);if(key!==yieldCacheKey){yieldFloorCache.clear();yieldCacheKey=key;}if(yieldFloorCache.has(cacheId))return yieldFloorCache.get(cacheId);
 const dungeon=records[floor.dungeons[0]],roads=floor.fields.roads.map(e=>({weight:Math.max(0,e.appearanceRate)*(records[e.roadMaster.ref]?.fields.isRoom?YIELD_CALIBRATION.roomWeightMultiplier:1),road:records[e.roadMaster.ref]})).filter(e=>e.road?.type==='road'&&e.weight>0),weight=roads.reduce((n,e)=>n+e.weight,0);
 if(!weight){yieldFloorCache.set(cacheId,null);return null;}
 const roomShare=roads.reduce((n,e)=>n+(e.road.fields.isRoom?e.weight:0),0)/weight;
 const moveSeconds=roads.reduce((n,e)=>n+e.weight*Math.max(1,Math.trunc(e.road.fields.moveTime*dungeon.fields.moveTime))*ADVENTURE_TICK_SECONDS,0)/weight;
 const materials=new Map(),add=(id,amount,kind,tools=[])=>{if(!amount||records[id]?.type!=='material')return;if(!materials.has(id))materials.set(id,{gather:0,drop:0,tools:[]});const e=materials.get(id);e[kind]+=amount;for(const tool of tools)if(!e.tools.some(t=>t.id===tool.id))e.tools.push(tool);};
 const sales=new Map(),addSale=(id,quantity)=>{const record=records[id],unitPrice=yieldSaleUnitPrice(record);if(!quantity||!unitPrice||record?.type!=='item')return;if(!sales.has(id))sales.set(id,{id,type:record.type,quantity:0,unitPrice});sales.get(id).quantity+=quantity;};
 let gatherSeconds=0,battles=0,chests=0,goldMonster=0,goldChest=0,combatExp=0;
 for(const [context,share]of [['room',roomShare],['corridor',1-roomShare]]){
  if(!share)continue;
  const gather=(money?[]:floor.fields.materialInfos).filter(e=>(context==='room'||!e.isRoom)&&e.frequency!==0),gw=materialSelectionWeights(gather,'gathering');
  for(const e of gather){const p=(gw.get(e)||0)*share,tools=rows.filter(r=>r.type==='item'&&r.fields.canGetMaterial?.ref===e.materialMaster.ref&&materialToolAccessible(r));if(!tools.length)continue;add(e.materialMaster.ref,p,'gather',tools);gatherSeconds+=p*Math.min(...tools.map(t=>t.fields.getMaterialTime))*ADVENTURE_TICK_SECONDS;}
  const mw=yieldMonsterSchedule(floor,context);
  for(const [group,mass]of mw){const selection=mass*share;battles+=selection;if(!yieldRepeatTarget(group))continue;for(const wrap of group.wrapMonsterMasters){const monster=records[wrap.master.ref];if(!monster)continue;combatExp+=selection*Math.max(0,monster.level+wrap.level)*10*yieldSettings.winPercent/100;goldMonster+=selection*expectedMonsterGold(monster.fields.gold)*yieldSettings.winPercent/100;if(!money)for(const reward of monsterItemSaleRewards(monster))addSale(reward.id,selection*reward.chance*yieldSettings.winPercent/100);for(const id of new Set((monster.fields.rewardMaterials||[]).map(e=>e.materialMaster.ref)))add(id,selection*materialRewardChance(monster,id)*yieldSettings.winPercent/100,'drop');}}
  const entries=floor.fields.chestInfos,cw=yieldSelectionWeights(entries,'chest',context);
  for(const e of entries){if(!yieldRepeatTarget(e))continue;const p=(cw.get(e)||0)*share;chests+=p;const lo=e.chest.minGold,hi=e.chest.maxGold,mean=hi>lo?(lo+hi-1)/2:lo;const boost=wikiState.kingdom===1?10:wikiState.kingdom===2?5:1;goldChest+=p*mean*boost*yieldSettings.openPercent/100;if(!money&&hi<=0&&lo<=0){const c=e.chest;if(records[c.material?.ref]?.type==='material')addSale(c.material.ref,p*yieldSettings.openPercent/100);else if(!['weapon','armor','accessory'].some(k=>c[k]?.ref&&c[k].ref!=='0'))addSale(c.item?.ref,p*yieldSettings.openPercent/100);}}
 }
 const cycleSeconds=moveSeconds+gatherSeconds+battles*yieldSettings.battleSeconds+chests*yieldSettings.openPercent/100*yieldSettings.chestSeconds+yieldSettings.overheadSeconds;
 const budget=yieldTimeBudget(),{activeSeconds}=budget,visits=cycleSeconds>0?activeSeconds/cycleSeconds:0;
 if(!money)for(const [id,entry]of materials)addSale(id,entry.gather+entry.drop);
 let goldItemSales=0;for(const sale of sales.values())goldItemSales+=sale.quantity*sale.unitPrice;
 const goldSales=goldItemSales;
 const result={floor,mode,...budget,roomShare,moveSeconds,gatherSeconds,battles,chests,cycleSeconds,visits,materials,sales,goldMonster,goldChest,goldItemSales,goldSales,combatExp,...yieldTotals((goldMonster+goldChest+goldSales)*visits)};yieldFloorCache.set(cacheId,result);return result;
}
function yieldModelEvidence(model){return (model.foodLimited?'<p class="wiki-note">식량 한도로 회당 최대 '+yieldNumber(model.runSeconds/3600)+'시간을 계산합니다.</p>':'')+'<p>실측 경로 보정 방 비중 '+yieldNumber(model.roomShare*100)+'% · 평균 구간 '+yieldNumber(model.cycleSeconds/60)+'분 · 회당 '+yieldNumber(model.visits)+'구간 추정</p><p>회당 전투 편성 (클리어 전투 포함) '+yieldNumber(model.visits*model.battles)+'개 · 반복 상자 선택 '+yieldNumber(model.visits*model.chests)+'회 추정</p>';}

const FARMING_EXCEPTION_DUNGEONS=new Set(['-4356431506490543496']);
function isFarmingException(floor){return floor.dungeons.some(id=>FARMING_EXCEPTION_DUNGEONS.has(id));}
function wikiMaterialCandidates(material){return wikiMaterialSources(material,false);}
const MATERIAL_RUNNER_UP_MIN_RATIO=0.5;
function selectMaterialRecommendations(candidates){
 const unique=[],seen=new Set();for(const x of candidates){const dungeon=x.floor.dungeons[0];if(seen.has(dungeon))continue;seen.add(dungeon);unique.push(x);if(unique.length===2)break;}
 if(!unique.length)return [];
 const [first,second]=unique,ratio=second?second.total/first.total:0,same=!!second&&Math.abs(first.total-second.total)<=Math.max(first.total,second.total)*1e-9;
 const result=[{...first,rank:1,comparison:!second?'일반 수급 던전 한 곳':same?'수급량 동일':'수급량 우세 · 다른 던전 대비 +'+yieldNumber((first.total/second.total-1)*100)+'%',advantaged:!!second&&!same,runnerUpHidden:!!second&&ratio<MATERIAL_RUNNER_UP_MIN_RATIO}];
 if(second&&ratio>=MATERIAL_RUNNER_UP_MIN_RATIO)result.push({...second,rank:2,comparison:same?'수급량 동일':'1순위의 '+yieldNumber(ratio*100)+'%',advantaged:false});
 return result;
}
function wikiMaterialRecommendations(material){return selectMaterialRecommendations(wikiMaterialCandidates(material));}
function includeMaterialException(normal,exception){
 if(!normal.length)return [];
 const list=normal.map(x=>({...x,isException:false}));if(exception&&exception.total>=normal[0].total*MATERIAL_RUNNER_UP_MIN_RATIO)list.push({...exception,isException:true,comparison:'',rank:null});
 const max=Math.max(...list.map(x=>x.total)),topCount=list.filter(x=>Math.abs(x.total-max)<=max*1e-9).length;
 for(const x of list){const atTop=Math.abs(x.total-max)<=max*1e-9;x.advantaged=list.length>1&&atTop&&topCount===1;
  if(x.isException)x.comparison=atTop&&topCount>1?'수급량 동일':'일반 1순위의 '+yieldNumber(x.total/normal[0].total*100)+'%';
  else x.comparison=x.comparison.replace('수급량 우세 · 다른 던전 대비','일반 대안 대비');
 }
 return list;
}
function materialDisplayRecommendations(material){const normal=wikiMaterialRecommendations(material);return normal.length?includeMaterialException(normal,wikiMaterialExceptions(material)[0]):[];}
function materialStarScore(mean){return Number.isFinite(mean)&&mean>0?Math.floor((mean+1e-9)/2.5)/2:0;}
function materialStars(x){const score=materialStarScore(x.perRun),full=Math.floor(score),half=score%1!==0,text=score>5?'★ × '+yieldNumber(score):score===0?'☆':'★'.repeat(full)+(half?'½★':'');return '<span class="material-stars" role="img" aria-label="'+score+'별 · 20회 평균 기대량 기준">'+text+'</span>';}
function materialRankBadge(x){return '<span class="material-rank-badge'+(x.advantaged?' material-rank-best':'')+'">'+(x.isException?'예외 · 도적의 숲':x.rank+'순위')+(x.advantaged?' · 수급량 우세':'')+'<small>'+esc(x.comparison)+'</small></span>';}
function materialRecommendationDetail(material){const picks=materialDisplayRecommendations(material);return '<section class="detail-section"><h3>현재 수급 범위의 추천 던전</h3>'+materialRankingPolicy()+(picks.length?picks.map(x=>'<section class="material-rank-detail'+(x.isException?' material-exception':'')+'">'+materialRankBadge(x)+'<p>'+materialFloorLink(x.floor)+'</p>'+materialStars(x)+materialEvidence(x)+'</section>').join(''):'<p>현재 개방 설정에 맞는 일반 추천 경로가 없습니다.</p>')+'<button data-wiki="progress">왕국·지역 개방 설정</button></section>';}
function materialRankingPolicy(){return '<p class="muted-note">20회 평균 기대량 기준으로 2.5개마다 ½★를 표시합니다. 일반 1·2순위는 서로 다른 던전의 가장 좋은 층이며, 2순위가 1순위의 50% 미만이면 생략합니다. 도적의 숲도 일반 1순위의 50% 이상이면 같은 표에 예외 수급처로 추가합니다. 도적의 숲에서만 나오는 재료는 숨깁니다.</p>';}
function wikiMaterialExceptions(material){return wikiMaterialSources(material,true);}
function wikiMaterialSources(material,exception){
 return rows.filter(r=>r.type==='floor'&&wikiFloorAllowed(r)&&isFarmingException(r)===exception).map(floor=>{const model=yieldFloorModel(floor),entry=model?.materials.get(material.id);if(!entry)return null;const totals=yieldTotals((entry.gather+entry.drop)*model.visits);return {...totals,score:totals.total,floor,model,...entry,kind:entry.gather>0?0:2};}).filter(x=>x&&x.total>0).sort((a,b)=>b.total-a.total||wikiRisk(a.floor)-wikiRisk(b.floor)||(a.floor.level??Infinity)-(b.floor.level??Infinity)||a.floor.floor-b.floor.floor||a.floor.id.localeCompare(b.floor.id));
}
function materialFloorLink(floor){return '<button class="ref-button" data-id="'+esc(floor.id)+'">'+esc(getName(floor.dungeons[0]))+' · '+floor.floor+'층 ↗</button>';}
function wikiMaterialReason(x){return x.gather>0&&x.drop>0?'채집 + 몬스터 드롭':x.gather>0?'도구 채집':'몬스터 드롭';}
function materialEvidence(x){return '<details class="material-evidence"><summary>추천 근거 · 준비물</summary>'+(x.tools.length?'<p>필요 채집 도구: '+x.tools.map(t=>jump(t.id)).join(' · ')+'</p><p>도구는 사용할 수 있는 상태로 충분히 준비해야 합니다. 직업 단축 없이 기본 사용 시간을 반영했습니다.</p>':'')+'<p>'+wikiMaterialReason(x)+' 경로입니다.</p><p class="muted-note">동일 등급 보상 경쟁·편성 마릿수와 방 비중을 반영한 추정입니다. 도구 파손·추가 직업 보상·실제 탐험 경로에 따라 달라집니다.</p></details>';}
function wikiMaterials(){return '<p class="wiki-lead">재료 이름을 검색해 추천 던전과 층, 필요한 채집 도구를 확인하세요.</p><details class="wiki-method supply-help"><summary>추천 순위 · 별점 · 탐험 범위 안내</summary><p>현재 개방 범위에서 재료별 <strong>1·2순위 던전과 각 던전의 추천 층</strong>을 안내합니다. 같은 시간·횟수의 평균 추정량으로 비교하며, 일반 수급처가 없는 재료는 숨깁니다.</p><p>목표 층 체류와 입력한 성공률을 가정한 추정값입니다. 도달 층은 <button data-wiki="progress">지역·도달 층 설정</button>에서 제한하세요.</p>'+materialRankingPolicy()+'</details>'+yieldSettingsPanel()+'<label class="wiki-find">재료 찾기<input id="wiki-material-query" type="search" value="'+esc(wikiState.query)+'" placeholder="재료 이름 검색"></label><div id="wiki-material-picks"></div><details class="wiki-method" id="material-policy"><summary>평가 기준과 확인 범위</summary>'+yieldPolicy()+'</details>';}

function renderMaterialPicks(){
 const q=wikiState.query.trim().toLocaleLowerCase(),items=rows.filter(r=>r.type==='material'&&displayName(r).toLocaleLowerCase().includes(q)).map(material=>({material,picks:materialDisplayRecommendations(material)})).filter(x=>x.picks.length).sort((a,b)=>b.picks[0].total-a.picks[0].total||a.material.name.localeCompare(b.material.name,'ko'));
 $('wiki-material-picks').innerHTML='<h2 id="material-picks">재료별 추천 던전 · 층</h2><p class="muted-note">일반 수급처가 있는 재료 '+items.length+'종 · 일반 최대 2순위 + 조건에 맞는 예외 · 수급량 순</p><div class="wiki-table-wrap"><table class="wiki-table"><thead><tr><th>재료</th><th>순위 · 추천 던전 · 층</th><th>수급 평가</th><th>준비와 근거</th></tr></thead><tbody>'+items.map(({material:m,picks})=>picks.map((x,i)=>'<tr'+(x.isException?' class="material-exception"':'')+(i===0?' data-material-group="'+esc(m.id)+'"':'')+'>'+(i===0?'<th scope="rowgroup" rowspan="'+picks.length+'">'+jump(m.id)+'</th>':'')+'<td>'+materialRankBadge(x)+'<br>'+materialFloorLink(x.floor)+'<small>'+esc(wikiMaterialReason(x))+'</small></td><td>'+materialStars(x)+'</td><td>'+materialEvidence(x)+'<button data-guide-plan="'+esc(x.floor.dungeons[0])+'">출발 준비 →</button> <button data-wiki-exclude="'+esc(x.floor.dungeons[0])+'">아직 미개방 · 제외</button></td></tr>').join('')).join('')+'</tbody></table></div>'+(items.length?'':'<p>현재 설정과 검색어에 맞는 반복 수급 가능한 재료가 없습니다. 왕국·지역 개방 설정이나 검색어를 확인하세요.</p>');
}
function wikiMoneyCandidates(){return rows.filter(r=>r.type==='floor'&&wikiFloorAllowed(r)&&!isFarmingException(r)).map(floor=>yieldFloorModel(floor,'money')).filter(x=>x&&x.perRun>0).sort((a,b)=>b.perRun-a.perRun||wikiRisk(a.floor)-wikiRisk(b.floor)||a.floor.id.localeCompare(b.floor.id));}
function wikiMoney(){
 const list=wikiState.kingdom?wikiMoneyCandidates():[],seen=new Set(),picks=list.filter(x=>{const id=x.floor.dungeons[0];if(seen.has(id))return false;seen.add(id);return true;}).slice(0,5);
 return '<details class="wiki-method supply-help"><summary>골드 수입의 계산 범위와 주의점</summary><p>현재 왕국·지역·도달 층 설정에 맞춰 서로 다른 던전의 가장 좋은 층을 비교합니다. <strong>채집을 하지 않는 조건</strong>에서 반복 상자와 몬스터의 직접 골드만 합산한 비용 차감 전 1회 기대 수입입니다.</p><p class="wiki-note">도달 층 미설정 던전은 전체 층을 후보로 봅니다. 아직 못 가는 깊은 층은 <button data-wiki="progress">지역·도달 층 설정</button>에서 제한하세요. 도적의 숲은 골드 추천에서 제외합니다.</p></details>'+yieldSettingsPanel()+'<h2 id="money-list">현재 왕국 돈 수급 1~5위</h2><p>왕국 '+(wikiState.kingdom||'미설정')+'레벨 · 수입이 있는 후보 '+list.length+'개 층 · '+seen.size+'개 던전</p><div id="wiki-money-list">'+(picks.length?picks.map((x,i)=>'<section class="wiki-money-entry"><h3><span class="wiki-rank">'+(i+1)+'</span>'+materialFloorLink(x.floor)+'</h3><div class="yield-numbers wiki-gold">'+yieldSummary(x,'골드')+'</div><p>1회 몬스터 골드 <strong>'+yieldNumber(x.goldMonster*x.visits)+'</strong> + 반복 상자 골드 <strong>'+yieldNumber(x.goldChest*x.visits)+'</strong></p>'+yieldModelEvidence(x)+'<p>기본 층 레벨 '+x.floor.level+' · '+(x.floor.fields.isDark?'어둠 있음':'어둠 없음')+'</p><p><button data-guide-plan="'+esc(x.floor.dungeons[0])+'">출발 준비 →</button> <button data-wiki-exclude="'+esc(x.floor.dungeons[0])+'">아직 미개방 · 제외</button></p></section>').join(''):!wikiState.kingdom?'<p>위에서 현재 왕국 레벨을 선택하면 해당 범위의 순위를 표시합니다.</p>':'<p>현재 조건에서 기대 수입이 있는 반복 수급 후보가 없습니다. 개방 범위·성공률·목표 층 밖 소요 시간을 확인하세요.</p>')+'</div>'+yieldPolicy();
}
// Ordinary target-floor renewal approximation, not a full adventure replay.
// Native ReturnCastle truncates the combat pool and the time component separately.
function experienceFactors(delta){return delta>=2?[2,2]:delta===1?[1,4]:delta===0?[0.5,8]:delta===-1?[0.25,16]:delta===-2?[1/6,32]:delta===-3?[0.125,64]:[0,Infinity];}
function experienceAverageLevel(floor,start=yieldSettings.experienceStartFloor){
 const dungeon=records[floor.dungeons[0]];
 if(!Number.isInteger(start)||start<1||start>floor.floor)return null;
 const span=dungeon.fields.caveLevelMasters.slice(start-1,floor.floor).map(x=>records[x.ref]?.level);
 if(span.length!==floor.floor-start+1||span.some(x=>!Number.isFinite(x)))return null;
 return Math.trunc(span.reduce((n,x)=>n+x,0)/span.length);
}
function experienceReturnParts(combatPool,ticks,delta){
 const [multiplier,divisor]=experienceFactors(delta);
 // Explicit division avoids floating reciprocal rounding at integer boundaries.
 const combat=delta>=2?Math.trunc(combatPool*2):delta===1?Math.trunc(combatPool):delta===0?Math.trunc(combatPool/2):delta===-1?Math.trunc(combatPool/4):delta===-2?Math.trunc(combatPool/6):delta===-3?Math.trunc(combatPool/8):0;
 return {combatExperience:combat,timeExperience:multiplier?Math.trunc(Math.floor(ticks)/divisor):0};
}
function experienceFloorModel(floor){
 const averageLevel=experienceAverageLevel(floor);
 if(!yieldSettings.adventureLevel||averageLevel===null)return null;
 const base=yieldFloorModel(floor,'money');if(!base)return null;
 const delta=averageLevel-yieldSettings.adventureLevel,combatPool=base.combatExp*base.visits;
 const parts=experienceReturnParts(combatPool,base.activeSeconds/ADVENTURE_TICK_SECONDS,delta);
 return {...base,averageLevel,delta,combatPool,...parts,...yieldTotals(parts.combatExperience+parts.timeExperience)};
}
function wikiExperienceCandidates(){return rows.filter(r=>r.type==='floor'&&wikiFloorAllowed(r)).map(experienceFloorModel).filter(x=>x&&x.perRun>0).sort((a,b)=>b.perRun-a.perRun||wikiRisk(a.floor)-wikiRisk(b.floor)||a.floor.id.localeCompare(b.floor.id));}
function wikiExperience(){
 const list=wikiState.kingdom&&yieldSettings.adventureLevel?wikiExperienceCandidates():[],seen=new Set(),picks=list.filter(x=>{const id=x.floor.dungeons[0];if(seen.has(id))return false;seen.add(id);return true;}).slice(0,5);
 return `<p class="wiki-lead">모험가 1명당 <strong>귀환 기본 경험치</strong>가 높은 던전과 추천 층입니다.</p>
 <p class="wiki-note">총 획득 경험치가 아닙니다. 직업 행동·상자 발견·함정·클리어 보너스, 게임 배율·경험치 상한·생존 상태는 합산하지 않습니다. 따라서 실제 총 경험치의 순위와 다를 수 있습니다.</p>
 <div class="wiki-inline-controls experience-controls"><label>육성할 캐릭터의 모험가 레벨<input type="number" data-yield-setting="adventureLevel" min="0" max="100" step="1" value="${yieldSettings.adventureLevel}"><small>0은 미설정 · 왕국 레벨과 다릅니다.</small></label><label>던전 출발 층<input type="number" data-yield-setting="experienceStartFloor" min="1" max="1000" step="1" value="${yieldSettings.experienceStartFloor}"><small>모든 후보에 같은 출발 층을 적용합니다.</small></label></div>
 <details class="wiki-method supply-help"><summary>귀환 기본분 · 평균 레벨 · 비교 범위</summary><p>채집 없이 추천 층에 머무는 일반 반복 탐험입니다. 던전의 <strong>출발 층부터 추천 층까지 층 레벨을 정수 평균</strong>한 값과 모험가 레벨의 차이로 귀환 보정을 계산합니다. 목표 층 레벨 하나나 층별 체류 시간의 가중평균을 쓰지 않습니다.</p>
 <div class="wiki-table-wrap"><table class="wiki-table"><thead><tr><th>평균 층 레벨 − 모험가</th><th>전투 누적 보상</th><th>탐험 시간 틱</th></tr></thead><tbody><tr><td>+2 이상</td><td>× 2</td><td>÷ 2</td></tr><tr><td>+1</td><td>그대로</td><td>÷ 4</td></tr><tr><td>0</td><td>÷ 2</td><td>÷ 8</td></tr><tr><td>−1</td><td>÷ 4</td><td>÷ 16</td></tr><tr><td>−2</td><td>÷ 6</td><td>÷ 32</td></tr><tr><td>−3</td><td>÷ 8</td><td>÷ 64</td></tr><tr><td>−4 이하</td><td>0</td><td>0</td></tr></tbody></table></div>
 <p>일반 반복 전투 보상은 (몬스터 기본 레벨 + 편성 추가 레벨) × 10을 처치 대상별로 누적합니다. 전투 누적 보상과 시간 틱은 각각 정수 나눗셈 후 합산합니다. 1틱은 실제 기본 10초입니다. 보상의 기대값에 절삭을 적용한 근사로, 개별 시행을 절삭한 뒤 평균한 값과 차이가 날 수 있습니다.</p>
 <p>이동 경로·전체 전투를 재생하는 모형은 아닙니다. 중간 층 체류·귀환 중 얻는 경험치는 더하지 않습니다. 목표 층 밖 소요 시간은 계산 조건에서 직접 차감하세요. 반복형 클리어 전투는 시간에 포함하지만 관련 경험치는 이 순위에 넣지 않습니다. 도적의 숲은 경험치 후보에 포함합니다.</p><p><button data-wiki="progress">지역·도달 층 설정 →</button></p></details>
 ${yieldSettingsPanel()}<h2>현재 왕국 귀환 기본 경험치 1~5위</h2><p>왕국 ${wikiState.kingdom||'미설정'} · 모험가 ${yieldSettings.adventureLevel||'미설정'}레벨 · 출발 ${yieldSettings.experienceStartFloor}층 · 후보 ${list.length}개 층 · ${seen.size}개 던전</p>
 <div id="wiki-experience-list">${picks.length?picks.map((x,i)=>`<section class="wiki-money-entry"><h3><span class="wiki-rank">${i+1}</span>${materialFloorLink(x.floor)}</h3><div class="yield-numbers"><strong>${yieldNumber(x.perRun)} 경험치 / 1명</strong><small>1회 귀환 기본분 추정</small><small>시간당 ${yieldNumber(x.perHour)} 경험치 / 1명</small></div><p>전투 기본분 <strong>${yieldNumber(x.combatExperience)}</strong> + 시간 기본분 <strong>${yieldNumber(x.timeExperience)}</strong></p><p>출발 ${yieldSettings.experienceStartFloor}층 → 추천 ${x.floor.floor}층 · 평균 층 레벨 <strong>${x.averageLevel}</strong> · 모험가와 차이 ${x.delta}</p>${yieldModelEvidence(x)}<p><button data-guide-plan="${esc(x.floor.dungeons[0])}">출발 준비 →</button> <button data-wiki-exclude="${esc(x.floor.dungeons[0])}">아직 미개방 · 제외</button></p></section>`).join(''):!wikiState.kingdom||!yieldSettings.adventureLevel?'<p>내 왕국 레벨과 육성할 캐릭터의 모험가 레벨을 설정하면 기본분 순위를 표시합니다.</p>':'<p>현재 조건에서 귀환 기본 경험치를 얻는 후보가 없습니다. 출발 층·도달 층·모험가 레벨·개방 범위를 확인하세요.</p>'}</div>${yieldPolicy()}`;
}
function wikiParty(){const roles=[['버티는 전투 역할',['Swordsman','WarBlader','Viking','Lancer','MartialArtist'],'공격·회피가 가능한 직업과 현재 사용할 무기·방어 수단을 함께 확인하세요. 직업 이름만으로 공격을 대신 맞아주는 탱커가 보장되지는 않습니다.'],['회복과 소생',['Priest','Healer'],'프리스트는 치료·보호 마법, 힐러는 기절한 모험가 소생과 약 효과 보조가 설명되어 있습니다. 사용할 수 있는 마법·MP·약도 챙기세요.'],['공격 무효 대응',['Magician','Shaman'],'물리 공격 무효 적이 있으면 마법 공격 수단을 준비하세요. 주술사는 한 손·정령 활동·철 장비 제한을 확인해야 합니다.'],['상자와 함정 탐색',['Thief','Ranger'],'도적은 상자 탐색·자물쇠, 레인저는 자연 속 함정·상자 발견이 직업 설명에 연결됩니다. 목표 상자의 조건에 맞춰 역할을 보완하세요.'],['재료 수급 효율',['TreasureHunter','CraftSage'],'보물 사냥꾼은 직업 레벨 이하 몬스터 드롭 확률 상승, 크래프트 세이지는 도구보다 직업 레벨이 높을 때 재료 획득 시간 단축이 설명되어 있습니다.'],['길 찾기와 리더 보조',['MapCreator','Strategist','Sage'],'지도 제작자는 동굴 레벨 이상의 직업 레벨 조건과 막다른 길 감소가 안내됩니다. 전술가·현자는 각 직업 문서의 리더·이탈 관련 설명을 확인하세요.']];return '<p class="wiki-lead">살아 돌아올 수 있는 전투·회복을 먼저 갖춘 뒤, 목표 재료에 맞는 탐색·수급 역할을 더하세요. 아래는 직업 설명에 근거한 역할 분류이며 고정 인원 편성이나 생존 보장은 아닙니다.</p><div class="wiki-toc"><strong>목차</strong><a href="#wiki/party" data-wiki-anchor="party-roles">파티에 필요한 역할</a><a href="#wiki/party" data-wiki-anchor="party-safety">출발 전 점검</a></div><h2 id="party-roles">파티에 필요한 역할</h2>'+roles.map(([title,names,text])=>'<section class="wiki-role"><h3>'+title+'</h3><p>'+text+'</p><div>'+names.map(name=>rows.find(r=>r.type==='job'&&r.internal===name)).filter(Boolean).map(r=>{const building=rows.find(b=>b.type==='building'&&b.internal===(r.internal==='Ranger'?'JobRenger':'Job'+r.internal));const locked=building&&wikiState.kingdom&&building.fields.needCastleLevel>wikiState.kingdom;return '<span class="wiki-job">'+jump(r.id)+(building?'<small>훈련 시설 건설: 왕국 '+building.fields.needCastleLevel+(locked?' · 현재 왕국 조건 미달':'')+'</small>':'')+'</span>';}).join('')+'</div></section>').join('')+'<h2 id="party-safety">출발 전에 확인할 순서</h2><ol><li>목표 던전의 물리·활 공격 무효와 특수기를 확인합니다.</li><li>회복 마법·MP·약과 기절 시 회복 수단을 점검합니다.</li><li>어둠·함정과 상자 필요 아이템을 점검합니다.</li><li>재료 드롭이 목표라면 보물 사냥꾼의 적용 레벨 조건, 도구라면 크래프트 세이지 조건을 확인합니다.</li><li>길드 이벤트는 지역 고유 보정을 더한 추가 난도를 확인합니다.</li></ol><button data-guide-tab="prepare">목표 던전을 골라 구체적인 준비 확인 →</button>';}
 const dungeons=rows.filter(r=>r.type==='dungeon'&&(!guideState.map||r.maps.includes(guideState.map))).sort((a,b)=>(a.level??Infinity)-(b.level??Infinity)||a.name.localeCompare(b.name,'ko'));
function wikiFloorProgress(){
 const dungeons=rows.filter(r=>r.type==='dungeon'&&r.maps.some(wikiMapAllowed)&&!wikiState.excluded.includes(r.id)).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
 return '<h2>던전별 최대 도달 층</h2><p>미설정은 전체 층을 후보로 사용합니다. 실제 도달한 층을 선택하면 그 이후 층은 추천에서 제외됩니다.</p><div class="wiki-table-wrap"><table class="wiki-table"><thead><tr><th>던전</th><th>최대 도달 층</th></tr></thead><tbody>'+dungeons.map(d=>'<tr><th>'+jump(d.id)+'</th><td><select data-wiki-max-floor="'+esc(d.id)+'" aria-label="'+esc(d.name)+' 최대 도달 층"><option value="'+d.fields.caveLevelMasters.length+'">미설정 · 전체 층</option>'+Array.from({length:d.fields.caveLevelMasters.length+1},(_,n)=>'<option value="'+n+'"'+(Object.hasOwn(wikiState.maxFloors,d.id)&&wikiState.maxFloors[d.id]===n?' selected':'')+'>'+(n?n+'층':'미도달')+'</option>').join('')+'</select></td></tr>').join('')+'</tbody></table></div>';
}
function wikiProgress(){const maps=rows.filter(r=>r.type==='map').sort((a,b)=>a.fields.searchlevel-b.fields.searchlevel);return '<p>왕국 레벨만 올려도 모든 던전이 바로 발견되는 것은 아닙니다. 탐색 스토어 확장과 탐색·발견 상태를 함께 반영하세요. 체크한 지도 안에서도 아직 발견하지 않은 던전은 추천 목록의 “미개방 · 제외”로 뺄 수 있습니다.</p><div class="wiki-table-wrap"><table class="wiki-table"><thead><tr><th>수급 범위에 포함</th><th>지도</th><th>탐색 스토어</th><th>왕국 조건</th></tr></thead><tbody>'+maps.map(m=>{const gate=wikiMapGate(m);return '<tr><td><input type="checkbox" data-wiki-map="'+esc(m.id)+'" aria-label="'+esc(m.name)+' 포함"'+(wikiMapAllowed(m.id)?' checked':'')+(!wikiPotentialMap(m)?' disabled':'')+'></td><th>'+jump(m.id)+'</th><td>'+gate.stage+'단계</td><td>'+gate.kingdom+' 이상'+(!wikiPotentialMap(m)?' · 현재 조건 미달':' · 탐색 후보')+'</td></tr>';}).join('')+'</tbody></table></div><p class="wiki-note">탐색 스토어 단계에 따라 지도 번호 1부터 해당 단계까지 목록을 생성하는 게임 코드와 시설 확장의 왕국 요구값을 연결했습니다. 왕국 조건은 해당 시설 단계에 필요한 하한이며, 실제 던전 발견을 뜻하지 않습니다.</p><p>추천에서 제외한 던전: '+wikiState.excluded.length+'곳</p>'+(wikiState.excluded.length?'<details><summary>제외한 던전 복원</summary>'+wikiState.excluded.filter(id=>records[id]).map(id=>'<p>'+esc(getName(id))+' <button data-wiki-restore="'+esc(id)+'">다시 포함</button></p>').join('')+'</details>':'')+'<p><button data-wiki-reset>지도·던전·층 설정 초기화</button></p>'+wikiFloorProgress()+'<h2>설정 후 다시 볼 문서</h2>'+wikiLink('materials')+' · '+wikiLink('money')+' · '+wikiLink('experience');}
function renderWiki(){const html=wikiPage==='materials'?wikiMaterials():wikiPage==='money'?wikiMoney():wikiPage==='experience'?wikiExperience():wikiPage==='party'?wikiParty():wikiPage==='progress'?wikiProgress():wikiHome();$('wiki-article').innerHTML=html;if(wikiPage==='materials'){renderMaterialPicks();$('wiki-material-query').oninput=()=>{wikiState.query=$('wiki-material-query').value;renderMaterialPicks();};}}
function wikiClick(event){if(event.target.closest('[data-yield-reset]')){yieldSettings={...YIELD_DEFAULTS};try{localStorage.removeItem('aoa3-yield-model-v1');localStorage.removeItem('aoa3-yield-model-v2');}catch{}renderWiki();return true;}const anchor=event.target.closest('[data-wiki-anchor]');if(anchor){event.preventDefault?.();$(anchor.dataset.wikiAnchor)?.scrollIntoView?.({behavior:'smooth',block:'start'});return true;}const b=event.target.closest('[data-wiki]');if(b){openWiki(b.dataset.wiki);return true;}const excluded=event.target.closest('[data-wiki-exclude]');if(excluded){wikiState.excluded=[...new Set([...wikiState.excluded,excluded.dataset.wikiExclude])];wikiSave();renderWiki();return true;}const restore=event.target.closest('[data-wiki-restore]');if(restore){wikiState.excluded=wikiState.excluded.filter(id=>id!==restore.dataset.wikiRestore);wikiSave();renderWiki();return true;}if(event.target.closest('[data-wiki-reset]')){wikiState.openMaps=null;wikiState.excluded=[];wikiState.maxFloors={};wikiSave();openWiki('progress');return true;}return false;}

const UI_HUBS={
 adventure:{name:'모험과 던전',icon:'◇',desc:'지역과 층별 목표를 확인하고 출발을 준비하세요.',entries:[['type','dungeon','던전','개방 조건과 클리어 보상'],['type','floor','층별 정보','등장 몬스터 · 상자 · 채집'],['type','map','지도와 지역','지역별 던전 모아보기'],['guide','prepare','출발 전 준비','목표 던전과 층별 조건'],['guide','blocked','실패 원인 점검','발견 · 개봉 · 전투 문제 확인']]},
 growth:{name:'왕국과 육성',icon:'♜',desc:'시설의 해금과 성장 조건, 모험가의 역할을 함께 확인하세요.',entries:[['wiki','experience','경험치 던전','귀환 기본분 · 모험가 레벨 · 평균 층 레벨'],['wiki','progress','왕국 성장과 개방','개방 지역 · 도달 층 관리'],['building','base','기본 건물','레벨별 해금 · 골드와 재료'],['building','job','직업 건물','직업 훈련과 시설 확장 조건'],['type','job','직업','역할과 능력 · 훈련 조건'],['type','skill','스킬','직업별 기술과 효과'],['wiki','party','생존과 파티 구성','전투 · 회복 · 탐색 역할']]},
 guild:{name:'길드',icon:'⚑',desc:'가입과 운영부터 상점·공헌도·재료 교환·이벤트 보상까지 확인하세요.',entries:[['view','guild','길드 활용 안내','가입 · 운영 · 상점 · 공헌도 · 재료 교환 · 시설 확장'],['view','guild-dungeons','길드 던전과 보상','추가 몬스터 · 보물 · 함정 · 클리어 보상'],['guide','event','길드 이벤트 준비','참가 조건 · 지역별 난도 · 출발 준비']]},
 equipment:{name:'장비와 아이템',icon:'⚒',desc:'필요한 효과에서 장비와 획득 경로까지 찾아보세요.',entries:[['type','weapon','무기','무기 종류 · 능력 · 획득처'],['type','armor','방어구','방어 능력과 특수 효과'],['type','accessory','장신구','능력 보정과 획득 조건'],['type','item','도구·아이템','채집 도구와 탐험 준비물'],['type','material','재료 도감','재료별 정보와 사용처'],['guide','equipment','효과로 장비 찾기','회피 · 회복 등 원하는 효과 검색']]},
 combat:{name:'전투 도감',icon:'✧',desc:'상대의 특징과 위험 요소를 파악해 탐험을 준비하세요.',entries:[['type','monster','몬스터','능력 · 출현 지역 · 보상'],['type','status','상태 이상','효과와 대응 정보'],['type','trap','몬스터 특수기','전투 중 발생하는 특수 효과']]}
};
let uiReady=false,uiRestoring=false,uiCurrentHash='#wiki/home';
function uiButton(kind,value,title,desc=''){return '<button class="topic-card" data-ui-kind="'+kind+'" data-ui-value="'+value+'"><span><strong>'+esc(title)+'</strong><small>'+esc(desc)+'</small></span><b aria-hidden="true">↗</b></button>';}
function hubCards(){return '<div class="topic-grid">'+Object.entries(UI_HUBS).map(([id,h])=>'<button class="hub-card" data-hub="'+id+'"><span class="hub-icon">'+h.icon+'</span><span><strong>'+h.name+'</strong><small>'+h.desc+'</small></span><b aria-hidden="true">→</b></button>').join('')+'</div>';}
function uiGroup(kind,value){return Object.keys(UI_HUBS).find(key=>UI_HUBS[key].entries.some(e=>e[0]===kind&&e[1]===value));}
function uiFinish(group,title,hash){
 $('current-section').textContent=title;
 $('results-head').hidden=wikiActive||guideActive||hash.startsWith('#hub/');
 $('page-path').innerHTML='<button data-ui-kind="wiki" data-ui-value="home">모험 수첩</button>'+(group?'<span> / </span><button data-hub="'+group+'">'+UI_HUBS[group].name+'</button>':'')+(hash!=='#wiki/home'?'<span> / </span><span aria-current="page">'+esc(title)+'</span>':'');
 document.querySelectorAll('#navigation button, #quick-access button').forEach(b=>{const active=b.dataset.hub?b.dataset.hub===group:b.dataset.wiki&&hash==='#wiki/'+b.dataset.wiki;b.classList.toggle('active',!!active);b.setAttribute('aria-pressed',String(!!active));});
 if(uiReady&&!uiRestoring&&uiCurrentHash!==hash){if(history.pushState)history.pushState(null,'',hash);else history.replaceState(null,'',hash);window.scrollTo?.({top:0,behavior:'instant'});}
 uiCurrentHash=hash;
}
function openHub(id){const h=UI_HUBS[id];if(!h)return openWiki('home');if($('detail').open)$('detail').close();wikiActive=false;guideActive=false;guildDungeonMode=false;$('browser-panel').hidden=true;$('result-actions').hidden=true;$('more').hidden=true;$('current-section').textContent=h.name;$('intro-title').textContent=h.name;$('intro-subtitle').textContent=h.desc;$('result-count').textContent='';$('rows').innerHTML='<section class="hub-page"><div class="hub-page-top"><span class="section-kicker">EXPLORE / '+h.entries.length+' TOPICS</span><span class="hub-page-symbol">'+h.icon+'</span></div><div class="hub-entry-grid">'+h.entries.map(e=>uiButton(...e)).join('')+'</div><div class="hub-crosslink"><span>수급 장소를 찾고 있나요?</span>'+wikiLink('materials','재료 채집 →')+wikiLink('money','돈 수급 던전 →')+'</div></section>';uiFinish(id,'분류', '#hub/'+id);}
function uiClick(e){const hub=e.target.closest('[data-hub]');if(hub){openHub(hub.dataset.hub);return true;}const b=e.target.closest('[data-ui-kind]');if(!b)return false;uiOpen(b.dataset.uiKind,b.dataset.uiValue);return true;}
function uiOpen(kind,value){if(kind==='type')return setType(value);if(kind==='building')return setType('building',value);if(kind==='wiki')return openWiki(value);if(kind==='guide')return openGuide(value);if(value==='guild')return showGuild();if(value==='guild-dungeons')return openGuildDungeons();}
async function uiRoute(hash){
 if(hash.startsWith('#hub/'))return openHub(hash.split('/')[1]);
 if(hash.startsWith('#browse/'))return setType(hash.split('/')[1]);
 if(hash.startsWith('#buildings/'))return setType('building',hash.split('/')[1]);
 if(hash.startsWith('#guide/'))return openGuide(hash.split('/')[1]);
 if(hash==='#guild')return openGuild();if(hash==='#guild-dungeons')return openGuildDungeons();
 const match=hash.match(/^#(guild-record|record)\/(.+)$/);if(match&&records[decodeURIComponent(match[2])]){if(match[1]==='guild-record')openGuildDungeons();return openRecord(decodeURIComponent(match[2]),match[1]==='guild-record'?'guild':'normal');}
 return openWiki(hash.split('/')[1]||'home');
}
const uiSetType=setType;setType=function(type,group){uiSetType(type,group);if(!PLAYER_TYPES.has(type))return;const title=type==='building'?(buildingGroup==='job'?'직업 건물':'기본 건물'):TYPES[type];$('intro-title').textContent=title;$('intro-subtitle').textContent=type==='building'?'레벨별 해금과 확장에 필요한 조건을 확인하세요.':'이름과 효과로 찾고, 항목을 눌러 자세한 정보를 확인하세요.';$('query').placeholder=title+' 이름 · 효과 검색';uiFinish(uiGroup(type==='building'?'building':'type',type==='building'?buildingGroup:type),title,type==='building'?'#buildings/'+buildingGroup:'#browse/'+type);};
const uiOpenWiki=openWiki;openWiki=function(page='home'){uiOpenWiki(page);const titles={home:'모험 수첩',materials:'재료 채집',money:'돈 수급 던전',experience:'경험치 던전',party:'생존과 파티 구성',progress:'왕국 성장과 지역 개방'};const subs={home:'당신의 다음 모험을 위한 작은 길잡이.',materials:'필요한 재료부터 찾고, 추천 던전과 채집 도구를 확인하세요.',money:'현재 진행 조건에서 갈 수 있는 돈 수급 던전을 비교하세요.',experience:'모험가 레벨과 출발 층을 설정해 귀환 기본 경험치를 비교하세요.'};$('intro-title').textContent=titles[wikiPage];$('intro-subtitle').textContent=subs[wikiPage]||'성장과 탐험에 필요한 조건을 차근차근 확인하세요.';uiFinish(uiGroup('wiki',wikiPage),titles[wikiPage],'#wiki/'+wikiPage);};
const uiOpenGuide=openGuide;openGuide=function(tab){uiOpenGuide(tab);uiFinish(uiGroup('guide',guideTab),GUIDE_TABS.find(t=>t[0]===guideTab)[1],'#guide/'+guideTab);};
const uiGuildDungeons=openGuildDungeons;openGuildDungeons=function(){uiGuildDungeons();uiFinish('guild','길드 던전','#guild-dungeons');};
const uiGuild=openGuild;openGuild=async function(){await uiGuild();uiFinish('guild','길드 안내','#guild');};

async function init(){
 const terminology=await fetch('data/terms.json');if(!terminology.ok)throw new Error('한국어 용어 사전을 읽지 못했습니다.');terms=await terminology.json();label=terms.fieldLabels;
 const buildingsResponse=await fetch('data/buildings.json');if(!buildingsResponse.ok)throw new Error('건물 성장 정보를 읽지 못했습니다.');buildingData=await buildingsResponse.json();
 const guildDungeonsResponse=await fetch('data/guild-dungeons.json');if(!guildDungeonsResponse.ok)throw new Error('길드 던전 정보를 읽지 못했습니다.');guildDungeonData=await guildDungeonsResponse.json();
 archive=await readArchive();const conditions=await fetch('data/conditions.json');if(!conditions.ok)throw new Error('조건 정의를 읽지 못했습니다.');conditionData=await conditions.json();records=archive.records;rows=Object.values(records);rows.forEach(r=>{r.tags=itemTags(r);});
 archive.loot.forEach(e=>{if(e.target)add(lootTo,e.target,e);add(lootFrom,e.source,e);});
 archive.encounters.forEach(e=>{add(spawnTo,e.monster,e);add(spawnFrom,e.source,e);});
 indexShops();
 $('navigation').innerHTML='<button data-wiki="home" class="nav-home">⌂ <span>모험 수첩</span></button><div class="nav-priority"><span class="nav-group-name">자주 찾는 수급 정보</span><button data-wiki="materials">♧ <span>재료 채집</span><span class="nav-arrow">↗</span></button><button data-wiki="money">◈ <span>돈 수급 던전</span><span class="nav-arrow">↗</span></button><button data-wiki="experience">✦ <span>경험치 던전</span><span class="nav-arrow">↗</span></button></div><div class="nav-topics"><span class="nav-group-name">주제별 자료</span>'+Object.entries(UI_HUBS).map(([id,h])=>'<button data-hub="'+id+'"><span class="nav-symbol">'+h.icon+'</span><span>'+h.name+'</span><span class="nav-arrow">›</span></button>').join('')+'</div>';
 $('version').textContent='v'+archive.report.version;
 fillSelect('map','map');fillSelect('dungeon','dungeon');
 $('workspace-switch').onclick=e=>{const b=e.target.closest('[data-workspace]');if(b){if(b.dataset.workspace==='guide')openWiki();else{if($('detail').open)$('detail').close();setType(selected);history.replaceState(null,'',location.pathname+location.search);}}};
 $('navigation').onclick=e=>{if(uiClick(e))return;if(wikiClick(e))return;if(e.target.closest('[data-view="guide"]'))return openGuide();if(e.target.closest('[data-view="guild-dungeons"]'))return openGuildDungeons();if(e.target.closest('[data-view="guild"]'))return showGuild();const b=e.target.closest('[data-type]');if(b){setType(b.dataset.type,b.dataset.buildingGroup);}};
 ['query','map','dungeon','min-level','max-level','floor','kind','tag','sort'].forEach(id=>$(id).addEventListener('input',()=>{limit=60;render();}));
 $('rows').onchange=e=>{const reached=e.target.closest('[data-wiki-max-floor]');if(reached){const id=reached.dataset.wikiMaxFloor,d=records[id],n=Number(reached.value);if(d?.type==='dungeon'&&Number.isFinite(n)){wikiState.maxFloors[id]=Math.max(0,Math.min(d.fields.caveLevelMasters.length,Math.floor(n)));wikiSave();}return;}const setting=e.target.closest('[data-yield-setting]');if(setting){const key=setting.dataset.yieldSetting;yieldSettings=cleanYieldSettings({...yieldSettings,[key]:Number(setting.value)});try{localStorage.setItem('aoa3-yield-model-v2',JSON.stringify(yieldSettings));}catch{}renderWiki();document.querySelectorAll('.yield-settings').forEach(e=>e.open=true);return;}const box=e.target.closest('[data-wiki-map]');if(box){if(!Array.isArray(wikiState.openMaps))wikiState.openMaps=rows.filter(r=>r.type==='map'&&wikiMapAllowed(r.id)).map(r=>r.id);wikiState.openMaps=wikiState.openMaps.filter(id=>id!==box.dataset.wikiMap);if(box.checked)wikiState.openMaps.push(box.dataset.wikiMap);wikiSave();}};
 $('reset').onclick=reset;$('csv').onclick=exportCSV;$('more').onclick=()=>{limit+=60;render();};
 $('rows').onclick=e=>{if(uiClick(e))return;const group=e.target.closest('[data-building-group]');if(group){setType('building',group.dataset.buildingGroup);return;}if(wikiClick(e))return;if(guideClick(e))return;if(e.target.closest('[data-view="guild-dungeons"]'))return openGuildDungeons();const guild=e.target.closest('[data-guild-record]');if(guild)return openRecord(guild.dataset.guildRecord,'guild');const b=e.target.closest('[data-id]');if(b)openRecord(b.dataset.id);};
 $('detail-body').onclick=e=>{if(wikiClick(e))return;if(guideClick(e))return;if(e.target.closest('[data-view="guild-dungeons"]'))return openGuildDungeons();if(e.target.closest('[data-view="guild"]'))return showGuild();const trap=e.target.closest('[data-guild-trap]');if(trap)return openGuildTrap(trap.dataset.guildTrap);const guild=e.target.closest('[data-guild-record]');if(guild)return openRecord(guild.dataset.guildRecord,'guild');const b=e.target.closest('[data-id]');if(b)openRecord(b.dataset.id);};
 $('close-detail').onclick=()=>$('detail').close();$('detail').addEventListener('close',()=>history.replaceState(null,'',uiCurrentHash));
 const initialHash=location.hash;setType('dungeon');await uiRoute(initialHash);uiReady=true;
 $('brand-home').onclick=e=>{e.preventDefault?.();openWiki('home');};
 $('quick-access').onclick=e=>{if(wikiClick(e))return;};$('page-path').onclick=uiClick;
 window.addEventListener?.('popstate',async()=>{uiRestoring=true;try{await uiRoute(location.hash);}finally{uiRestoring=false;}});

}
init().catch(error=>{$('error').hidden=false;$('error').textContent=error.message+' 새로고침해 다시 시도하세요.';$('rows').innerHTML='<p class="empty">데이터를 읽지 못했습니다.</p>';});
