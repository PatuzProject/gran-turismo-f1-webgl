"use strict";

const fs = require('fs');
const path = require('path');

const trackDefs = [
  {
    file: 'Austin.csv',
    id: 'austin',
    name: 'COTA - AUSTIN GP',
    fullName: 'Circuit of the Americas (Austin, Texas)',
    subtitle: 'Salita Curva 1 • Settore S Snake • Lungo Backstraight DRS',
    country: 'USA',
    timeOfDay: 'Pomeriggio Soleggiato • Texas',
    prizeFirst: 35000,
    roadWidth: 17.5,
    lengthKm: '5.51 km',
    elevationInfo: '20 Curve FIA • 2 Zone DRS • Salita T1',
    themeColor: '#ef4444',
    skyTop: '#1e3a8a',
    skyBottom: '#93c5fd',
    fogColor: 0x89c2ff,
    asphaltColor: '#222731',
    curbColorA: '#ef4444',
    curbColorB: '#f8fafc',
    groundColor: 0x22492b,
    sceneryType: 'airfield',
    step: 8,
    sectorSplits: [0.28, 0.68],
    speedTrapU: 0.58,
    drsZones: [
      { startU: 0.96, endU: 0.08, detectionU: 0.93, name: 'DRS Zone 1 (Rettifilo Principale)' },
      { startU: 0.42, endU: 0.67, detectionU: 0.39, name: 'DRS Zone 2 (Lungo Backstraight)' }
    ],
    corners: [
      { u: 0.0, num: 'START', name: 'Rettifilo Principale (Start / Finish)' },
      { u: 0.06, num: 'UP', name: 'Salita Uphill verso Curva 1 (+40m)' },
      { u: 0.12, num: '01', name: 'T1 Salita del COTA (Tornante Sinistra)' },
      { u: 0.16, num: '02', name: 'T2 Curva Veloce in Discesa' },
      { u: 0.21, num: '03-04', name: 'T3-T4 Gli Esses (Snake Settore 1)' },
      { u: 0.25, num: '05-06', name: 'T5-T6 S-Curves Alta Velocità' },
      { u: 0.32, num: '07-10', name: 'T7-T10 Allungo verso il Tornante' },
      { u: 0.40, num: '11', name: 'T11 Tornante Stretto (Ingresso DRS 2)' },
      { u: 0.55, num: 'TRAP', name: 'Lungo Backstraight (330+ km/h)' },
      { u: 0.69, num: '12', name: 'T12 Staccata Violenta Backstraight' },
      { u: 0.73, num: '13-15', name: 'T13-T15 Complesso dello Stadio' },
      { u: 0.83, num: '16-18', name: 'T16-T18 Triplo Curvone Carousel' },
      { u: 0.92, num: '19', name: 'T19 Curva Cieca Sinistra' },
      { u: 0.97, num: '20', name: 'T20 Curva Finale sul Traguardo' }
    ],
    description: 'Circuito delle Americhe di Austin (5.513 km, 20 curve): famosa salita ripida verso il tornante cieco di Curva 1, sequenza ad alta velocità di esse ispirata a Silverstone, lunghissimo rettilineo posteriore da oltre 330 km/h e settore dello stadio.'
  },
  {
    file: 'BrandsHatch.csv',
    id: 'brands_hatch',
    name: 'BRANDS HATCH GP',
    fullName: 'Brands Hatch Circuit (Kent, Gran Bretagna)',
    subtitle: 'Paddock Hill Bend • Druids • Montagne Russe Inglesi',
    country: 'UK',
    timeOfDay: 'Mattutino • Colline del Kent',
    prizeFirst: 25000,
    roadWidth: 16.5,
    lengthKm: '3.91 km',
    elevationInfo: '10 Curve Storiche • 2 Zone DRS • Saliscendi',
    themeColor: '#10b981',
    skyTop: '#1e293b',
    skyBottom: '#64748b',
    fogColor: 0x475569,
    asphaltColor: '#1c2029',
    curbColorA: '#dc2626',
    curbColorB: '#f8fafc',
    groundColor: 0x1a472a,
    sceneryType: 'forest',
    step: 6,
    sectorSplits: [0.30, 0.70],
    speedTrapU: 0.44,
    drsZones: [
      { startU: 0.95, endU: 0.04, detectionU: 0.91, name: 'DRS Zone 1 (Brabham Straight)' },
      { startU: 0.35, endU: 0.49, detectionU: 0.32, name: 'DRS Zone 2 (Pilgrim\'s Drop)' }
    ],
    corners: [
      { u: 0.0, num: 'START', name: 'Brabham Straight (Start / Finish)' },
      { u: 0.05, num: '01', name: 'T1 Paddock Hill Bend (Discesa Cieca)' },
      { u: 0.10, num: 'UP', name: 'Hailwood Hill (Frenata in Salita)' },
      { u: 0.15, num: '02', name: 'T2 Druids Hairpin (Tornante Storico)' },
      { u: 0.21, num: '03', name: 'T3 Graham Hill Bend (Sinistra Veloce)' },
      { u: 0.26, num: 'DRS 2', name: 'Cooper Straight (Allungo Settore 1)' },
      { u: 0.31, num: '04', name: 'T4 Surtees Bend' },
      { u: 0.39, num: 'TRAP', name: 'Pilgrim\'s Drop & Hawthorn Hill' },
      { u: 0.51, num: '05', name: 'T5 Hawthorn Bend (Piegatura Veloce)' },
      { u: 0.60, num: '06', name: 'T6 Westfield Bend' },
      { u: 0.68, num: '07', name: 'Dingle Dell & T7 Sheene Curve' },
      { u: 0.77, num: '08', name: 'T8 Stirling\'s Bend' },
      { u: 0.88, num: '09', name: 'T9 Clearways (Ampia Curva a Destra)' },
      { u: 0.94, num: '10', name: 'T10 Clark Curve (Uscita sul Traguardo)' }
    ],
    description: 'Tracciato storico britannico del Kent (3.916 km): la leggendaria discesa a tuffo di Paddock Hill, la staccata in salita verso il tornante Druids e le veloci curve nel bosco di Hawthorn, Westfield e Clearways.'
  },
  {
    file: 'Budapest.csv',
    id: 'budapest',
    name: 'HUNGARORING GP',
    fullName: 'Hungaroring Circuit (Budapest, Ungheria)',
    subtitle: 'Monaco Senza Muri • Tecnico, Guidato e Tortuoso',
    country: 'UNGHERIA',
    timeOfDay: 'Pomeriggio Estivo • Budapest',
    prizeFirst: 30000,
    roadWidth: 16.5,
    lengthKm: '4.38 km',
    elevationInfo: '14 Curve Tecniche • 2 Zone DRS • Poco Grip',
    themeColor: '#06b6d4',
    skyTop: '#0f172a',
    skyBottom: '#38bdf8',
    fogColor: 0x7dd3fc,
    asphaltColor: '#252a34',
    curbColorA: '#dc2626',
    curbColorB: '#16a34a',
    groundColor: 0x243e20,
    sceneryType: 'park',
    step: 7,
    sectorSplits: [0.29, 0.70],
    speedTrapU: 0.08,
    drsZones: [
      { startU: 0.95, endU: 0.12, detectionU: 0.92, name: 'DRS Zone 1 (Rettifilo Principale)' },
      { startU: 0.17, endU: 0.24, detectionU: 0.15, name: 'DRS Zone 2 (Discesa T1-T2)' }
    ],
    corners: [
      { u: 0.0, num: 'START', name: 'Rettifilo di Partenza (DRS 1)' },
      { u: 0.08, num: 'TRAP', name: 'Speed Trap Principale (315+ km/h)' },
      { u: 0.14, num: '01', name: 'T1 Prima Staccata a Destra (90°)' },
      { u: 0.19, num: 'DRS 2', name: 'Allungo in Discesa verso T2 (DRS 2)' },
      { u: 0.26, num: '02', name: 'T2 Curvone a Sinistra in Discesa' },
      { u: 0.31, num: '03', name: 'T3 Curva Veloce verso la Collina' },
      { u: 0.39, num: '04', name: 'T4 Curva Cieca Veloce Mansell' },
      { u: 0.46, num: '05', name: 'T5 Ampio Raggio in Salita' },
      { u: 0.54, num: '06-07', name: 'T6-T7 Chicane Lenta del Settore 2' },
      { u: 0.60, num: '08-09', name: 'T8-T9 Curvoni Sequenziali a Sinistra' },
      { u: 0.67, num: '10-11', name: 'T10-T11 Allungo Tecnico' },
      { u: 0.81, num: '12', name: 'T12 Curva ad Angolo Retto' },
      { u: 0.86, num: '13', name: 'T13 Penultima Curva a Sinistra' },
      { u: 0.93, num: '14', name: 'T14 Curvone Parabolico sul Traguardo' }
    ],
    description: 'Tracciato tecnico e tortuoso situato vicino a Budapest (4.381 km, 14 curve): noto come un circuito da kart per monoposto di F1 per il ritmo incessante di curve, richiede precisione millimetrica di guida e carico aerodinamico massimo.'
  },
  {
    file: 'Catalunya.csv',
    id: 'catalunya',
    name: 'BARCELONA-CATALUNYA',
    fullName: 'Circuit de Barcelona-Catalunya (Montmeló, Spagna)',
    subtitle: 'Il Banco di Prova F1 • Elf, Renault & Campsa',
    country: 'SPAGNA',
    timeOfDay: 'Mezzogiorno Soleggiato • Montmeló',
    prizeFirst: 32000,
    roadWidth: 17.0,
    lengthKm: '4.65 km',
    elevationInfo: '14 Curve Complete • 2 Zone DRS • Curvone Renault',
    themeColor: '#f59e0b',
    skyTop: '#1d4ed8',
    skyBottom: '#bae6fd',
    fogColor: 0x93c5fd,
    asphaltColor: '#1f242e',
    curbColorA: '#dc2626',
    curbColorB: '#facc15',
    groundColor: 0x274a2b,
    sceneryType: 'park',
    step: 7,
    sectorSplits: [0.26, 0.65],
    speedTrapU: 0.10,
    drsZones: [
      { startU: 0.93, endU: 0.14, detectionU: 0.89, name: 'DRS Zone 1 (Rettifilo Principale)' },
      { startU: 0.53, endU: 0.62, detectionU: 0.50, name: 'DRS Zone 2 (Rettilineo Opposto)' }
    ],
    corners: [
      { u: 0.0, num: 'START', name: 'Rettifilo Principale (Traguardo DRS 1)' },
      { u: 0.10, num: 'TRAP', name: 'Speed Trap Ufficiale (340+ km/h)' },
      { u: 0.18, num: '01-02', name: 'T1-T2 Variante Elf (Destra-Sinistra)' },
      { u: 0.24, num: '03', name: 'T3 Curvone Renault (Ampio Destra Pieno)' },
      { u: 0.28, num: '04', name: 'T4 Curva Repsol (Destra 90°)' },
      { u: 0.37, num: '05', name: 'T5 Tornante Seat (Sinistra in Discesa)' },
      { u: 0.46, num: '07-08', name: 'T7-T8 Variante Wurth (Salita Rapida)' },
      { u: 0.51, num: '09', name: 'T9 Curvone Campsa (Alta Velocità)' },
      { u: 0.58, num: 'DRS 2', name: 'Backstraight Diagonale (DRS Zone 2)' },
      { u: 0.63, num: '10', name: 'T10 Nuova Curva La Caixa (Frenata Dura)' },
      { u: 0.75, num: '12', name: 'T12 Banc Sabadell (Curva Lenta)' },
      { u: 0.80, num: '13', name: 'T13 Curva Veloce Europcar' },
      { u: 0.86, num: '14', name: 'T14 Nuova Curva Catalunya Flat-Out' },
      { u: 0.91, num: 'S3', name: 'Allungo Finale verso la Griglia' }
    ],
    description: 'Il circuito sede storica dei test invernali di Formula 1 (4.657 km, 14 curve): lungo rettilineo da oltre 1 km, curvone Renault da percorrere a pieno gas in appoggio, Campsa in salita e layout rinnovato con le due velocissime curve finali.'
  },
  {
    file: 'Hockenheim.csv',
    id: 'hockenheim',
    name: 'HOCKENHEIMRING',
    fullName: 'Hockenheimring Baden-Württemberg (Germania)',
    subtitle: 'Parabolika ad Alta Velocità & Stadio Motodrom',
    country: 'GERMANIA',
    timeOfDay: 'Pomeriggio • Foresta del Baden',
    prizeFirst: 34000,
    roadWidth: 17.0,
    lengthKm: '4.57 km',
    elevationInfo: '17 Curve • 2 Zone DRS • Parabolika 345 km/h',
    themeColor: '#e11d48',
    skyTop: '#0f172a',
    skyBottom: '#475569',
    fogColor: 0x334155,
    asphaltColor: '#202530',
    curbColorA: '#e11d48',
    curbColorB: '#f8fafc',
    groundColor: 0x163820,
    sceneryType: 'forest',
    step: 7,
    sectorSplits: [0.26, 0.66],
    speedTrapU: 0.38,
    drsZones: [
      { startU: 0.94, endU: 0.05, detectionU: 0.90, name: 'DRS Zone 1 (Rettifilo Motodrom)' },
      { startU: 0.26, endU: 0.45, detectionU: 0.22, name: 'DRS Zone 2 (Parabolika Full Speed)' }
    ],
    corners: [
      { u: 0.0, num: 'START', name: 'Rettifilo del Motodrom (Start / Finish)' },
      { u: 0.06, num: '01', name: 'T1 Nordkurve (Curva Veloce a Destra)' },
      { u: 0.19, num: '02-04', name: 'T2-T4 Svolta verso la Parabolika' },
      { u: 0.28, num: 'PARAB', name: 'Inizio Parabolika (Curvone Flat-Out)' },
      { u: 0.38, num: 'TRAP', name: 'Parabolika DRS (345+ km/h Speed Trap)' },
      { u: 0.46, num: '06', name: 'T6 Tornante Spitzkehre (Staccata Brutale)' },
      { u: 0.56, num: '07-09', name: 'T7-T9 Complesso Mercedes Arena' },
      { u: 0.62, num: '10', name: 'T10 Piegatura Veloce a Sinistra' },
      { u: 0.66, num: 'S2', name: 'Allungo verso lo Stadio Motodrom' },
      { u: 0.76, num: '12', name: 'T12 Ingresso Stadio Motodrom' },
      { u: 0.83, num: '13', name: 'T13 Sachskurve (Curva Sopraelevata)' },
      { u: 0.87, num: '14-15', name: 'T14-T15 Doppia Curva Opel' },
      { u: 0.93, num: '16-17', name: 'T16-T17 Südkurve Traguardo' }
    ],
    description: 'Il tempio tedesco della velocità di Baden-Württemberg (4.574 km, 17 curve): la celebre Parabolika percorsa in piena accelerazione con DRS fino a 345 km/h, la durissima staccata al tornante Spitzkehre e il leggendario anfiteatro del Motodrom.'
  }
];

const currentData = fs.readFileSync('js/data.js', 'utf8');
const catIdx = currentData.indexOf('const TRACK_CATALOG = [');
const beforeCatalog = currentData.slice(0, catIdx);

const monzaMatch = currentData.match(/\{\s*id:\s*\"monza\"[\s\S]*?description:[\s\S]*?\},/);
if (!monzaMatch) {
  console.error('Could not find Monza in data.js!');
  process.exit(1);
}
const monzaBlock = monzaMatch[0];

const newTrackBlocks = [];
for (const t of trackDefs) {
  const filePath = path.join('raceTracks', 'racetrack-database', 'tracks', t.file);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split(/\r?\n/).filter(l => l && !l.startsWith('#'));
  const pts = lines.map(l => l.split(',').map(Number));

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const points3D = [];
  for (let i = 0; i < pts.length; i += t.step) {
    const p = pts[i];
    points3D.push([
      Math.round((p[0] - midX) * 10) / 10,
      0,
      Math.round(-(p[1] - midY) * 10) / 10
    ]);
  }

  const jsonPoints = points3D.map(p => '      [' + p.join(', ') + ']').join(',\n');
  const jsonDrs = JSON.stringify(t.drsZones, null, 6).replace(/\n/g, '\n    ');
  const jsonCorners = JSON.stringify(t.corners, null, 6).replace(/\n/g, '\n    ');

  const block = `  {
    id: ${JSON.stringify(t.id)},
    name: ${JSON.stringify(t.name)},
    fullName: ${JSON.stringify(t.fullName)},
    subtitle: ${JSON.stringify(t.subtitle)},
    country: ${JSON.stringify(t.country)},
    timeOfDay: ${JSON.stringify(t.timeOfDay)},
    prizeFirst: ${t.prizeFirst},
    roadWidth: ${t.roadWidth.toFixed(1)},
    lengthKm: ${JSON.stringify(t.lengthKm)},
    elevationInfo: ${JSON.stringify(t.elevationInfo)},
    themeColor: ${JSON.stringify(t.themeColor)},
    skyTop: ${JSON.stringify(t.skyTop)},
    skyBottom: ${JSON.stringify(t.skyBottom)},
    fogColor: ${t.fogColor},
    asphaltColor: ${JSON.stringify(t.asphaltColor)},
    curbColorA: ${JSON.stringify(t.curbColorA)},
    curbColorB: ${JSON.stringify(t.curbColorB)},
    groundColor: ${t.groundColor},
    sceneryType: ${JSON.stringify(t.sceneryType)},
    sectorSplits: [${t.sectorSplits.join(', ')}],
    speedTrapU: ${t.speedTrapU},
    drsZones: ${jsonDrs},
    corners: ${jsonCorners},
    points: [
${jsonPoints}
    ],
    description: ${JSON.stringify(t.description)}
  },`;
  newTrackBlocks.push(block);
}

const updatedCatalog = `// =========================================================================
// CATALOGO GRAND PRIX F1 (HIGH-PRECISION RACETRACK-DATABASE + MONZA)
// =========================================================================
const TRACK_CATALOG = [
${newTrackBlocks.join('\n')}
  ${monzaBlock}
];

// =============================================================================
// TILE TRACK CATALOG — Vuoto (Solo circuiti Grand Prix ufficiali attivi)
// =============================================================================
const TILE_TRACK_CATALOG = [];
`;

const newFileContent = beforeCatalog + updatedCatalog;
fs.writeFileSync('js/data.js', newFileContent, 'utf8');
console.log('Successfully written data.js with all 5 new tracks + Monza!');

