// Matches the exit branch authored by World.ramp: two 3.7 m lanes,
// a quadratic bend followed by its tangent. Follow the inner branch lane.
export const rampExitDurationMs=6000;
export const canExitRamp=world=>world.state?.id==='06'&&world.car.position.z>=-8&&world.car.position.z<=20&&Math.abs(world.car.position.x)<=5.55;
const smooth=t=>{const q=Math.max(0,Math.min(1,t));return q*q*q*(q*(q*6-15)+10);};
export function exitRampLaneX(z){
 const u=Math.max(0,-z-8),q=Math.min(u,60),slope=.018*q;
 return 1.85+.009*q*q+Math.max(0,u-60)*1.08-1.85*Math.sqrt(1+slope*slope);
}
export function sampleRampExit(plan,distance){
 const d=Math.max(0,distance),xAt=s=>plan.startX+(exitRampLaneX(plan.startZ-s)-plan.startX)*smooth(s/36);
 const x=xAt(d),epsilon=.01,from=Math.max(0,d-epsilon),slope=(xAt(d+epsilon)-xAt(from))/(d+epsilon-from);
 return {x,z:plan.startZ-d,yaw:-Math.atan(slope)};
}
