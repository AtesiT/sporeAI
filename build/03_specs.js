
/* ============================================================================
   2. EDIBLE / CREATURE SPECS  (data-driven bestiary)
   ----------------------------------------------------------------------------
   Every living thing in the ocean is described by one of these specs; the
   engine contains zero per-species code. Fields:
     n     display name          r     [min,max] radius in world units
     dna   DNA yield scale       spd   cruise speed (world units / s)
     hp    vitality              beh   'drift' | 'prey' | 'predator' | 'cruise'
     aggr  0-100 how committed a hunter it is
     sense detection radius      vis   procedural render spec
   ========================================================================== */

/* --- compact visual spec builders ---------------------------------------- */
const cellV = (h, s, l, extra) => Object.assign({ arch:'bact', col:[h,s,l], col2:[(h+20)%360,s+6,l-14],
  organelles:['nucleoid'] }, extra || {});
const softV = (h, s, l, extra) => Object.assign({ arch:'blob', col:[h,s,l], col2:[(h+16)%360,s+8,l-16],
  organelles:['nucleus'] }, extra || {});
const shellV = (h, s, l, extra) => Object.assign({ arch:'diatom', col:[h,s,l], col2:[(h+30)%360,s+4,l-12] }, extra || {});
const fishV = (h, s, l, extra) => Object.assign({ arch:'fish', col:[h,s,l], col2:[(h+180)%360,s-10,l-6],
  fins:'full', mouth:'simple', eyes:1, tail:'fork' }, extra || {});
const wormV = (h, s, l, extra) => Object.assign({ arch:'worm', col:[h,s,l], col2:[(h+24)%360,s+8,l-14],
  segs:8, eyes:1 }, extra || {});

const EDIBLES = {
  /* ============================ FOOD (drift) ============================= */
  f_snow:      { n:'Marine snow',      r:[1.2,3.2], dna:0.10, spd:5,  hp:1, beh:'drift',
                 vis:softV(190,20,86,{organelles:[],fleck:1}) },
  f_detritus:  { n:'Organic detritus', r:[1.8,4.4], dna:0.16, spd:7,  hp:1, beh:'drift',
                 vis:softV(38,34,62,{fleck:1}) },
  f_bacterium: { n:'Bacterium',        r:[2.0,4.0], dna:0.20, spd:20, hp:1, beh:'drift',
                 vis:cellV(150,50,64,{flag:1}) },
  f_archaea:   { n:'Archaeon',         r:[2.4,5.0], dna:0.24, spd:16, hp:1, beh:'drift',
                 vis:cellV(46,52,60,{flag:2}) },
  f_coccus:    { n:'Coccus cluster',   r:[3.0,6.5], dna:0.30, spd:9,  hp:2, beh:'drift',
                 vis:{arch:'colony',col:[158,54,58],col2:[176,60,46],cells:5} },
  f_diatom:    { n:'Diatom',           r:[3.5,8.0], dna:0.42, spd:8,  hp:2, beh:'drift',
                 vis:shellV(48,58,64,{frustule:1}) },
  f_dino:      { n:'Dinoflagellate',   r:[3.0,6.5], dna:0.36, spd:26, hp:2, beh:'drift',
                 vis:cellV(28,60,60,{flag:2,organelles:['chloroplast']}) },
  f_algae:     { n:'Green alga',       r:[4.0,9.0], dna:0.48, spd:10, hp:3, beh:'drift',
                 vis:cellV(104,56,54,{organelles:['chloroplast','nucleus']}) },
  f_coccolith: { n:'Coccolithophore',  r:[3.0,6.0], dna:0.34, spd:7,  hp:2, beh:'drift',
                 vis:shellV(52,26,84,{plates:1}) },
  f_foram:     { n:'Foraminiferan',    r:[5.0,11],  dna:0.60, spd:11, hp:4, beh:'drift',
                 vis:{arch:'colony',col:[36,40,70],col2:[24,46,58],cells:7,chambers:1} },
  f_kelp:      { n:'Kelp frond',       r:[6,15],    dna:0.85, spd:0,  hp:6, beh:'drift',
                 vis:{arch:'plant',col:[104,48,44],col2:[88,54,36],fronds:1,anchor:1} },
  f_seagrass:  { n:'Seagrass blade',   r:[4,11],    dna:0.55, spd:0,  hp:4, beh:'drift',
                 vis:{arch:'plant',col:[120,44,48],col2:[100,50,40],fronds:2,anchor:1} },
  f_coral:     { n:'Coral polyp',      r:[5,13],    dna:0.72, spd:0,  hp:6, beh:'drift',
                 vis:{arch:'plant',col:[348,52,66],col2:[16,58,58],tentacles:8,anchor:1} },
  f_ventmat:   { n:'Extremophile mat', r:[6,16],    dna:0.90, spd:0,  hp:8, beh:'drift',
                 vis:{arch:'plant',col:[26,44,46],col2:[12,48,38],fronds:3,anchor:1,glow:1} },
  f_ventplume: { n:'Vent plume',       r:[10,22],   dna:1.30, spd:2,  hp:6, beh:'drift',
                 vis:softV(16,50,58,{glow:1,fleck:1}) },
  f_whalefall: { n:'Whale fall',       r:[16,38],   dna:3.20, spd:0,  hp:20,beh:'drift',
                 vis:{arch:'blob',col:[220,14,44],col2:[200,12,34],fleck:1,anchor:1} },

  /* ============================ PREY (autonomous) ======================== */
  p_ciliate:   { n:'Ciliate',          r:[3,7],     dna:0.30, spd:52, hp:3,  beh:'prey', sense:110,
                 vis:{arch:'ciliate',col:[186,46,66],col2:[200,54,52],cilia:1,organelles:['macronuc']} },
  p_rotifer:   { n:'Rotifer',          r:[5,11],    dna:0.55, spd:44, hp:5,  beh:'prey', sense:130,
                 vis:{arch:'worm',col:[40,42,66],col2:[28,48,56],segs:2,cilia:2,fan:1} },
  p_copepod:   { n:'Copepod',          r:[4,10],    dna:0.50, spd:88, hp:4,  beh:'prey', sense:170,
                 vis:{arch:'arthro',col:[16,44,62],col2:[340,40,54],segs:4,legs:5,antenna:1} },
  p_krill:     { n:'Krill',            r:[6,15],    dna:0.90, spd:70, hp:7,  beh:'prey', sense:190,
                 vis:{arch:'arthro',col:[12,52,60],col2:[350,56,52],segs:7,legs:6,translucent:1} },
  p_salp:      { n:'Salp chain',       r:[9,22],    dna:1.30, spd:38, hp:12, beh:'prey', sense:150,
                 vis:{arch:'colony',col:[196,34,74],col2:[210,44,62],cells:8,chain:1,translucent:1} },
  p_combjelly: { n:'Comb jelly',       r:[8,20],    dna:1.10, spd:34, hp:10, beh:'prey', sense:160,
                 vis:{arch:'medusa',col:[190,30,76],col2:[280,50,66],ctene:1,glow:1,translucent:1,tentacles:2} },
  p_nauplius:  { n:'Nauplius larva',   r:[3,8],     dna:0.34, spd:64, hp:3,  beh:'prey', sense:140,
                 vis:{arch:'arthro',col:[30,50,64],col2:[16,54,54],segs:1,legs:3,antenna:1} },
  p_larvacean: { n:'Larvacean',        r:[6,14],    dna:0.80, spd:30, hp:6,  beh:'prey', sense:120,
                 vis:{arch:'blob',col:[52,40,72],col2:[40,46,60],translucent:1,tail:1,house:1} },
  p_hatchet:   { n:'Hatchetfish',      r:[10,22],   dna:1.40, spd:78, hp:12, beh:'prey', sense:230,
                 vis:fishV(210,24,58,{counter:1,photophores:1,girth:1}) },
  p_lantern:   { n:'Lanternfish',      r:[12,28],   dna:1.80, spd:82, hp:16, beh:'prey', sense:260,
                 vis:fishV(206,34,52,{photophores:2,glow:1}) },
  p_bristle:   { n:'Bristlemouth',     r:[10,24],   dna:1.50, spd:74, hp:14, beh:'prey', sense:240,
                 vis:fishV(220,18,44,{teeth:1,photophores:1}) },
  p_squid:     { n:'Small squid',      r:[16,38],   dna:2.60, spd:110,hp:26, beh:'prey', sense:320,
                 vis:{arch:'arthro',col:[348,44,60],col2:[12,50,52],tentacles:8,jet:1,eyes:2,mantle:1} },
  p_amphipod:  { n:'Amphipod',         r:[4,10],    dna:0.55, spd:56, hp:5,  beh:'prey', sense:150,
                 vis:{arch:'arthro',col:[16,40,66],col2:[0,44,56],segs:6,legs:6,translucent:1} },
  p_seapig:    { n:'Sea pig',          r:[10,20],   dna:1.20, spd:16, hp:14, beh:'prey', sense:120,
                 vis:{arch:'blob',col:[340,26,64],col2:[330,30,54],legs:8,translucent:1} },
  p_fangtooth: { n:'Fangtooth',        r:[18,40],   dna:2.80, spd:80, hp:34, beh:'prey', sense:280,
                 vis:fishV(214,14,32,{teeth:3,girth:1}) },
  p_dumbo:     { n:'Dumbo octopus',    r:[26,55],   dna:3.60, spd:44, hp:44, beh:'prey', sense:260,
                 vis:{arch:'medusa',col:[330,30,66],col2:[320,36,56],tentacles:8,earfin:1,translucent:1} },
  p_jellysm:   { n:'Small jelly',      r:[14,34],   dna:1.90, spd:26, hp:20, beh:'prey', sense:200,
                 vis:{arch:'medusa',col:[270,40,74],col2:[292,50,62],tentacles:7,bell:1,translucent:1} },
  p_herring:   { n:'Herring',          r:[12,26],   dna:1.60, spd:96, hp:14, beh:'prey', sense:280,
                 vis:fishV(200,30,70,{counter:1,stripes:1}) },

  /* ============================ PREDATORS ================================ */
  r_jellyswarm:{ n:'Stinging jelly',   r:[22,52],   dna:2.60, spd:44, hp:40,  beh:'predator', aggr:22, sense:260,
                 vis:{arch:'medusa',col:[286,48,66],col2:[306,58,56],tentacles:12,bell:1,translucent:1,glow:1} },
  r_shrimp:    { n:'Mantis shrimp',    r:[16,36],   dna:2.20, spd:120,hp:30,  beh:'predator', aggr:40, sense:300,
                 vis:{arch:'arthro',col:[12,66,58],col2:[40,72,52],segs:6,legs:4,club:1,eyes:2} },
  r_chaetognath:{n:'Chaetognath',      r:[14,30],   dna:1.80, spd:96, hp:22,  beh:'predator', aggr:45, sense:280,
                 vis:{arch:'worm',col:[196,26,74],col2:[210,34,62],segs:1,teeth:2,translucent:1,fins:'side'} },
  r_combpred:  { n:'Predatory ctenophore', r:[20,44],dna:2.10,spd:40, hp:30,  beh:'predator', aggr:26, sense:240,
                 vis:{arch:'medusa',col:[300,44,70],col2:[260,54,60],ctene:1,glow:1,translucent:1,mouth:'wide'} },
  r_polychaete:{ n:'Fireworm',         r:[26,64],   dna:3.20, spd:78, hp:52,  beh:'predator', aggr:44, sense:320,
                 vis:wormV(8,62,54,{segs:16,parapodia:1,spikes:2,jaw:1}) },
  r_nautilus:  { n:'Nautiloid',        r:[30,72],   dna:3.60, spd:64, hp:80,  beh:'predator', aggr:38, sense:330,
                 vis:{arch:'arthro',col:[24,34,66],col2:[200,26,54],shell:1,tentacles:12,jet:1,eyes:2,stripes:1} },
  r_eel:       { n:'Moray eel',        r:[40,96],   dna:4.40, spd:92, hp:110, beh:'predator', aggr:52, sense:380,
                 vis:wormV(96,34,48,{segs:20,mouth:'jawed',teeth:2,fins:'dorsal'}) },
  r_barracuda: { n:'Barracuda',        r:[46,110],  dna:5.20, spd:150,hp:140, beh:'predator', aggr:62, sense:460,
                 vis:fishV(204,20,58,{teeth:2,tail:'fork',counter:1,girth:1}) },
  r_swordfish: { n:'Swordfish',        r:[70,160],  dna:8.00, spd:160,hp:260, beh:'predator', aggr:58, sense:520,
                 vis:fishV(214,30,52,{bill:1,fins:'shark',tail:'crescent',dorsal:'tall',counter:1}) },
  r_dolphin:   { n:'Dolphin',          r:[60,140],  dna:7.00, spd:170,hp:230, beh:'predator', aggr:44, sense:600,
                 vis:{arch:'giant',col:[212,16,44],col2:[0,0,94],fins:'whale',tail:'fluke',mouth:'jawed',
                      eyes:2,dorsal:'curved',melon:1,counter:1} },
  r_gulper:    { n:'Gulper eel',       r:[55,130],  dna:6.20, spd:70, hp:190, beh:'predator', aggr:50, sense:420,
                 vis:wormV(300,30,30,{segs:14,mouth:'wide',tail:'whip',glow:1}) },
  r_goblin:    { n:'Goblin shark',     r:[85,190],  dna:9.50, spd:96, hp:330, beh:'predator', aggr:66, sense:520,
                 vis:{arch:'giant',col:[348,26,64],col2:[340,20,80],fins:'shark',mouth:'jawed',teeth:2,eyes:2,
                      tail:'hetero',snout:'rostral',counter:1} },
  r_vamp:      { n:'Vampire squid',    r:[45,110],  dna:5.40, spd:82, hp:170, beh:'predator', aggr:40, sense:400,
                 vis:{arch:'arthro',col:[346,40,34],col2:[12,44,26],tentacles:8,mantle:1,glow:1,eyes:2,web:1} },
  r_sevensleep:{ n:'Frilled shark',    r:[90,200],  dna:10.0, spd:88, hp:360, beh:'predator', aggr:60, sense:480,
                 vis:{arch:'giant',col:[220,14,38],col2:[210,10,54],fins:'shark',mouth:'jawed',teeth:3,eyes:2,
                      tail:'ribbon',segs:6,counter:1} },
  r_giantsquid:{ n:'Giant squid',      r:[140,320], dna:16.0, spd:130,hp:900, beh:'predator', aggr:72, sense:700,
                 vis:{arch:'arthro',col:[6,52,46],col2:[350,58,38],tentacles:14,mantle:1,jet:1,eyes:3,girth:2} },
  r_pliosaurus:{ n:'Pliosaur',         r:[160,340], dna:18.0, spd:150,hp:1100,beh:'predator', aggr:80, sense:760,
                 vis:{arch:'giant',col:[190,20,40],col2:[40,16,62],fins:'paddle',tail:'short',mouth:'jawed',
                      teeth:3,eyes:2,neck:1,counter:1} },

  /* ======================= LEVIATHANS (hazards) ========================== */
  l_basking:   { n:'Basking shark',    r:[180,300], dna:0,    spd:44, hp:9999,beh:'cruise', aggr:0, sense:0,
                 leviathan:true, vis:{arch:'giant',col:[212,22,34],col2:[204,18,58],fins:'shark',mouth:'wide',
                      rakers:1,tail:'crescent',eyes:2,girth:2,counter:1,silhouette:1} },
  l_sperm:     { n:'Sperm whale',      r:[220,380], dna:0,    spd:60, hp:9999,beh:'cruise', aggr:0, sense:0,
                 leviathan:true, vis:{arch:'giant',col:[216,12,30],col2:[210,10,46],fins:'whale',tail:'fluke',
                      mouth:'jawed',eyes:2,head:'sperm',dorsal:'bump',girth:2,silhouette:1} },
  l_shadow:    { n:'Unidentified shadow', r:[260,460], dna:0,  spd:52, hp:9999,beh:'cruise', aggr:0, sense:0,
                 leviathan:true, vis:{arch:'giant',col:[220,20,16],col2:[220,18,24],fins:'whale',tail:'fluke',
                      girth:3,silhouette:1} },
};

/* ============================================================================
   3. ZONES — depth biomes
   ========================================================================== */
const ZONES = [
  { id:'epi', name:'Sunlit Zone', latin:'Epipelagic', y0:CFG.MIN_Y, y1:3000,
    bg:[[188,72,72],[196,66,52]], light:1.00, fog:[192,64,66],
    rays:1.0, snow:0.5, plants:1.0, glowNeed:0,
    dens:{ food:24, prey:5.2, pred:0.8, lev:0.010 },
    tables:{
      food:[['f_snow',26],['f_detritus',16],['f_bacterium',22],['f_coccus',10],['f_diatom',16],['f_dino',8],
            ['f_algae',14],['f_coccolith',8],['f_foram',6],['f_kelp',5],['f_seagrass',5],['f_coral',4],
            ['f_archaea',4]],
      prey:[['p_ciliate',16],['p_rotifer',12],['p_copepod',14],['p_nauplius',10],['p_herring',8],
            ['p_salp',6],['p_combjelly',6],['p_larvacean',6],['p_jellysm',6],['p_krill',8]],
      pred:[['r_jellyswarm',30],['r_shrimp',18],['r_chaetognath',22],['r_combpred',18],['r_barracuda',12]],
      lev: [['l_basking',100]],
  }},
  { id:'meso', name:'Twilight Zone', latin:'Mesopelagic', y0:3000, y1:9000,
    bg:[[212,58,36],[222,64,18]], light:0.52, fog:[216,58,26],
    rays:0.28, snow:1.0, plants:0.14, glowNeed:0.35,
    dens:{ food:12, prey:5.4, pred:1.4, lev:0.020 },
    tables:{
      food:[['f_snow',40],['f_detritus',22],['f_bacterium',12],['f_coccus',8],['f_foram',8],['f_diatom',6],
            ['f_archaea',6],['f_coccolith',5],['f_whalefall',2]],
      prey:[['p_hatchet',18],['p_lantern',20],['p_bristle',16],['p_squid',12],['p_krill',10],['p_salp',8],
            ['p_combjelly',6],['p_jellysm',8],['p_copepod',6]],
      pred:[['r_jellyswarm',16],['r_nautilus',16],['r_polychaete',18],['r_eel',16],['r_swordfish',12],
            ['r_vamp',10],['r_chaetognath',8],['r_dolphin',6]],
      lev: [['l_basking',55],['l_sperm',45]],
  }},
  { id:'bathy', name:'Midnight Zone', latin:'Bathypelagic', y0:9000, y1:17000,
    bg:[[230,60,11],[236,70,5]], light:0.17, fog:[232,62,10],
    rays:0, snow:0.9, plants:0.04, glowNeed:0.75,
    dens:{ food:9, prey:4.6, pred:1.7, lev:0.035 },
    tables:{
      food:[['f_snow',46],['f_detritus',22],['f_bacterium',12],['f_archaea',12],['f_foram',8],
            ['f_whalefall',6],['f_coccus',4]],
      prey:[['p_fangtooth',20],['p_bristle',16],['p_squid',14],['p_dumbo',14],['p_amphipod',14],
            ['p_seapig',10],['p_lantern',12]],
      pred:[['r_gulper',22],['r_goblin',22],['r_vamp',18],['r_sevensleep',16],['r_eel',12],
            ['r_giantsquid',10],['r_dolphin',6]],
      lev: [['l_sperm',60],['l_shadow',40]],
  }},
  { id:'abyss', name:'Abyssal Zone', latin:'Abyssopelagic', y0:17000, y1:CFG.MAX_DEPTH,
    bg:[[240,64,5],[250,80,2]], light:0.06, fog:[244,66,5],
    rays:0, snow:0.5, plants:0.06, glowNeed:1.0,
    dens:{ food:8, prey:3.8, pred:1.9, lev:0.050 },
    tables:{
      food:[['f_ventmat',20],['f_ventplume',16],['f_whalefall',16],['f_snow',24],['f_bacterium',10],
            ['f_archaea',10],['f_detritus',8]],
      prey:[['p_amphipod',22],['p_seapig',20],['p_dumbo',18],['p_fangtooth',16],['p_squid',14],['p_lantern',8]],
      pred:[['r_gulper',24],['r_sevensleep',22],['r_giantsquid',22],['r_goblin',18],['r_pliosaurus',14]],
      lev: [['l_shadow',58],['l_sperm',42]],
  }},
];
function zoneAt(y) {
  if (y <= ZONES[0].y1) return ZONES[0];
  for (let i = 1; i < ZONES.length; i++) if (y < ZONES[i].y1) return ZONES[i];
  return ZONES[ZONES.length - 1];
}
function zoneIndex(y) { return ZONES.indexOf(zoneAt(y)); }
/* blend between two zone backgrounds for a smooth vertical gradient */
function zoneBlend(y) {
  const i = zoneIndex(y), z = ZONES[i];
  const t = clamp(invLerp(z.y0, z.y1, y), 0, 1);
  return { zone:z, i, t };
}
