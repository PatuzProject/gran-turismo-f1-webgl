const fs = require('fs');
const THREE = require('./three-lib.js');
global.THREE = THREE;

global.ProceduralAssets = {
  createAsphaltTexture: () => ({ repeat: { set: () => {} } })
};
global.GraphicsEngine = {
  proceduralTextures: {},
  setupPlanarReflection: () => {},
  bindReflectiveRoad: () => {},
  configureAtmosphericFog: () => {},
  applyHeightFog: () => {},
  buildAtmosphericSkyAndIBL: () => {}
};

const vm = require('vm');
const context = vm.createContext({
  THREE,
  ProceduralAssets: global.ProceduralAssets,
  GraphicsEngine: global.GraphicsEngine,
  console,
  Math,
  Float32Array
});
const TRACK_CATALOG = vm.runInContext(fs.readFileSync('./js/data.js', 'utf8') + '\n;TRACK_CATALOG;', context);
const TrackBuilder = vm.runInContext(fs.readFileSync('./js/trackBuilder.js', 'utf8') + '\n;TrackBuilder;', context);

const trackIds = ["austin","brands_hatch","budapest","catalunya","hockenheim","ims","melbourne","mexico_city","montreal","moscow_raceway","norisring","nuerburgring","oschersleben","sakhir","sao_paulo","sepang","shanghai","silverstone","sochi","spa","spielberg","suzuka","yas_marina","zandvoort","monza"];
const refPhysics = {
  maxSpeed: 95,
  gripLateral: 2.8,
  brakeForce: 15000,
  mass: 798
};

let totalIssues = 0;

for (const trackId of trackIds) {
  const trackConfig = TRACK_CATALOG.find(t => t.id === trackId);
  if (!trackConfig) {
    console.error(`Track ${trackId} not found`);
    continue;
  }

  const scene = new THREE.Scene();
  const result = TrackBuilder.buildTrackEnvironment(scene, trackConfig, refPhysics);
  const samples = result.samples;
  const N = samples.length;
  const halfWidth = result.halfWidth;
  const roadWidth = trackConfig.roadWidth;

  console.log(`\n========================================`);
  console.log(`Testing Track: ${trackConfig.name} (${trackId})`);
  console.log(`Samples: ${N}, RoadWidth: ${roadWidth}m (halfWidth: ${halfWidth}m), TotalLength: ${Math.round(result.totalLength)}m`);

  // 1. Road-to-Road self-overlap check
  let roadOverlaps = 0;
  for (let i = 0; i < N; i++) {
    for (let j = i + 35; j < N - 35; j++) {
      const p1 = samples[i].point;
      const p2 = samples[j].point;
      const dx = p1.x - p2.x;
      const dz = p1.z - p2.z;
      const dist2D = Math.sqrt(dx * dx + dz * dz);
      const dy = Math.abs(p1.y - p2.y);
      // Underpass/Overpass bridge allowed if dy >= 6.0m
      if (dist2D < roadWidth - 1.0 && dy < 6.0) {
        roadOverlaps++;
        if (roadOverlaps <= 3) {
          console.warn(`  [ROAD OVERLAP] Sample ${i} & ${j}: 2D dist=${dist2D.toFixed(1)}m, dy=${dy.toFixed(1)}m`);
        }
      }
    }
  }

  // 2. Scan all decoration objects in trackGroup for collisions inside road lanes
  let collidingObjects = 0;

  function checkPointInsideRoad(pos, objDesc) {
    for (let j = 0; j < N; j++) {
      const s = samples[j];
      const dx = pos.x - s.point.x;
      const dz = pos.z - s.point.z;
      if (dx * dx + dz * dz > (halfWidth + 2) * (halfWidth + 2)) continue;
      const dy = Math.abs(pos.y - s.point.y);
      if (dy > 3.5) continue;
      const relX = pos.x - s.point.x;
      const relY = pos.y - s.point.y;
      const relZ = pos.z - s.point.z;
      const along = Math.abs(relX * s.tangent.x + relY * s.tangent.y + relZ * s.tangent.z);
      if (along <= 1.25) {
        const lat = Math.abs(relX * s.right.x + relY * s.right.y + relZ * s.right.z);
        if (lat < halfWidth - 0.2) {
          collidingObjects++;
          console.warn(`  [OBJECT IN ROAD] ${objDesc} at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}) inside lane at sample ${j} (lateral=${lat.toFixed(1)}m, halfWidth=${halfWidth})`);
          return true;
        }
      }
    }
    return false;
  }

  function inspectMesh(obj, prefix = '') {
    // Skip road, verge, wall, racing line, turbo pads (these are intentionally on road)
    if (obj.userData && (obj.userData.isReflectiveRoad || obj.userData.padMeshes)) return;

    // Skip legitimate track features:
    // 1. Curbs: BoxGeometry 1.2 x 0.18 x 1.85
    if (obj.geometry && obj.geometry.type === 'BoxGeometry') {
      const p = obj.geometry.parameters;
      if (p && Math.abs(p.width - 1.2) < 0.1 && Math.abs(p.height - 0.18) < 0.05) return; // Kerb
      if (p && Math.abs(p.width - 0.35) < 0.05 && Math.abs(p.height - 0.35) < 0.05) return; // Light pod
    }
    // 2. Starting grid slots: PlaneGeometry 2.6 x 4.8
    if (obj.geometry && obj.geometry.type === 'PlaneGeometry') {
      return; // Ground plane or grid slots
    }
    // 3. Overhead Neon Torus Arches: TorusGeometry
    if (obj.geometry && obj.geometry.type === 'TorusGeometry') {
      return; // Overhead arch
    }
    // 4. Start Gantry top beam structure at y > 6.0m
    if (obj.position && obj.position.y > 6.0) {
      return;
    }

    if (obj.isInstancedMesh) {
      const dummy = new THREE.Object3D();
      for (let i = 0; i < obj.count; i++) {
        const mat = new THREE.Matrix4();
        obj.getMatrixAt(i, mat);
        dummy.applyMatrix4(mat);
        const wPos = new THREE.Vector3();
        wPos.setFromMatrixPosition(mat);
        checkPointInsideRoad(wPos, `${prefix} InstancedMesh[${i}]`);
      }
    } else if (obj.isMesh) {
      const wPos = new THREE.Vector3();
      obj.getWorldPosition(wPos);
      if (obj.geometry && obj.geometry.type === 'BufferGeometry') {
        return; // Road verges, walls, curbs, etc.
      }
      checkPointInsideRoad(wPos, `${prefix} Mesh`);
    }

    if (obj.children) {
      for (const child of obj.children) {
        inspectMesh(child, `${prefix} > ${child.type}`);
      }
    }
  }

  scene.updateMatrixWorld(true);
  inspectMesh(result.trackGroup, trackId);

  console.log(`Results for ${trackId}:`);
  console.log(`  Road-Road overlaps: ${roadOverlaps}`);
  console.log(`  Objects inside road: ${collidingObjects}`);

  totalIssues += roadOverlaps + collidingObjects;
}

console.log(`\n========================================`);
console.log(`TOTAL DETECTED ISSUES ACROSS ALL 25 TRACKS: ${totalIssues}`);
process.exit(totalIssues > 0 ? 1 : 0);

