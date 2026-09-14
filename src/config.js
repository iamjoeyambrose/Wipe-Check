/**
 * Tunables and lookup tables: arena size, palettes, roles, stage art.
 */

var W=960, H=540, TAU=Math.PI*2;
var rnd=Math.random, PI=Math.PI;

var COL={tank:'#C79C6E',dps:'#9FD46A',heal:'#F58CBA',rogue:'#B48CFF',gold:'#E8C46A',hostile:'#D9463E',elite:'#A335EE',
         hp:'#3FBF6A',mana:'#3E82E8',ink:'#E7EAF2',ink2:'#98A0B5'};
var QCOL=['#9D9D9D','#4ADE55','#3B8FE0','#A335EE'], QNAME=['Common','Uncommon','Rare','Epic'];

var ROLES={
  tank:{key:'tank',name:'Bulwark',label:'Tank',col:COL.tank,
    hp:360,speed:112,r:15,atkCd:.60,dmg:19,reach:78,
    abil:'Shockwave',abilCd:9,
    blurb:['Soaks the room and holds threat','Cleaves everything in front','Shockwave knocks back and taunts']},
  dps:{key:'dps',cls:'ranger',name:'Ranger',label:'DPS',col:COL.dps,
    hp:185,speed:150,r:12,atkCd:.34,dmg:21,reach:400,
    abil:'Volley',abilCd:10,
    blurb:['Kills things, fast','Auto-fires at the nearest target','Volley carpets an area in arrows']},
  heal:{key:'heal',name:'Mender',label:'Healer',col:COL.heal,
    hp:155,speed:142,r:12,atkCd:.55,dmg:9,reach:300,
    abil:'Benediction',abilCd:12,
    blurb:['Keeps the party upright','Chain-heals the lowest ally','Rez a downed ally by standing on them']}
};
var ORDER=['tank','dps','heal'];
/* The DPS seat has two classes. The Ranger is the default; the Shade is the
   secret one, found behind a wall on stage 3. */
var CLASSES={
  ranger:ROLES.dps,
  rogue:{key:'dps',cls:'rogue',name:'Shade',label:'DPS',col:COL.rogue,
    hp:150,speed:168,r:12,atkCd:.26,dmg:14,reach:62,crit:.22,threatMul:.6,
    abil:'Shadowstep',abilCd:8,
    blurb:['Up close, and gone again','Backstabs always crit','Shadowstep cuts through the line']}
};

/* The dungeon is one hand-laid room three screens wide and three tall; the
   camera follows whoever you're driving. */
var WORLD_W=W*3, WORLD_H=H*3;
var WALLY=104, GATE={x:WORLD_W/2,y:86};
var PLAY={top:WALLY,bot:WORLD_H-14,left:14,right:WORLD_W-14};

var STAGEART=[
 {fB:'#3B372F',fL:'#575245',fD:'#211F1A',gr:'#131109',
  wB:'#332F28',wL:'#4C463C',wD:'#171512',
  light:'#FFB25E',accent:'#8A6A3A',mote:'#C9A87A',moss:'#3B4426',banner:'#8A3A2E'},
 {fB:'#343A40',fL:'#4F5762',fD:'#1D2126',gr:'#0F1216',
  wB:'#2C3238',wL:'#454E58',wD:'#14171B',
  light:'#9FD4FF',accent:'#4A6076',mote:'#9FC6E8',moss:'#2E4444',banner:'#37536E'},
 {fB:'#3A2E25',fL:'#5A4634',fD:'#201811',gr:'#0F0A06',
  wB:'#302620',wL:'#4A3A2C',wD:'#160F0A',
  light:'#FF8A3C',accent:'#8A4A1E',mote:'#FF9A55',moss:'#4A3418',banner:'#A64A1C'},
 {fB:'#332C40',fL:'#4C4260',fD:'#1B1724',gr:'#0D0A12',
  wB:'#2B2436',wL:'#453A56',wD:'#140F1B',
  light:'#C08CFF',accent:'#6A4A96',mote:'#B79AF0',moss:'#3A2E52',banner:'#6A3A9E'},
 {fB:'#3A2A2C',fL:'#57403F',fD:'#1F1517',gr:'#0F0709',
  wB:'#2F2224',wL:'#483436',wD:'#160E10',
  light:'#FF6A56',accent:'#8A2E2A',mote:'#FF8A80',moss:'#4A2222',banner:'#A02A26'}
];

export { W, H, WORLD_W, WORLD_H, TAU, rnd, PI, COL, QCOL, QNAME, ROLES, CLASSES, ORDER, PLAY, WALLY, GATE, STAGEART };
