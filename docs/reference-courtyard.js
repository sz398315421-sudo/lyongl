import * as THREE from 'three';
import { GLTFLoader } from './vendor/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from './vendor/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from './vendor/addons/loaders/KTX2Loader.js';
import { MeshSurfaceSampler } from './vendor/addons/math/MeshSurfaceSampler.js';

// The reference's publicly served scene assets are kept locally. Only the
// courtyard assets are loaded; no original application or tracking scripts run.
export async function loadReferenceCourtyard(renderer) {
  const base = new URL('./assets/unseen-reference/', import.meta.url).href;
  const draco = new DRACOLoader().setDecoderPath(new URL('./vendor/addons/libs/draco/gltf/', import.meta.url).href).setWorkerLimit(1);
  const gltf = new GLTFLoader().setDRACOLoader(draco);
  const ktx = new KTX2Loader().setTranscoderPath(new URL('./vendor/addons/libs/basis/', import.meta.url).href).setWorkerLimit(1).detectSupport(renderer);
  try {
    const [objects, room, rocks, land, roomMap, rockMap, pearlMap, skyMap] = await Promise.all([
      gltf.loadAsync(base + 'objectsData.glb'), gltf.loadAsync(base + 'room-1.glb'),
      gltf.loadAsync(base + 'rocks.glb'), gltf.loadAsync(base + 'land-group.glb'),
      ktx.loadAsync(base + 'room-1.ktx2'), ktx.loadAsync(base + 'rocks.ktx2'),
      ktx.loadAsync(base + 'pearl-matcap.ktx2'), ktx.loadAsync(base + 'skymap-tile.ktx2'),
    ]);
    const data = Object.fromEntries(objects.scene.children.map(object => [object.name, object]));
    const group = new THREE.Group();
    group.name = 'reference-courtyard';
    group.scale.setScalar(100);
    const solids = [];
    function add(source, name, material) {
      const mesh = source.scene.children[0];
      mesh.material = material;
      mesh.position.copy(data[name].position);
      mesh.quaternion.copy(data[name].quaternion);
      mesh.scale.copy(data[name].scale);
      group.add(mesh); solids.push(mesh);
      return mesh;
    }
    // These maps contain the original baked lighting and surface detail.
    for (const map of [roomMap, rockMap, pearlMap, skyMap]) {
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
    add(room, 'room-1', new THREE.MeshBasicMaterial({ map: roomMap, toneMapped: false, fog: false }));
    add(rocks, 'rock', new THREE.MeshBasicMaterial({ map: rockMap, toneMapped: false, fog: false }));
    const hills = add(land, 'land', new THREE.MeshBasicMaterial({ color: '#c8acc5', toneMapped: false }));
    const sampler = new MeshSurfaceSampler(hills).build();
    const blade = new THREE.PlaneGeometry(.00015, .0007).translate(0, .00035, 0);
    const grass = new THREE.InstancedMesh(blade, new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, toneMapped: false }), matchMedia('(max-width:600px)').matches ? 6000 : 18000);
    const dummy = new THREE.Object3D();
    let seed = 173;
    const random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
    sampler.setRandomGenerator(random);
    const tint = new THREE.Color();
    for (let i = 0; i < grass.count; i++) {
      sampler.sample(dummy.position);
      dummy.rotation.y = random() * Math.PI;
      dummy.scale.setScalar(.5 + random()); dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
      tint.setHSL(.86, .14, .68 + random() * .11);
      grass.setColorAt(i, tint);
    }
    hills.add(grass);
    pearlMap.flipY = true; pearlMap.needsUpdate = true;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(.01, 64, 40), new THREE.MeshMatcapMaterial({ matcap: pearlMap, toneMapped: false }));
    orb.position.copy(data.sphere.position); orb.position.y += .01;
    group.add(orb); solids.push(orb);
    skyMap.flipY = true; skyMap.wrapS = skyMap.wrapT = THREE.RepeatWrapping;
    skyMap.repeat.set(6, 6); skyMap.offset.set(0, 1.254); skyMap.needsUpdate = true;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), new THREE.MeshBasicMaterial({ map: skyMap, side: THREE.BackSide, toneMapped: false, fog: false, depthWrite: false }));
    group.add(sky);
    const camera = data.cam.children.at(-1).position.clone().multiplyScalar(100);
    const target = data.tgt.children.at(-1).position.clone().multiplyScalar(100);
    return { group, solids, orb, camera, target, waterY: data.wate.position.y * 100 };
  } finally { draco.dispose(); ktx.dispose(); }
}
