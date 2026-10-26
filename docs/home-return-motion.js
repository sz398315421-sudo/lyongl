// The camera uses small world units, while viewport height is measured in pixels.
// Keep the camera above the water on tall screens and use one continuous return.
export function homeImmersionProfile({viewportHeight,clearance=Infinity,returning=false}) {
  const requested=Math.max(0,viewportHeight)*.000025;
  const offset=-Math.min(requested,Math.max(0,clearance)*.8);
  return {offset,duration:returning?2.4:3,ease:returning?'power2.inOut':'power4.inOut'};
}

export function immersionEase(progress,returning) {
  const p=Math.max(0,Math.min(1,progress));
  return returning?(p<.5?4*p**3:1-(-2*p+2)**3/2):(p<.5?16*p**5:1-(-2*p+2)**5/2);
}
