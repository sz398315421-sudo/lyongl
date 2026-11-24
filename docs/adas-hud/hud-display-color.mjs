export function setHudDisplayColor(target, hex) {
  const rgb = Number.parseInt(hex.slice(1), 16);
  target.set((rgb >> 16 & 255) / 255, (rgb >> 8 & 255) / 255, (rgb & 255) / 255);
}

export function createHudDisplayUniforms(world) {
  return {
    hudTransparent: world.hudTransparency,
    hudDisplayExposure: {value: world.renderer.toneMappingExposure}
  };
}

export const hudDisplayColorShader = `
  uniform bool hudTransparent;
  uniform float hudDisplayExposure;

  vec3 hudSrgbToLinear(vec3 color) {
    return mix(color / 12.92, pow((color + .055) / 1.055, vec3(2.4)), step(vec3(.04045), color));
  }

  // Encode authored display RGB into the input of Three.js's ACES OutputPass.
  vec3 hudColorToScene(vec3 color) {
    const mat3 inputMatrix = mat3(.59719,.076,.0284, .35458,.90834,.13383, .04823,.01566,.83777);
    const mat3 outputMatrix = mat3(1.60475,-.10208,-.00327, -.53108,1.10813,-.07276, -.07367,-.00605,1.07602);
    vec3 mapped = clamp(inverse(outputMatrix) * hudSrgbToLinear(color), 0., 1.);
    vec3 a = 1. - .983729 * mapped;
    vec3 b = .0245786 - .432951 * mapped;
    vec3 c = .000090537 + .238081 * mapped;
    vec3 fitted = (sqrt(b * b + 4. * a * c) - b) / (2. * a);
    return inverse(inputMatrix) * fitted * (.6 / hudDisplayExposure);
  }

  vec3 hudDisplayColor(vec3 color, float alpha) {
    // The opaque HUD blends into black. For transparent exports, OutputPass
    // maps the unassociated RGB before restoring the output alpha.
    return hudTransparent ? hudColorToScene(color) : hudColorToScene(color * alpha) / alpha;
  }`;
