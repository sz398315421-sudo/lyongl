// Reference palette: warm plaster, pale sand, powder-blue sky and silver water.
// Only material colors change; the original fluid, reflection and camera remain.
window.courtyardPalette = Object.freeze({
  name: 'plaster-sand-mist',
  wall: '#e8e5e1', wallShadow: '#b9bcc3', water: '#bdc7d5',
  sky: '#b1cef2', skyCloud: '#f4f8fb', rock: '#b9b9c0',
  grass: '#bab7bb', coral: '#cbbeb8', apricot: '#ddd0c2', mist: '#d4d6dd',
  textSilver: ['#fafafa', '#cccccc', '#969696', '#ebebeb'],
});

window.applyCourtyardPalette = ({ HomeContact: home }) => {
  const palette = window.courtyardPalette;
  const color = value => home.homeRoom.material.color.clone().set(value);

  function tintBaked(mesh, light, shadow, exposure = 1.1) {
    const material = mesh.material;
    material.onBeforeCompile = shader => {
      shader.uniforms.uPaletteLight = { value: color(light) };
      shader.uniforms.uPaletteShadow = { value: color(shadow) };
      shader.uniforms.uPaletteExposure = { value: exposure };
      shader.fragmentShader = `uniform vec3 uPaletteLight, uPaletteShadow;
        uniform float uPaletteExposure;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #include <map_fragment>
        float bakedLight = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
        float illumination = min(.99, pow(max(bakedLight, 0.), .82) * uPaletteExposure);
        vec3 albedo = mix(uPaletteShadow, uPaletteLight, smoothstep(.18, .78, illumination));
        diffuseColor.rgb = albedo * illumination;
      `);
    };
    material.customProgramCacheKey = () => `sand-baked-${light}-${shadow}`;
    material.needsUpdate = true;
  }

  for (const room of [home.homeRoom, home.contactRoom]) {
    tintBaked(room, palette.wall, palette.wallShadow, 1.18);
  }
  tintBaked(home.rocks, '#d4d1d0', palette.rock, 1.08);
  tintBaked(home.chair, '#426885', '#304964');
  tintBaked(home.pillows, '#e3dcd3', '#c3b8ae');
  home.water.material.uniforms.uColor.value.set(palette.water);

  // Re-map the original sky photograph, retaining clouds and texture.
  home.world.material.onBeforeCompile = shader => {
    shader.uniforms.uSkyBlue = { value: color(palette.sky) };
    shader.uniforms.uSkyCloud = { value: color(palette.skyCloud) };
    shader.fragmentShader = `uniform vec3 uSkyBlue, uSkyCloud;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      float skyLight = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
      diffuseColor.rgb = mix(uSkyBlue, uSkyCloud, smoothstep(.24, .94, skyLight));
    `);
  };
  home.world.material.customProgramCacheKey = () => 'sand-sky-v1';
  home.world.material.needsUpdate = true;

  home.grassSharedUniforms.u_baseColor.value.set(palette.grass);
  home.grassSharedUniforms.fogColor.value.set(palette.mist);
  const grass = home.grass.material;
  grass.uniforms.u_color1.value.set(palette.grass);
  grass.uniforms.u_color2.value.set(palette.coral);
  grass.uniforms.uApricot = { value: color(palette.apricot) };
  grass.fragmentShader = grass.fragmentShader.replace('void main()', 'uniform vec3 uApricot;\nvoid main()').replace(
    'vec3 color = mix(u_color1, u_color2, noise);',
    `float island = texture2D(u_noise, vWorldPosition.xz * 12. + vec2(.27, .53)).r;
    vec3 color = mix(u_color1, u_color2, smoothstep(.43, .64, island));
    color = mix(color, uApricot, smoothstep(.68, .81, island));
    color *= mix(.88, 1.04, noise);`
  );
  grass.needsUpdate = true;
  home.ball.material.color.set('#e3e5eb');
  home.ball.material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <output_fragment>', `
      float silverLight = dot(outgoingLight, vec3(.2126, .7152, .0722));
      outgoingLight = mix(vec3(silverLight), outgoingLight, .16);
      #include <output_fragment>
    `);
  };
  home.ball.material.customProgramCacheKey = () => 'sand-pearl-v1';
  home.ball.material.needsUpdate = true;
  palette.textSilver.forEach((value, index) => {
    home.homeTextMesh.material.uniforms[`uTextColor${index + 1}`].value.set(value);
  });
  document.documentElement.dataset.palette = palette.name;
};
