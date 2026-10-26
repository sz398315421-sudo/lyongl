import * as THREE from 'three';
import { GLTFLoader } from './vendor/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from './vendor/addons/loaders/DRACOLoader.js';

// Original ProjectMenu geometry, material, instance spacing and scene proportions.
export async function loadReferenceGallery(renderer) {
  const base=new URL('./assets/unseen-reference/',import.meta.url).href;
  const draco=new DRACOLoader().setDecoderPath(new URL('./vendor/addons/libs/draco/gltf/',import.meta.url).href).setWorkerLimit(1);
  const loader=new GLTFLoader().setDRACOLoader(draco);
  try {
    const [arch,floor,matcap]=await Promise.all([loader.loadAsync(base+'arch-dc.glb'),loader.loadAsync(base+'floor-dc.glb'),new THREE.TextureLoader().loadAsync(base+'project-model-matcap.png')]);
    matcap.colorSpace=THREE.SRGBColorSpace;
    const group=new THREE.Group(),arches=new THREE.Group(),floors=new THREE.Group();
    const material=new THREE.MeshMatcapMaterial({matcap,color:'#dcdbde'});
    for(let i=0;i<5;i++){
      const mesh=new THREE.Mesh(arch.scene.children[0].geometry,material);
      mesh.scale.setScalar(300);mesh.rotation.y=Math.PI/2;mesh.position.set(0,300,200-600*i);arches.add(mesh);
    }
    const floorGeometry=floor.scene.children[0].geometry;floorGeometry.rotateY(-Math.PI/2);floorGeometry.computeBoundingBox();
    const length=(floorGeometry.boundingBox.max.z-floorGeometry.boundingBox.min.z)*600-70;
    for(let i=0;i<3;i++){
      const mesh=new THREE.Mesh(floorGeometry,material);mesh.scale.setScalar(300);mesh.rotation.y=Math.PI*(i%2);mesh.position.set(0,-300,length*.3-length*.5*i);floors.add(mesh);
    }
    group.add(arches,floors);
    return {group,resize(width){const s=width/2150;arches.scale.set(s,s*(width<700?1:1.75),1);floors.scale.copy(arches.scale);},scroll(y){arches.position.z=y%600;floors.position.z=y%(length*.5);}};
  } finally {draco.dispose();}
}
