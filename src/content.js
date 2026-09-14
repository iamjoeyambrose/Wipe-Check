/**
 * The level-up draft and the stage list.
 *
 * Draft picks write into a hero's `perk` layer rather than onto the hero
 * directly, so equipping or swapping gear can recompute everything from
 * base -> perks -> gear without losing what the draft gave you.
 */

import { ORDER } from './config.js';
import { perkMul, perkAdd, perkFlag } from './items.js';

function each(S, fn) { ORDER.forEach((k) => fn(S.h[k])); }

var UPGRADES=[
 {r:'tank',n:'Iron Plating',t:'Bulwark takes 12% less damage.',f:function(S){perkMul(S.h.tank,'dr',0.88)}},
 {r:'tank',n:'Wider Aura',t:'Taunt radius +35%. More of the room sticks to you.',f:function(S){perkMul(S.h.tank,'taunt',1.35)}},
 {r:'tank',n:'Thorns',t:'Reflect 30% of melee damage back at the attacker.',f:function(S){perkAdd(S.h.tank,'thorns',0.30)}},
 {r:'tank',n:'Vanguard',t:'Bulwark max health +22%, healed for the difference.',f:function(S){perkMul(S.h.tank,'hpMax',1.22)}},
 {r:'tank',n:'Sweeping Slam',t:'Cleave arc +40% and damage +25%.',f:function(S){perkMul(S.h.tank,'arc',1.4);perkMul(S.h.tank,'dmg',1.25)}},
 {r:'tank',n:'Rallying Cry',t:'Shockwave also heals the party for 12% of max health.',tal:1,f:function(S){perkFlag(S.h.tank,'rally')}},
 {r:'dps',cls:'ranger',n:'Rapid Fire',t:'Attack speed +22%.',f:function(S){perkMul(S.h.dps,'atkCd',0.78)}},
 {r:'dps',cls:'ranger',n:'Split Shot',t:'Fire one additional arrow in a spread.',f:function(S){perkAdd(S.h.dps,'shots',1)}},
 {r:'dps',cls:'ranger',n:'Broadheads',t:'Arrows pierce one extra enemy.',f:function(S){perkAdd(S.h.dps,'pierce',1)}},
 {r:'dps',n:'Lethality',t:'Crit chance +14%.',f:function(S){perkAdd(S.h.dps,'crit',0.14)}},
 {r:'dps',cls:'ranger',n:'Heavy Draw',t:'Arrow damage +28%.',f:function(S){perkMul(S.h.dps,'dmg',1.28)}},
 {r:'dps',cls:'ranger',n:'Rain of Arrows',t:'Volley radius +45% and it fires twice.',tal:1,f:function(S){perkMul(S.h.dps,'volleyR',1.45);perkFlag(S.h.dps,'volleyTwice')}},
 /* the Shade's draft: only offered while a Shade holds the DPS seat */
 {r:'dps',cls:'rogue',n:'Quickblades',t:'Attack speed +22%.',f:function(S){perkMul(S.h.dps,'atkCd',0.78)}},
 {r:'dps',cls:'rogue',n:'Twin Fangs',t:'Every third strike hits twice.',f:function(S){perkFlag(S.h.dps,'twinfangs')}},
 {r:'dps',cls:'rogue',n:'Hemorrhage',t:'Crits bleed for 40% more over three seconds.',f:function(S){perkFlag(S.h.dps,'hemorrhage')}},
 {r:'dps',cls:'rogue',n:'Deep Cuts',t:'Dagger damage +28%.',f:function(S){perkMul(S.h.dps,'dmg',1.28)}},
 {r:'dps',cls:'rogue',n:'Smoke Trail',t:'Shadowstep leaves smoke that stuns whatever it passes.',tal:1,f:function(S){perkFlag(S.h.dps,'smoketrail')}},
 {r:'heal',n:'Greater Mending',t:'Healing done +35%.',f:function(S){perkMul(S.h.heal,'healPow',1.35)}},
 {r:'heal',n:'Efficiency',t:'Heals cost 30% less mana.',f:function(S){perkMul(S.h.heal,'cost',0.70)}},
 {r:'heal',n:'Chain Mending',t:'Heals bounce to one more ally.',f:function(S){perkAdd(S.h.heal,'bounce',1)}},
 {r:'heal',n:'Renewal',t:'Mana regeneration +7 per second.',f:function(S){perkAdd(S.h.heal,'mpRegen',7)}},
 {r:'heal',n:'Holy Wrath',t:'Smite damage +80%. The healer stops being harmless.',f:function(S){perkMul(S.h.heal,'dmg',1.8)}},
 {r:'heal',n:'Guardian Spirit',t:'Once per stage, a fatal hit leaves that ally at 1 health.',tal:1,f:function(S){perkFlag(S.h.heal,'guardian')}},
 {r:'party',n:'Fleet of Foot',t:'Party movement speed +11%.',f:function(S){each(S,function(h){perkMul(h,'speed',1.11)})}},
 {r:'party',n:'Loot Radar',t:'Experience pickup radius +60%.',f:function(S){S.vac*=1.6}},
 {r:'party',n:'Battle Shout',t:'All party damage +12%.',f:function(S){each(S,function(h){perkMul(h,'dmg',1.12)})}},
 {r:'party',n:'Fortitude',t:'Party max health +14%, healed for the difference.',f:function(S){each(S,function(h){perkMul(h,'hpMax',1.14)})}},
 {r:'party',n:'Readiness',t:'All ability cooldowns -18%.',f:function(S){each(S,function(h){perkMul(h,'abilCd',0.82)})}},
 {r:'party',n:'Second Wind',t:'Party regenerates 1.2% max health per second.',f:function(S){S.regen+=0.012}}
];

var STAGES=[
 {n:'The Muster Yard', boss:'Drillmaster Kolt',  dur:42},
 {n:'Ossuary Steps',   boss:'Rattlejaw',         dur:48},
 {n:'The Slag Foundry',boss:'Foreman Ghest',     dur:52},
 {n:'Whisper Spire',   boss:'The Choirmaster',   dur:56},
 {n:'Vault of Wipes',  boss:'Enrage Incarnate',  dur:60}
];

export { UPGRADES, STAGES, each };
