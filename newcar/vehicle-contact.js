// All lengths are in simulation metres. GLB wheel hubs and the underside grid
// are measured in the normalized, +X-forward display frame before attachment.
const cell = 0.16;
const clamp = (value,low,high) => Math.max(low,Math.min(high,value));

function measureUnderside(T, wrapper, dimensions) {
  const nx=Math.ceil(dimensions.x/cell), nz=Math.ceil(dimensions.z/cell);
  const bottom=new Float32Array(nx*nz).fill(Infinity);
  const halfX=dimensions.x/2, halfZ=dimensions.z/2;
  const ix=x=>clamp(Math.floor((x+halfX)/cell),0,nx-1);
  const iz=z=>clamp(Math.floor((z+halfZ)/cell),0,nz-1);
  wrapper.traverse(mesh=>{
    const pos=mesh.geometry?.attributes.position;
    if (!pos || !mesh.isMesh) return;
    // Transform the shared vertices once; adjacent triangles usually reuse them.
    const xyz=new Float32Array(3*pos.count), p=new T.Vector3();
    for(let i=0;i<pos.count;i++) p.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld).toArray(xyz,i*3);
    const index=mesh.geometry.index?.array;
    for(let i=0,n=index?.length??pos.count;i+2<n;i+=3) {
      const a=3*(index?index[i]:i), b=3*(index?index[i+1]:i+1), c=3*(index?index[i+2]:i+2);
      const y=Math.min(xyz[a+1],xyz[b+1],xyz[c+1]);
      const x0=ix(Math.min(xyz[a],xyz[b],xyz[c])), x1=ix(Math.max(xyz[a],xyz[b],xyz[c]));
      const z0=iz(Math.min(xyz[a+2],xyz[b+2],xyz[c+2])), z1=iz(Math.max(xyz[a+2],xyz[b+2],xyz[c+2]));
      for(let x=x0;x<=x1;x++) for(let z=z0;z<=z1;z++) {
        const j=x*nz+z;
        if(y<bottom[j])bottom[j]=y;
      }
    }
  });
  const grid=[];
  for(let x=0;x<nx;x++)for(let z=0;z<nz;z++){
    const y=bottom[x*nz+z];
    if(Number.isFinite(y)) grid.push({x:(x+.5)*cell-halfX,y,z:(z+.5)*cell-halfZ});
  }
  return grid;
}

function envelopeDistance(rock, x, z, heading, halfX, halfZ) {
  const dx=rock.x-x, dz=rock.z-z, c=Math.cos(heading), s=Math.sin(heading);
  const a=Math.abs(c*dx+s*dz)-halfX, b=Math.abs(-s*dx+c*dz)-halfZ;
  return Math.hypot(Math.max(a,0),Math.max(b,0))+Math.min(0,Math.max(a,b))-rock.width;
}

export function createVehicleContact(T,wrapper,config,dimensions) {
  if (!['perseverance','ferrari'].includes(config.kind)) return null;
  wrapper.updateMatrixWorld(true);
  const wheels=[];
  wrapper.traverse(node=>{
    if(!/^WheelHub_\d$/.test(node.name))return;
    const hub=node.getWorldPosition(new T.Vector3());
    const bounds=new T.Box3().setFromObject(node,true), size=bounds.getSize(new T.Vector3());
    wheels.push({x:hub.x,z:hub.z,y:hub.y,r:size.y/2,halfWidth:size.z/2});
  });
  if (wheels.length<4) return null;
  const minX=Math.min(...wheels.map(w=>w.x)), maxX=Math.max(...wheels.map(w=>w.x));
  const left=wheels.filter(w=>w.z<0), right=wheels.filter(w=>w.z>=0);
  const mean=(list,fn)=>list.reduce((sum,item)=>sum+fn(item),0)/list.length;
  const wheelbase=maxX-minX, track=mean(right,w=>w.z)-mean(left,w=>w.z);
  const radius=mean(wheels,w=>w.r);
  const body=wrapper.getObjectByName(config.kind==='ferrari'?'body':'Body');
  const clearance=body?Math.max(0,new T.Box3().setFromObject(body,true).min.y):0;
  const stepHeight=radius*(config.kind==='ferrari'?.44:.90);
  const halfX=dimensions.x/2, halfZ=dimensions.z/2;
  const reach=Math.hypot(halfX,halfZ), grid=measureUnderside(T,wrapper,dimensions);
  const nearby=[], raw=[];
  let centerX=Infinity,centerZ=Infinity,profile=null;
  let prevX=0,prevZ=0,prevHeading=0,prevOdo=0;
  let lastX=Infinity,lastZ=Infinity,lastHeading=Infinity,lastProfile=null, elevation=0;

  function getRocks(app) {
    const {drive,field}=app;
    if(profile===field.p && Math.hypot(drive.P.x-centerX,drive.P.z-centerZ)<.65)return;
    centerX=drive.P.x;centerZ=drive.P.z;profile=field.p;
    field.rocksIn(centerX,centerZ,reach+profile.rock[2]*1.2+1,raw);
    nearby.length=0;
    for(const rock of raw) {
      // The rendered icosphere vertices have at most 15.5% radial
      // perturbation, plus 4.5% outline. The mesh is buried 25% vertically.
      const axis=rock.r*rock.hr;
      nearby.push({x:rock.x,z:rock.z,width:rock.r*.98*1.20,
        centerY:rock.base-axis*.25,vertical:axis*1.20,height:axis*.95});
    }
  }
  function surface(field,x,z,margin=0) {
    let y=field.base(x,z);
    for(const rock of nearby){
      const dx=x-rock.x,dz=z-rock.z,range=rock.width+margin;
      if(Math.abs(dx)>range||Math.abs(dz)>range)continue;
      const distance=Math.max(0,Math.hypot(dx,dz)-margin)/rock.width;
      if(distance<1)y=Math.max(y,rock.centerY+rock.vertical*Math.sqrt(1-distance*distance));
    }
    return y;
  }
  function beforeDrive(drive){
    prevX=drive.P.x;prevZ=drive.P.z;prevHeading=drive.heading;prevOdo=drive.odometer;
  }
  function afterDrive(app){
    const {drive}=app;
    getRocks(app);
    const dx=drive.P.x-prevX,dz=drive.P.z-prevZ;
    const turn=Math.atan2(Math.sin(drive.heading-prevHeading),Math.cos(drive.heading-prevHeading));
    const span=Math.hypot(dx,dz)+Math.abs(turn)*reach;
    if(span<1e-8){if(!drive.throttle&&!drive.auto&&!drive.spin)contact.blocked=false;return;}
    contact.blocked=false;
    const steps=Math.max(1,Math.ceil(span/.065));
    for(const rock of nearby){
      if(rock.height<=stepHeight)continue;
      let prev=envelopeDistance(rock,prevX,prevZ,prevHeading,halfX,halfZ);
      for(let step=1;step<=steps;step++){
        const f=step/steps;
        const next=envelopeDistance(rock,prevX+dx*f,prevZ+dz*f,prevHeading+turn*f,halfX,halfZ);
        // On a model switch a larger footprint can already overlap a rock.
        // Always allow a retreat, even when its first step remains inside.
        if(next<0 && next<prev-1e-7){
          drive.P.x=prevX;drive.P.z=prevZ;drive.heading=prevHeading;drive.odometer=prevOdo;
          drive.v=drive.vw=drive.omega=0;drive.wheelRate.fill(0);drive.spin=null;
          contact.blocked=true;
          if(drive.auto)app.nav.replan=true;
          return;
        }
        prev=next;
      }
    }
  }
  function pose(app) {
    const {drive,field}=app, body=app.rover.body;
    getRocks(app);
    const x=drive.P.x,z=drive.P.z,h=drive.heading,ch=Math.cos(h),sh=Math.sin(h);
    if(x!==lastX||z!==lastZ||h!==lastHeading||lastProfile!==field.p){
      lastX=x;lastZ=z;lastHeading=h;lastProfile=field.p;
      function ground(lx,lz,margin=0){
        return surface(field,x+ch*lx-sh*lz,z+sh*lx+ch*lz,margin);
      }
      for(const wheel of wheels){
        let support=-Infinity;
        for(const across of [-1,0,1]) for(const along of [-.75,0,.75]){
          const bottom=wheel.y-wheel.r*Math.sqrt(1-along*along);
          support=Math.max(support,ground(wheel.x+along*wheel.r,wheel.z+across*wheel.halfWidth)-bottom);
        }
        wheel.support=support;
      }
      const front=wheels.filter(w=>w.x>maxX-.2),rear=wheels.filter(w=>w.x<minX+.2);
      contact.pitch=Math.atan2(mean(front,w=>w.support)-mean(rear,w=>w.support),wheelbase);
      contact.roll=-Math.atan2(mean(right,w=>w.support)-mean(left,w=>w.support),track);
      const cp=Math.cos(contact.pitch),sp=Math.sin(contact.pitch),cr=Math.cos(contact.roll),sr=Math.sin(contact.roll);
      elevation=-Infinity;
      // Enforce a non-penetrating lower surface *after* tilting. A tiny rock
      // between the tires is tested against the chassis cell it actually hits.
      const margin=cell*Math.SQRT1_2, tiltMargin=margin*(Math.abs(sr)+Math.abs(sp));
      for(const p of grid){
        const py=p.x*sp+p.y*cp;
        const lx=p.x*cp-p.y*sp,lz=py*sr+p.z*cr,ly=py*cr-p.z*sr;
        elevation=Math.max(elevation,ground(lx,lz,margin)-ly);
      }
      elevation+=tiltMargin+.004;
    }
    body.position.y=elevation;
    body.rotation.set(contact.roll,0,contact.pitch);
  }
  const contact={wheelbase,track,radius,clearance,pitch:0,roll:0,blocked:false,beforeDrive,afterDrive,pose};
  return contact;
}
