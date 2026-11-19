// length sets the displayed envelope in metres. Drive modes are simulation presets in m/s.
export const defaultModel = {id:'ER-6', name:'六轮全地形探测车', url:'', length:4.4, heading:0};
export const models = [
  {kind:'perseverance', id:'毅力号', name:'NASA 火星探测车', url:'./models/NASA-Perseverance.glb',
    length:3, layout:'六轮驱动 · 四角转向', modes:[['勘测',0.24],['巡航',0.8]], pointTurn:true},
  {kind:'ferrari', id:'458', name:'Ferrari 458 Italia', url:'./models/Ferrari-458-Italia.glb',
    length:4.53, layout:'四轮 · 前轮转向', modes:[['慢行',1.5],['运动',4]], pointTurn:false}
];
export function identifyModel(scene) {
  if (scene.getObjectByName('Wheels_objs') && scene.getObjectByName('turret_obj')) return models[0];
  if (['wheel_fl','wheel_fr','wheel_rl','wheel_rr','steering_wheel'].every(name=>scene.getObjectByName(name))) return models[1];
}
