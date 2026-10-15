"use strict";

const fs = require('fs');
const path = require('path');
const THREE = require('./three-lib.js');
global.THREE = THREE;

const TRACK_METADATA = {
  Austin: {
    id: 'austin',
    name: 'COTA - AUSTIN GP',
    fullName: 'Circuit of the Americas (Austin, Texas, USA)',
    subtitle: 'Salita Curva 1 (+41m) • Settore S Snake • Lungo Backstraight DRS',
    country: 'USA',
    timeOfDay: 'Pomeriggio Soleggiato • Texas',
    prizeFirst: 35000,
    roadWidth: 17.5,
    lengthKm: '5.51 km',
    elevationInfo: '20 Curve • Dislivello Reale 41m • Salita Cieca Curva 1',
    themeColor: '#ef4444',
    skyTop: '#1e3a8a',
    skyBottom: '#93c5fd',
    fogColor: 0x89c2ff,
    asphaltColor: '#222731',
    curbColorA: '#ef4444',
    curbColorB: '#f8fafc',
    groundColor: 0x22492b,
    sceneryType: 'airfield',
    description: 'Circuito delle Americhe di Austin (5.513 km, 20 curve): famosa salita ripida da 11 piani verso il tornante cieco di Curva 1 (+41m), sequenza ad alta velocità di esse Snake ispirata a Silverstone, lunghissimo rettilineo posteriore da oltre 330 km/h e settore dello stadio.'
  },
  BrandsHatch: {
    id: 'brands_hatch',
    name: 'BRANDS HATCH GP',
    fullName: 'Brands Hatch Circuit (Kent, Gran Bretagna)',
    subtitle: 'Paddock Hill Bend (-10m) • Druids (+22m) • Montagne Russe Inglesi',
    country: 'UK',
    timeOfDay: 'Mattutino • Colline del Kent',
    prizeFirst: 25000,
    roadWidth: 16.5,
    lengthKm: '3.91 km',
    elevationInfo: '10 Curve Storiche • Dislivello Reale 35m • Tuffo Paddock Hill & Druids',
    themeColor: '#10b981',
    skyTop: '#1e293b',
    skyBottom: '#64748b',
    fogColor: 0x475569,
    asphaltColor: '#1c2029',
    curbColorA: '#dc2626',
    curbColorB: '#f8fafc',
    groundColor: 0x1a472a,
    sceneryType: 'forest',
    description: 'Tracciato storico britannico del Kent (3.916 km): la leggendaria discesa a tuffo cieco di Paddock Hill Bend (-10m), la staccata in salita verso il tornante Druids (+22m) e le veloci curve nel bosco di Hawthorn, Westfield e Clearways.'
  },
  Budapest: {
    id: 'budapest',
    name: 'HUNGARORING GP',
    fullName: 'Hungaroring Circuit (Budapest, Ungheria)',
    subtitle: 'Conca Naturale (-16m) • Scollino T4 (+18m) • Tecnico & Tortuoso',
    country: 'UNGHERIA',
    timeOfDay: 'Pomeriggio Estivo • Budapest',
    prizeFirst: 30000,
    roadWidth: 16.5,
    lengthKm: '4.38 km',
    elevationInfo: '14 Curve Tecniche • Dislivello Reale 35m • Conca Naturale & Salita T4',
    themeColor: '#06b6d4',
    skyTop: '#0f172a',
    skyBottom: '#38bdf8',
    fogColor: 0x7dd3fc,
    asphaltColor: '#252a34',
    curbColorA: '#dc2626',
    curbColorB: '#16a34a',
    groundColor: 0x243e20,
    sceneryType: 'park',
    description: 'Tracciato tecnico e ondulato situato nella conca naturale di Budapest (4.381 km, 14 curve): discesa verso il tornante di Curva 1, risalita cieca sul dosso di Curva 4 Mansell e sequenza incessante di curve ad alto carico.'
  },
  Catalunya: {
    id: 'catalunya',
    name: 'BARCELONA-CATALUNYA',
    fullName: 'Circuit de Barcelona-Catalunya (Montmeló, Spagna)',
    subtitle: 'Salita Curvone Renault • Scollinamento Campsa (+26m) • Banco di Prova',
    country: 'SPAGNA',
    timeOfDay: 'Mezzogiorno Soleggiato • Montmeló',
    prizeFirst: 32000,
    roadWidth: 17.0,
    lengthKm: '4.65 km',
    elevationInfo: '14 Curve • Dislivello Reale 30m • Curvone Renault & Vetta Campsa',
    themeColor: '#f59e0b',
    skyTop: '#1d4ed8',
    skyBottom: '#bae6fd',
    fogColor: 0x93c5fd,
    asphaltColor: '#1f242e',
    curbColorA: '#dc2626',
    curbColorB: '#facc15',
    groundColor: 0x274a2b,
    sceneryType: 'park',
    description: 'Il circuito sede storica dei test invernali di Formula 1 (4.657 km, 14 curve): discesa alla prima chicane, curvone Renault percorso in piena salita, scollinamento cieco di Curva 9 Campsa (+26m) e discesa verso la staccata della Caixa.'
  },
  Hockenheim: {
    id: 'hockenheim',
    name: 'HOCKENHEIMRING',
    fullName: 'Hockenheimring Baden-Württemberg (Germania)',
    subtitle: 'Parabolika ad Alta Velocità • Staccata Spitzkehre • Stadio Motodrom',
    country: 'GERMANIA',
    timeOfDay: 'Pomeriggio • Foresta del Baden',
    prizeFirst: 34000,
    roadWidth: 17.0,
    lengthKm: '4.57 km',
    elevationInfo: '17 Curve • Dislivello Reale 9m • Parabolika 345 km/h & Motodrom',
    themeColor: '#e11d48',
    skyTop: '#0f172a',
    skyBottom: '#475569',
    fogColor: 0x334155,
    asphaltColor: '#202530',
    curbColorA: '#e11d48',
    curbColorB: '#f8fafc',
    groundColor: 0x163820,
    sceneryType: 'forest',
    description: 'Il tempio tedesco della velocità di Baden-Württemberg (4.574 km, 17 curve): la celebre Parabolika percorsa in piena accelerazione con DRS fino a 345 km/h, la durissima staccata al tornante Spitzkehre e il leggendario anfiteatro del Motodrom.'
  },
  IMS: {
    id: 'ims',
    name: 'INDIANAPOLIS GP',
    fullName: 'Indianapolis Motor Speedway GP (Indiana, USA)',
    subtitle: 'Il Tempio Americano • Sopraelevata Curva 1 & Infield Tecnico',
    country: 'USA',
    timeOfDay: 'Pomeriggio • Brickyard Speedway',
    prizeFirst: 36000,
    roadWidth: 17.5,
    lengthKm: '4.02 km',
    elevationInfo: '14 Curve • Banking Sopraelevato • Yard of Bricks',
    themeColor: '#eab308',
    skyTop: '#1e3a8a',
    skyBottom: '#93c5fd',
    fogColor: 0x89c2ff,
    asphaltColor: '#222731',
    curbColorA: '#dc2626',
    curbColorB: '#f8fafc',
    groundColor: 0x22492b,
    sceneryType: 'airfield',
    description: 'Il tracciato stradale all\'interno del mitico catino di Indianapolis (4.023 km): percorre l\'infield tecnico ricco di staccate e la leggendaria curva sopraelevata dell\'ovale con passaggio sul traguardo Yard of Bricks.'
  },
  Melbourne: {
    id: 'melbourne',
    name: 'ALBERT PARK GP',
    fullName: 'Albert Park Circuit (Melbourne, Australia)',
    subtitle: 'Cittadino Veloce sul Lago • Chicane Rapide & DRS',
    country: 'AUSTRALIA',
    timeOfDay: 'Tramonto Dorato • Melbourne Lake',
    prizeFirst: 38000,
    roadWidth: 17.0,
    lengthKm: '5.30 km',
    elevationInfo: '14 Curve Veloci • 4 Zone DRS • Lungolago Ondulato',
    themeColor: '#38bdf8',
    skyTop: '#0f172a',
    skyBottom: '#bae6fd',
    fogColor: 0x93c5fd,
    asphaltColor: '#1d222e',
    curbColorA: '#0284c7',
    curbColorB: '#f8fafc',
    groundColor: 0x1a472a,
    sceneryType: 'park',
    description: 'Circuito semi-cittadino che si snoda attorno all\'Albert Park Lake di Melbourne (5.278 km, 14 curve): asfalto stradale liscio, chicane velocissime ad alto carico e ben 4 zone DRS.'
  },
  MexicoCity: {
    id: 'mexico_city',
    name: 'HERMANOS RODRÍGUEZ',
    fullName: 'Autódromo Hermanos Rodríguez (Città del Messico)',
    subtitle: 'Aria Rarefatta 2.285m • Stadio Foro Sol • Rettilineo 355 km/h',
    country: 'MESSICO',
    timeOfDay: 'Mezzogiorno • Altopiano Messicano',
    prizeFirst: 40000,
    roadWidth: 17.0,
    lengthKm: '4.30 km',
    elevationInfo: '17 Curve • Quota 2.285m • Stadio Foro Sol & Rettilineo 355 km/h',
    themeColor: '#10b981',
    skyTop: '#1e3a8a',
    skyBottom: '#60a5fa',
    fogColor: 0x93c5fd,
    asphaltColor: '#222731',
    curbColorA: '#16a34a',
    curbColorB: '#dc2626',
    groundColor: 0x22492b,
    sceneryType: 'city',
    description: 'Situato a 2.285 metri di quota a Città del Messico (4.304 km): l\'aria rarefatta regala velocità di punta record di oltre 355 km/h sul rettilineo principale prima dell\'ingresso nello spettacolare stadio da baseball Foro Sol.'
  },
  Montreal: {
    id: 'montreal',
    name: 'MONTREAL GP',
    fullName: 'Circuit Gilles-Villeneuve (Montréal, Canada)',
    subtitle: 'Isola Notre-Dame • Tornante Épingle & Muro dei Campioni',
    country: 'CANADA',
    timeOfDay: 'Pomeriggio • Fiume San Lorenzo',
    prizeFirst: 42000,
    roadWidth: 16.5,
    lengthKm: '4.36 km',
    elevationInfo: '14 Curve • Dislivello 6m • Isola Notre-Dame & Wall of Champions',
    themeColor: '#ef4444',
    skyTop: '#1e293b',
    skyBottom: '#93c5fd',
    fogColor: 0x89c2ff,
    asphaltColor: '#1c2029',
    curbColorA: '#ef4444',
    curbColorB: '#f8fafc',
    groundColor: 0x163820,
    sceneryType: 'park',
    description: 'Tracciato cittadino sull\'isola artificiale di Notre-Dame a Montréal (4.361 km): staccate durissime sui freni, il celebre tornante dell\'Épingle e l\'uscita millimetrica a sfiorare il Muro dei Campioni.'
  },
  MoscowRaceway: {
    id: 'moscow_raceway',
    name: 'MOSCOW RACEWAY',
    fullName: 'Moscow Raceway (Volokolamsk, Russia)',
    subtitle: 'Layout FIA Tilke • Salite Tecniche (+12m) & Conca (-14m)',
    country: 'RUSSIA',
    timeOfDay: 'Mattino Fresco • Pianura di Mosca',
    prizeFirst: 28000,
    roadWidth: 16.5,
    lengthKm: '4.06 km',
    elevationInfo: '15 Curve • Dislivello Reale 26m • Saliscendi Tecnico',
    themeColor: '#6366f1',
    skyTop: '#0f172a',
    skyBottom: '#64748b',
    fogColor: 0x475569,
    asphaltColor: '#1f242e',
    curbColorA: '#4f46e5',
    curbColorB: '#f8fafc',
    groundColor: 0x1a472a,
    sceneryType: 'forest',
    description: 'Autodromo internazionale moderno progettato da Hermann Tilke (4.060 km, 15 curve): cambi di pendenza continui, chicane cieche e un lunghissimo rettilineo posteriore in discesa.'
  },
  Norisring: {
    id: 'norisring',
    name: 'NORISRING SPEEDWAY',
    fullName: 'Norisring Street Circuit (Norimberga, Germania)',
    subtitle: 'La Monaco della Franconia • DTM • Tornanti Grundig & Dutzendteich',
    country: 'GERMANIA',
    timeOfDay: 'Pomeriggio Estivo DTM • Norimberga',
    prizeFirst: 24000,
    roadWidth: 18.0,
    lengthKm: '2.30 km',
    elevationInfo: '4 Curve Secche • Staccate da 280 km/h • Zeppelinfeld',
    themeColor: '#f59e0b',
    skyTop: '#1e3a8a',
    skyBottom: '#fde047',
    fogColor: 0xfef08a,
    asphaltColor: '#181c26',
    curbColorA: '#e11d48',
    curbColorB: '#facc15',
    groundColor: 0x1e293b,
    sceneryType: 'city',
    description: 'Il circuito cittadino più veloce e spettacolare della Germania (2.300 km): ospita il DTM attorno alla tribuna Zeppelinfeld con staccate al limite a oltre 280 km/h sui due tornanti a 180°.'
  },
  Nuerburgring: {
    id: 'nuerburgring',
    name: 'NÜRBURGRING GP',
    fullName: 'Nürburgring GP-Strecke (Eifel, Germania)',
    subtitle: 'Mercedes Arena (-12m) • Tornante Dunlop (-28m) • Vetta Kumho (+26m)',
    country: 'GERMANIA',
    timeOfDay: 'Nuvoloso • Monti dell\'Eifel',
    prizeFirst: 36000,
    roadWidth: 17.0,
    lengthKm: '5.14 km',
    elevationInfo: '16 Curve FIA • Dislivello Reale 56m • Mercedes Arena & Dunlop',
    themeColor: '#10b981',
    skyTop: '#0f172a',
    skyBottom: '#64748b',
    fogColor: 0x475569,
    asphaltColor: '#1c2029',
    curbColorA: '#dc2626',
    curbColorB: '#f8fafc',
    groundColor: 0x153e20,
    sceneryType: 'forest',
    description: 'Il moderno circuito GP all\'ombra del leggendario Nordschleife sui monti dell\'Eifel (5.148 km, 16 curve): staccata in forte discesa verso Mercedes Arena, tuffo ripido al tornante Dunlop (-28m) e risalita attraverso la Esse Schumacher fino alla vetta Kumho (+26m).'
  },
  Oschersleben: {
    id: 'oschersleben',
    name: 'OSCHERSLEBEN ARENA',
    fullName: 'Motorsport Arena Oschersleben (Germania)',
    subtitle: 'Tecnico & Guidato • Curva 1 a 90° • Triple Chicane',
    country: 'GERMANIA',
    timeOfDay: 'Diurno • Sassonia-Anhalt',
    prizeFirst: 26000,
    roadWidth: 16.5,
    lengthKm: '3.69 km',
    elevationInfo: '14 Curve Tecniche • Dislivello 8m • Saliscendi Sassonia',
    themeColor: '#06b6d4',
    skyTop: '#1e3a8a',
    skyBottom: '#93c5fd',
    fogColor: 0x89c2ff,
    asphaltColor: '#202530',
    curbColorA: '#dc2626',
    curbColorB: '#f8fafc',
    groundColor: 0x1f4725,
    sceneryType: 'park',
    description: 'Circuito tortuoso e compatto della Sassonia-Anhalt (3.696 km, 14 curve): staccata ad angolo retto di curva 1, curvoni continui a medio raggio e chicane veloci che esaltano il bilanciamento del telaio.'
  },
  Sakhir: {
    id: 'sakhir',
    name: 'BAHRAIN - SAKHIR GP',
    fullName: 'Bahrain International Circuit (Sakhir, Bahrain)',
    subtitle: 'Gran Premio nel Deserto • Salita Curva 4 (+14m) • Discesa Cieca T10',
    country: 'BAHRAIN',
    timeOfDay: 'Notturno • Deserto di Sakhir',
    prizeFirst: 44000,
    roadWidth: 17.5,
    lengthKm: '5.41 km',
    elevationInfo: '15 Curve • Dislivello Reale 17m • Salita T4 & Discesa T9-T10',
    themeColor: '#e11d48',
    skyTop: '#060911',
    skyBottom: '#1e1b4b',
    fogColor: 0x0b1120,
    asphaltColor: '#181b24',
    curbColorA: '#e11d48',
    curbColorB: '#f8fafc',
    groundColor: 0x272016,
    sceneryType: 'airfield',
    description: 'Gara notturna sotto migliaia di riflettori nel deserto del Bahrain (5.412 km, 15 curve): lunghi rettilinei con 3 zone DRS, ripida salita verso la staccata di Curva 4 (+14m) e la tecnica frenata in discesa a ruote sterzate di Curva 10.'
  },
  SaoPaulo: {
    id: 'sao_paulo',
    name: 'INTERLAGOS - SÃO PAULO',
    fullName: 'Autódromo José Carlos Pace (San Paolo, Brasile)',
    subtitle: 'Conca Naturale • Tuffo S do Senna • Salita Junção & Subida dos Boxes',
    country: 'BRASILE',
    timeOfDay: 'Pomeriggio Tropicale • San Paolo',
    prizeFirst: 42000,
    roadWidth: 17.0,
    lengthKm: '4.30 km',
    elevationInfo: '15 Curve • Dislivello Reale 43m • Conca Naturale & Subida dos Boxes',
    themeColor: '#eab308',
    skyTop: '#0f172a',
    skyBottom: '#38bdf8',
    fogColor: 0x7dd3fc,
    asphaltColor: '#1f242e',
    curbColorA: '#eab308',
    curbColorB: '#16a34a',
    groundColor: 0x163820,
    sceneryType: 'park',
    description: 'Il celebre catino naturale ondulato di Interlagos (4.309 km, 15 curve): partenza in quota (+34m), vertiginosa discesa nella S di Senna, fondo valle della Descida do Lago e spettacolare risalita a pieno gas lungo la Subida dos Boxes.'
  },
  Sepang: {
    id: 'sepang',
    name: 'SEPANG GP',
    fullName: 'Sepang International Circuit (Selangor, Malesia)',
    subtitle: 'Salita Esse Veloci 5-6 (+18m) • Doppio Rettifilo a V • Clima Tropicale',
    country: 'MALESIA',
    timeOfDay: 'Pomeriggio Equatoriale • Selangor',
    prizeFirst: 40000,
    roadWidth: 17.5,
    lengthKm: '5.54 km',
    elevationInfo: '15 Curve Larghe • Dislivello Reale 22m • Saliscendi Esse T5-T6',
    themeColor: '#00f0ff',
    skyTop: '#1e3a8a',
    skyBottom: '#93c5fd',
    fogColor: 0x89c2ff,
    asphaltColor: '#222731',
    curbColorA: '#dc2626',
    curbColorB: '#f8fafc',
    groundColor: 0x144020,
    sceneryType: 'park',
    description: 'Il capolavoro di architettura asiatica di Hermann Tilke (5.543 km, 15 curve): pista larghissima che favorisce i sorpassi, curvoni veloci 5 e 6 in forte salita (+18m) e i due celebri rettilinei paralleli uniti dal tornante finale.'
  },
  Shanghai: {
    id: 'shanghai',
    name: 'SHANGHAI GP',
    fullName: 'Shanghai International Circuit (Jiading, Cina)',
    subtitle: 'Carattere \'Shang\' • Chiocciola T1-T4 in Discesa • Rettilineo 1.2km',
    country: 'CINA',
    timeOfDay: 'Pomeriggio • Distretto di Jiading',
    prizeFirst: 42000,
    roadWidth: 17.5,
    lengthKm: '5.45 km',
    elevationInfo: '16 Curve • Dislivello Reale 10m • Chiocciola T1-T4 & Ponte Rettilineo',
    themeColor: '#ef4444',
    skyTop: '#1e293b',
    skyBottom: '#94a3b8',
    fogColor: 0x64748b,
    asphaltColor: '#20242e',
    curbColorA: '#ef4444',
    curbColorB: '#facc15',
    groundColor: 0x22492b,
    sceneryType: 'park',
    description: 'Tracciato a forma del carattere cinese Shang (5.451 km, 16 curve): l\'infinita curva a chiocciola iniziale (T1-T4) che scende a spirale, la rampa sopraelevata di Curva 11-13 (+7m) e il rettilineo più lungo della F1 moderna (1.170m) con staccata da 340 km/h.'
  },
  Silverstone: {
    id: 'silverstone',
    name: 'SILVERSTONE GP',
    fullName: 'Silverstone Circuit (Northamptonshire, Gran Bretagna)',
    subtitle: 'Culla della F1 • Maggotts, Becketts, Chapel & Hangar Straight',
    country: 'UK',
    timeOfDay: 'Diurno • Northamptonshire',
    prizeFirst: 45000,
    roadWidth: 18.0,
    lengthKm: '5.89 km',
    elevationInfo: '18 Curve FIA • Dislivello Reale 11m • Becketts, Stowe & The Wing',
    themeColor: '#38bdf8',
    skyTop: '#1e3a8a',
    skyBottom: '#bae6fd',
    fogColor: 0x93c5fd,
    asphaltColor: '#252a34',
    curbColorA: '#111827',
    curbColorB: '#f8fafc',
    groundColor: 0x22492b,
    sceneryType: 'airfield',
    description: 'La pista dove nacque il Mondiale di F1 nel 1950 (5.891 km, 18 curve): le curve ad altissimo carico aerodinamico Copse, Maggotts, Becketts e Chapel (+9m) percorse a oltre 290 km/h, unite dal veloce allungo dell\'Hangar Straight.'
  },
  Sochi: {
    id: 'sochi',
    name: 'SOCHI AUTODROM',
    fullName: 'Sochi Autodrom (Krasnodar Krai, Russia)',
    subtitle: 'Curvone Omega 3 • Parco Olimpico Invernale & Mar Nero',
    country: 'RUSSIA',
    timeOfDay: 'Pomeriggio Soleggiato • Riviera del Mar Nero',
    prizeFirst: 34000,
    roadWidth: 17.0,
    lengthKm: '5.84 km',
    elevationInfo: '18 Curve • Parco Olimpico • Curvone Omega',
    themeColor: '#8b5cf6',
    skyTop: '#1d4ed8',
    skyBottom: '#bae6fd',
    fogColor: 0x93c5fd,
    asphaltColor: '#1d222e',
    curbColorA: '#3b82f6',
    curbColorB: '#f8fafc',
    groundColor: 0x1f2937,
    sceneryType: 'city',
    description: 'Circuito semi-cittadino che attraversa il Parco Olimpico invernale di Sochi (5.848 km, 18 curve): dominato dall\'interminabile curvone a sinistra Omega (Curva 3) che avvolge la piazza delle medaglie.'
  },
  Spa: {
    id: 'spa',
    name: 'SPA-FRANCORCHAMPS',
    fullName: 'Circuit de Spa-Francorchamps (Stavelot, Belgio)',
    subtitle: 'Dislivello Record 102m • Eau Rouge (-8m) • Raidillon & Les Combes (+96m)',
    country: 'BELGIO',
    timeOfDay: 'Pomeriggio • Foresta delle Ardenne',
    prizeFirst: 48000,
    roadWidth: 17.5,
    lengthKm: '7.00 km',
    elevationInfo: '19 Curve FIA • Dislivello Reale 102m • Eau Rouge, Raidillon & Les Combes',
    themeColor: '#eab308',
    skyTop: '#0f172a',
    skyBottom: '#64748b',
    fogColor: 0x475569,
    asphaltColor: '#1c2029',
    curbColorA: '#dc2626',
    curbColorB: '#eab308',
    groundColor: 0x133822,
    sceneryType: 'forest',
    description: 'La leggendaria Università della Formula 1 nelle Ardenne (7.004 km, 19 curve): il dislivello più imponente del Mondiale (102.2m), con la violentissima compressione di Eau Rouge (-8m), l\'arrampicata del Raidillon al 17%, la vetta panoramica di Les Combes (+96m) e il tuffo in discesa nel curvone Pouhon.'
  },
  Spielberg: {
    id: 'spielberg',
    name: 'RED BULL RING',
    fullName: 'Red Bull Ring (Spielberg, Stiria, Austria)',
    subtitle: 'Dislivello Alpino 65m • Salita Tornante T3 (+65m) • Discesa Schlossgold',
    country: 'AUSTRIA',
    timeOfDay: 'Diurno Luminoso • Alpi della Stiria',
    prizeFirst: 36000,
    roadWidth: 17.0,
    lengthKm: '4.32 km',
    elevationInfo: '10 Curve • Dislivello Reale 65m • Salita T3 & Discesa Schlossgold',
    themeColor: '#f97316',
    skyTop: '#1e3a8a',
    skyBottom: '#bae6fd',
    fogColor: 0x93c5fd,
    asphaltColor: '#202530',
    curbColorA: '#dc2626',
    curbColorB: '#f8fafc',
    groundColor: 0x184224,
    sceneryType: 'forest',
    description: 'Circuito alpino mozzafiato immerso tra le montagne della Stiria (4.318 km, 10 curve): soli 65 secondi a giro, salita vertiginosa del 12% fino al tornante Remus di Curva 3 (+65m), picchiata ad alta velocità verso Curva 4 Schlossgold e 3 zone DRS consecutive.'
  },
  Suzuka: {
    id: 'suzuka',
    name: 'SUZUKA GP',
    fullName: 'Suzuka International Racing Course (Mie, Giappone)',
    subtitle: 'Figura di 8 Unica • Cavalcavia Overpass (+10.5m) • Esse Snake & 130R',
    country: 'GIAPPONE',
    timeOfDay: 'Tramonto • Ruota Panoramica & Cavalcavia',
    prizeFirst: 46000,
    roadWidth: 17.0,
    lengthKm: '5.80 km',
    elevationInfo: '18 Curve FIA • Dislivello Reale 40m • Incrocio Figure-8 Overpass (+10.5m)',
    themeColor: '#00f0ff',
    skyTop: '#1e1b4b',
    skyBottom: '#fb7185',
    fogColor: 0x4c1d95,
    asphaltColor: '#1d222e',
    curbColorA: '#06b6d4',
    curbColorB: '#f8fafc',
    groundColor: 0x163020,
    sceneryType: 'park',
    description: 'L\'unico circuito del Mondiale F1 con layout tridimensionale a forma di 8 (5.807 km, 18 curve): le fluide Esse in salita, il sottopasso di Degner a quota 0m, il tornante Hairpin, la Spoon Curve (+24m) e il suggestivo ponte cavalcavia a +10.5m prima della mitica Curva 130R.'
  },
  YasMarina: {
    id: 'yas_marina',
    name: 'YAS MARINA - ABU DHABI',
    fullName: 'Yas Marina Circuit (Isola Yas, Abu Dhabi, EAU)',
    subtitle: 'Gara Notturna Crepuscolare • Yas Hotel & Marina Layout Veloce',
    country: 'EAU',
    timeOfDay: 'Notturno Crepuscolo • Isola Yas',
    prizeFirst: 45000,
    roadWidth: 17.0,
    lengthKm: '5.55 km',
    elevationInfo: '16 Curve • Dislivello 6m • Marina & Banking Curva 9',
    themeColor: '#06b6d4',
    skyTop: '#060a14',
    skyBottom: '#1e1b4b',
    fogColor: 0x0c1222,
    asphaltColor: '#191d26',
    curbColorA: '#06b6d4',
    curbColorB: '#f8fafc',
    groundColor: 0x111c2e,
    sceneryType: 'city',
    description: 'Il gran premio finale di Formula 1 al tramonto sull\'isola di Yas (5.281 km, 16 curve): layout rinnovato con il banking ad alta velocità di Curva 9, il passaggio suggestivo sotto l\'hotel illuminato W Abu Dhabi e la marina.'
  },
  Zandvoort: {
    id: 'zandvoort',
    name: 'ZANDVOORT GP',
    fullName: 'Circuit Zandvoort (Olanda)',
    subtitle: 'Montagne Russe sulle Dune • Curve Sopraelevate Banking 18°',
    country: 'OLANDA',
    timeOfDay: 'Breccia Marina • Dune del Mare del Nord',
    prizeFirst: 38000,
    roadWidth: 16.5,
    lengthKm: '4.32 km',
    elevationInfo: '14 Curve • Dislivello 9m • Dune Costiere & Banking 18° Hugenholtz',
    themeColor: '#f97316',
    skyTop: '#1e3a8a',
    skyBottom: '#fdba74',
    fogColor: 0xfed7aa,
    asphaltColor: '#1d222d',
    curbColorA: '#ea580c',
    curbColorB: '#f8fafc',
    groundColor: 0x22492b,
    sceneryType: 'park',
    description: 'Tracciato spettacolare incastonato tra le dune costiere olandesi (4.259 km, 14 curve): unico al mondo per le sue curve sopraelevate con banking fino a 18 gradi (Curva 3 Hugenholtz e l\'ultima curva Luyendyk a tavoletta sul traguardo).'
  }
};

// Real-world elevation keyframes [u, elevation_in_meters]
// u is normalized distance along track [0.0, 1.0], with seamless wrap-around at 1.0 = 0.0
const TRACK_ELEVATION_KEYFRAMES = {
  Austin: [
    [0.0, 0.0], [0.08, 41.0], [0.12, 40.0], [0.18, 24.0], [0.28, 12.0],
    [0.35, -3.0], [0.48, 2.0], [0.62, 6.0], [0.74, 14.0], [0.86, 10.0], [0.96, 0.0], [1.0, 0.0]
  ],
  BrandsHatch: [
    [0.0, 14.0], [0.07, -10.0], [0.15, 20.0], [0.20, 22.0], [0.27, 6.0],
    [0.36, 4.0], [0.45, -8.0], [0.56, 10.0], [0.68, 16.0], [0.80, 18.0], [0.90, 15.0], [1.0, 14.0]
  ],
  Budapest: [
    [0.0, 6.0], [0.10, -6.0], [0.18, -16.0], [0.27, 12.0], [0.36, 18.0],
    [0.46, 14.0], [0.58, 10.0], [0.70, 4.0], [0.82, -2.0], [0.92, 6.0], [1.0, 6.0]
  ],
  Catalunya: [
    [0.0, 6.0], [0.12, -4.0], [0.20, 14.0], [0.28, 18.0], [0.38, 4.0],
    [0.48, 16.0], [0.58, 26.0], [0.68, 2.0], [0.80, 6.0], [0.92, 6.0], [1.0, 6.0]
  ],
  Hockenheim: [
    [0.0, 0.0], [0.10, 0.0], [0.22, 2.0], [0.38, 6.0], [0.48, 4.0],
    [0.60, 1.0], [0.74, -2.0], [0.88, 0.0], [1.0, 0.0]
  ],
  IMS: [
    [0.0, 0.0], [0.12, -1.0], [0.30, -1.5], [0.50, 1.0], [0.70, 0.0], [0.85, 2.5], [1.0, 0.0]
  ],
  Melbourne: [
    [0.0, 0.0], [0.12, 1.5], [0.24, 0.0], [0.38, -1.5], [0.55, 2.0],
    [0.70, 3.0], [0.85, 1.0], [0.95, 0.0], [1.0, 0.0]
  ],
  MexicoCity: [
    [0.0, 0.0], [0.15, -1.0], [0.30, 1.0], [0.50, 3.5], [0.70, 1.0], [0.85, -1.0], [0.95, 0.0], [1.0, 0.0]
  ],
  Montreal: [
    [0.0, 0.0], [0.12, -1.0], [0.25, 2.0], [0.40, 4.0], [0.55, 5.0], [0.70, 1.0], [0.85, 3.0], [0.95, 0.0], [1.0, 0.0]
  ],
  MoscowRaceway: [
    [0.0, 0.0], [0.12, -6.0], [0.25, -14.0], [0.40, 8.0], [0.55, 12.0],
    [0.70, 2.0], [0.85, 8.0], [0.95, 0.0], [1.0, 0.0]
  ],
  Norisring: [
    [0.0, 0.0], [0.22, -1.2], [0.48, 1.5], [0.70, 0.5], [0.90, 0.0], [1.0, 0.0]
  ],
  Nuerburgring: [
    [0.0, 10.0], [0.08, -12.0], [0.16, 2.0], [0.26, -24.0], [0.33, -28.0],
    [0.45, 4.0], [0.58, 26.0], [0.72, 16.0], [0.84, 12.0], [0.92, 10.0], [1.0, 10.0]
  ],
  Oschersleben: [
    [0.0, 0.0], [0.10, -1.0], [0.25, 2.0], [0.42, 4.0], [0.60, 1.0], [0.75, 5.0], [0.90, 0.0], [1.0, 0.0]
  ],
  Sakhir: [
    [0.0, 0.0], [0.10, 0.0], [0.22, 14.0], [0.34, 6.0], [0.44, 2.0],
    [0.54, -3.0], [0.66, 4.0], [0.78, 12.0], [0.90, 0.0], [1.0, 0.0]
  ],
  SaoPaulo: [
    [0.0, 34.0], [0.08, 20.0], [0.14, 8.0], [0.24, 4.0], [0.34, 0.0],
    [0.46, 16.0], [0.58, 18.0], [0.68, 10.0], [0.78, 14.0], [0.88, 28.0], [0.96, 34.0], [1.0, 34.0]
  ],
  Sepang: [
    [0.0, 0.0], [0.10, -4.0], [0.20, 0.0], [0.30, 8.0], [0.42, 18.0],
    [0.54, 10.0], [0.64, 2.0], [0.74, 12.0], [0.86, 6.0], [0.95, 0.0], [1.0, 0.0]
  ],
  Shanghai: [
    [0.0, 0.0], [0.12, -3.0], [0.24, -2.0], [0.38, 1.0], [0.52, 4.0],
    [0.65, 7.0], [0.80, 3.0], [0.92, 0.0], [1.0, 0.0]
  ],
  Silverstone: [
    [0.0, 4.0], [0.08, 0.0], [0.16, -2.0], [0.26, 4.0], [0.36, 6.0],
    [0.44, 7.0], [0.52, 8.0], [0.62, 9.0], [0.74, 8.0], [0.84, 4.0], [0.92, 3.0], [1.0, 4.0]
  ],
  Sochi: [
    [0.0, 0.0], [0.15, 0.0], [0.28, 2.5], [0.45, 1.0], [0.65, 3.0], [0.85, 1.0], [0.95, 0.0], [1.0, 0.0]
  ],
  Spa: [
    [0.0, 0.0], [0.04, -2.0], [0.10, -8.0], [0.15, 35.0], [0.22, 75.0],
    [0.28, 96.0], [0.36, 70.0], [0.45, 50.0], [0.53, 25.0], [0.62, 12.0],
    [0.72, 0.0], [0.82, 8.0], [0.92, 3.0], [1.0, 0.0]
  ],
  Spielberg: [
    [0.0, 0.0], [0.08, 18.0], [0.18, 46.0], [0.26, 65.0], [0.36, 36.0],
    [0.48, 18.0], [0.62, 8.0], [0.76, -2.0], [0.90, 0.0], [1.0, 0.0]
  ],
  Suzuka: [
    [0.0, 8.0], [0.08, 4.0], [0.16, 16.0], [0.24, 26.0], [0.32, 14.0],
    [0.438, 0.0], [0.52, 12.0], [0.64, 24.0], [0.74, 16.0], [0.848, 11.0],
    [0.90, 8.0], [0.94, 9.0], [1.0, 8.0]
  ],
  YasMarina: [
    [0.0, 0.0], [0.12, 0.0], [0.24, 1.5], [0.42, 4.0], [0.55, 2.0],
    [0.68, 1.0], [0.82, 3.5], [0.94, 0.0], [1.0, 0.0]
  ],
  Zandvoort: [
    [0.0, 0.0], [0.08, 0.0], [0.16, -1.0], [0.24, 5.0], [0.38, 8.0],
    [0.50, -1.0], [0.62, 2.0], [0.74, 6.0], [0.88, 2.0], [1.0, 0.0]
  ]
};

// Smooth cubic Hermite interpolation between elevation keyframes
function getTrackElevation(key, u) {
  const keyframes = TRACK_ELEVATION_KEYFRAMES[key];
  if (!keyframes) return 0;
  u = ((u % 1) + 1) % 1;
  let i = 0;
  while (i < keyframes.length - 1 && keyframes[i + 1][0] <= u) i++;
  if (i >= keyframes.length - 1) return keyframes[keyframes.length - 1][1];
  const p0 = keyframes[i];
  const p1 = keyframes[i + 1];
  const t = (u - p0[0]) / (p1[0] - p0[0]);
  const s = t * t * (3 - 2 * t);
  return p0[1] * (1 - s) + p1[1] * s;
}

const tracksDir = path.join('raceTracks', 'racetrack-database', 'tracks');
const files = Object.keys(TRACK_METADATA);

const newTrackBlocks = [];

for (const key of files) {
  const meta = TRACK_METADATA[key];
  const csvFile = path.join(tracksDir, key + '.csv');
  const content = fs.readFileSync(csvFile, 'utf8');
  const lines = content.trim().split(/\r?\n/).filter(l => l && !l.startsWith('#'));
  const pts = lines.map(l => l.split(',').map(Number));
  const N = pts.length;

  // Bounding box for exact center alignment
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  // Cumulative distance along the raw track trajectory
  const cumDist = [0];
  for (let i = 1; i < N; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    cumDist.push(cumDist[i - 1] + Math.hypot(dx, dy));
  }
  const lastDx = pts[0][0] - pts[N - 1][0];
  const lastDy = pts[0][1] - pts[N - 1][1];
  const totalRawLength = cumDist[N - 1] + Math.hypot(lastDx, lastDy);

  // Compute turning angles across raw points to detect curves vs straights
  const angles = [];
  for (let i = 0; i < N; i++) {
    const pPrev = pts[(i - 2 + N) % N];
    const pCurr = pts[i];
    const pNext = pts[(i + 2) % N];
    const v1 = [pCurr[0] - pPrev[0], pCurr[1] - pPrev[1]];
    const v2 = [pNext[0] - pCurr[0], pNext[1] - pCurr[1]];
    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    const m1 = Math.hypot(v1[0], v1[1]);
    const m2 = Math.hypot(v2[0], v2[1]);
    angles.push(Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))));
  }

  // Adaptive sampling: high density on curves, optimal spacing on straights
  const sampledIndices = [];
  let currIdx = 0;
  while (currIdx < N) {
    sampledIndices.push(currIdx);
    // Find local peak curvature in neighborhood
    let maxAng = 0;
    for (let k = -2; k <= 2; k++) {
      const ang = angles[(currIdx + k + N) % N];
      if (ang > maxAng) maxAng = ang;
    }
    let step = 8; // default straight ~40m
    if (maxAng > 0.08) step = 2; // tight corner / hairpin ~10m
    else if (maxAng > 0.04) step = 3; // medium corner ~15m
    else if (maxAng > 0.02) step = 5; // gentle sweep ~25m
    currIdx += step;
  }

  // Construct 3D points: exact X, Z from CSV database, realistic Y from real-world elevation
  const points3D = [];
  for (const idx of sampledIndices) {
    const p = pts[idx];
    const uTrack = cumDist[idx] / totalRawLength;
    let y = getTrackElevation(key, uTrack);

    // Suzuka Figure-8 Overpass bridge safeguard
    if (key === 'Suzuka' && idx >= 940 && idx <= 1020) {
      const uBridge = (idx - 940) / (1020 - 940);
      const bridgeBoost = Math.sin(uBridge * Math.PI) * 2.5;
      y = Math.max(y, 9.8 + bridgeBoost);
    }

    points3D.push([
      Math.round((p[0] - midX) * 10) / 10,
      Math.round(y * 10) / 10,
      Math.round(-(p[1] - midY) * 10) / 10
    ]);
  }

  // Build 3D Catmull-Rom spline
  const vPoints = points3D.map(p => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(vPoints, true, 'catmullrom', 0.28);
  const totalLength = curve.getLength();

  // Curvature sampling for corners and DRS zones
  const sampleCount = 400;
  const curv = [];
  for (let i = 0; i < sampleCount; i++) {
    const u = i / sampleCount;
    const tPrev = curve.getTangentAt((u - 0.008 + 1) % 1);
    const tNext = curve.getTangentAt((u + 0.008) % 1);
    const angle = tPrev.angleTo(tNext);
    curv.push({ u, angle });
  }

  // Detect Curvature peaks (Corners)
  const corners = [{ u: 0.0, num: 'START', name: 'Rettifilo Principale (Traguardo)' }];
  let cornerCount = 1;
  for (let i = 1; i < sampleCount - 1; i++) {
    if (curv[i].angle > 0.075 && curv[i].angle > curv[i - 1].angle && curv[i].angle > curv[i + 1].angle) {
      const uVal = Math.round(curv[i].u * 100) / 100;
      if (uVal > 0.04 && uVal < 0.96) {
        if (Math.abs(uVal - corners[corners.length - 1].u) > 0.04) {
          const cNum = String(cornerCount).padStart(2, '0');
          corners.push({ u: uVal, num: cNum, name: `T${cornerCount} Curva ${cNum}` });
          cornerCount++;
        }
      }
    }
  }

  // Detect long straights for DRS zones (angle < 0.038 for > 280m)
  const drsZones = [];
  let sStart = null;
  for (let i = 0; i < sampleCount; i++) {
    if (curv[i].angle < 0.038) {
      if (sStart === null) sStart = curv[i].u;
    } else {
      if (sStart !== null) {
        const span = (curv[i].u - sStart) * totalLength;
        if (span > 280) {
          const startU = Math.round(sStart * 100) / 100;
          const endU = Math.round(curv[i].u * 100) / 100;
          const detU = Math.round(((startU - 0.04 + 1) % 1) * 100) / 100;
          drsZones.push({
            startU,
            endU,
            detectionU: detU,
            name: `DRS Zone ${drsZones.length + 1}`
          });
        }
        sStart = null;
      }
    }
  }
  // Default main straight DRS if none found
  if (drsZones.length === 0) {
    drsZones.push({ startU: 0.95, endU: 0.08, detectionU: 0.91, name: 'DRS Zone 1 (Rettifilo Principale)' });
  }

  // Speed trap near end of longest straight
  let speedTrapU = 0.1;
  if (drsZones.length > 0) {
    speedTrapU = Math.round((drsZones[0].endU - 0.02) * 100) / 100;
  }

  // Sector splits
  const sectorSplits = [0.30, 0.68];

  const jsonPoints = points3D.map(p => '      [' + p.join(', ') + ']').join(',\n');
  const jsonDrs = JSON.stringify(drsZones, null, 6).replace(/\n/g, '\n    ');
  const jsonCorners = JSON.stringify(corners, null, 6).replace(/\n/g, '\n    ');

  const block = `  {
    id: ${JSON.stringify(meta.id)},
    name: ${JSON.stringify(meta.name)},
    fullName: ${JSON.stringify(meta.fullName)},
    subtitle: ${JSON.stringify(meta.subtitle)},
    country: ${JSON.stringify(meta.country)},
    timeOfDay: ${JSON.stringify(meta.timeOfDay)},
    prizeFirst: ${meta.prizeFirst},
    roadWidth: ${meta.roadWidth.toFixed(1)},
    lengthKm: ${JSON.stringify(meta.lengthKm)},
    elevationInfo: ${JSON.stringify(meta.elevationInfo)},
    themeColor: ${JSON.stringify(meta.themeColor)},
    skyTop: ${JSON.stringify(meta.skyTop)},
    skyBottom: ${JSON.stringify(meta.skyBottom)},
    fogColor: ${meta.fogColor},
    asphaltColor: ${JSON.stringify(meta.asphaltColor)},
    curbColorA: ${JSON.stringify(meta.curbColorA)},
    curbColorB: ${JSON.stringify(meta.curbColorB)},
    groundColor: ${meta.groundColor},
    sceneryType: ${JSON.stringify(meta.sceneryType)},
    sectorSplits: [${sectorSplits.join(', ')}],
    speedTrapU: ${speedTrapU},
    drsZones: ${jsonDrs},
    corners: ${jsonCorners},
    points: [
${jsonPoints}
    ],
    description: ${JSON.stringify(meta.description)}
  },`;
  newTrackBlocks.push(block);
  console.log(`Generated: ${meta.name} (${points3D.length} adaptive pts, ${Math.round(totalLength)}m, ${corners.length} corners, ${drsZones.length} DRS zones)`);
}

// Read current data.js to extract header and Monza
const currentData = fs.readFileSync('js/data.js', 'utf8');
const catIdx = currentData.indexOf('const TRACK_CATALOG = [');
const beforeCatalog = currentData.slice(0, catIdx);

const monzaMatch = currentData.match(/\{\s*id:\s*\"monza\"[\s\S]*?description:[\s\S]*?\},/);
if (!monzaMatch) {
  console.error('Could not find Monza in data.js!');
  process.exit(1);
}
const monzaBlock = monzaMatch[0];

const updatedCatalog = `// =========================================================================
// CATALOGO GRAND PRIX F1 (25 CIRCUITI UFFICIALI FIA & RACETRACK-DATABASE)
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

fs.writeFileSync('js/data.js', beforeCatalog + updatedCatalog, 'utf8');
console.log(`\nSuccessfully written js/data.js with 25 World Championship tracks!`);
