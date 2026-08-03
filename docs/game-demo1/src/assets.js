(function (root) {
  'use strict';

  const prefix = 'assets/game/';
  const images = {
    'ground.rust': `${prefix}planets/rust_ground.png`,
    'ground.spore': `${prefix}planets/spore_ground.png`,
    'character.gunner_mia': `${prefix}characters/gunner_mia/gunner_mia_4dir.png`,
    'enemy.swarm': `${prefix}enemies/rust/scrap_mite/scrap_mite_4dir.png`,
    'enemy.shooter': `${prefix}enemies/rust/plasma_watcher/plasma_watcher_4dir.png`,
    'enemy.charger': `${prefix}enemies/rust/rivethorn_ram/rivethorn_ram_4dir.png`,
    'enemy.bloater': `${prefix}enemies/rust/pressure_bloater/pressure_bloater_4dir.png`,
    'object.rust_nest': `${prefix}objects/rust/rust_nest/rust_nest.png`,
    'object.company_beacon': `${prefix}objects/rust/company_beacon/company_beacon.png`,
    'object.mining_drill': `${prefix}objects/rust/mining_drill/mining_drill.png`,
    'object.reward_cache': `${prefix}objects/rust/reward_cache/reward_cache.png`,
    'object.extraction_terminal': `${prefix}objects/rust/extraction_terminal/extraction_terminal.png`,
    'object.extraction_field': `${prefix}objects/rust/extraction_field/extraction_field.png`,
    'pickup.atlas': `${prefix}pickups/pickups_atlas.png`,
    'ui.icons': `${prefix}ui/ui_icons_atlas.png`,
    'ui.panel_standard': `${prefix}ui/panels/panel_standard.png`,
    'ui.panel_inset': `${prefix}ui/panels/panel_inset.png`,
    'ui.panel_upgrade': `${prefix}ui/panels/panel_upgrade.png`,
    'ui.panel_result': `${prefix}ui/panels/panel_result.png`,
    'ui.button_primary_normal': `${prefix}ui/buttons/button_primary_normal.png`,
    'ui.button_primary_pressed': `${prefix}ui/buttons/button_primary_pressed.png`,
    'ui.button_primary_disabled': `${prefix}ui/buttons/button_primary_disabled.png`,
    'ui.button_secondary_normal': `${prefix}ui/buttons/button_secondary_normal.png`,
    'ui.button_secondary_pressed': `${prefix}ui/buttons/button_secondary_pressed.png`,
    'ui.button_secondary_disabled': `${prefix}ui/buttons/button_secondary_disabled.png`,
    'ui.button_danger_normal': `${prefix}ui/buttons/button_danger_normal.png`,
    'ui.button_danger_pressed': `${prefix}ui/buttons/button_danger_pressed.png`,
    'ui.button_danger_disabled': `${prefix}ui/buttons/button_danger_disabled.png`,
    'ui.button_locked_normal': `${prefix}ui/buttons/button_locked_normal.png`,
    'ui.button_locked_pressed': `${prefix}ui/buttons/button_locked_pressed.png`,
    'ui.button_locked_disabled': `${prefix}ui/buttons/button_locked_disabled.png`,
    'ui.progress_frame': `${prefix}ui/bars/progress_frame.png`,
    'ui.progress_health': `${prefix}ui/bars/progress_health.png`,
    'ui.progress_xp': `${prefix}ui/bars/progress_xp.png`,
    'ui.progress_mission': `${prefix}ui/bars/progress_mission.png`,
    'ui.progress_extraction': `${prefix}ui/bars/progress_extraction.png`,
    'ui.joystick_base': `${prefix}ui/controls/joystick_base.png`,
    'ui.joystick_knob': `${prefix}ui/controls/joystick_knob.png`,
    'ui.objective_arrow': `${prefix}ui/controls/objective_arrow_8dir.png`,
    'ui.cache_marker': `${prefix}ui/controls/cache_marker.png`,
    'projectile.pulse_round': `${prefix}projectiles/player/pulse_round/pulse_round_8dir.png`,
    'projectile.scatter_pellet': `${prefix}projectiles/player/scatter_pellet/scatter_pellet_8dir.png`,
    'projectile.piercing_round': `${prefix}projectiles/player/piercing_round/piercing_round_8dir.png`,
    'projectile.ricochet_round': `${prefix}projectiles/player/ricochet_round/ricochet_round_8dir.png`,
    'projectile.explosive_round': `${prefix}projectiles/player/explosive_round/explosive_round_8dir.png`,
    'projectile.piercing_star_round': `${prefix}projectiles/player/piercing_star_round/piercing_star_round_8dir.png`,
    'projectile.hunter_round': `${prefix}projectiles/player/hunter_round/hunter_round_8dir.png`,
    'projectile.plasma_bolt': `${prefix}projectiles/enemy/plasma_bolt/plasma_bolt_8dir.png`
  };

  const propSpecs = {
    rock_cluster: [32, 32, 16, 28, 'small'],
    scrap_plate: [32, 32, 16, 28, 'small'],
    cable_coil: [32, 32, 16, 28, 'small'],
    gear_debris: [32, 32, 16, 28, 'small'],
    broken_pipe: [32, 32, 16, 28, 'small'],
    vent_grate: [32, 32, 16, 28, 'small'],
    warning_sign: [32, 32, 16, 28, 'small'],
    pipe_junction: [64, 64, 32, 56, 'medium'],
    rust_barrels: [64, 64, 32, 56, 'medium'],
    antenna_mast: [64, 64, 32, 56, 'medium'],
    machine_carcass: [64, 64, 32, 56, 'medium'],
    wrecked_rover: [64, 64, 32, 56, 'medium'],
    collapsed_pump: [64, 64, 32, 56, 'medium'],
    power_pylon: [64, 64, 32, 56, 'medium'],
    broken_mining_crane: [128, 96, 64, 84, 'large'],
    crashed_shuttle_hull: [128, 96, 64, 84, 'large'],
    scorch_mark: [64, 64, 32, 32, 'decal'],
    oil_stain: [64, 64, 32, 32, 'decal'],
    rust_patch: [64, 64, 32, 32, 'decal'],
    tire_track: [64, 64, 32, 32, 'decal'],
    warning_stripe: [64, 64, 32, 32, 'decal'],
    shallow_crater: [64, 64, 32, 32, 'decal'],
    metal_seam: [64, 64, 32, 32, 'decal'],
    cable_run: [64, 64, 32, 32, 'decal']
  };

  Object.keys(propSpecs).forEach((id) => {
    const group = propSpecs[id][4] === 'decal' ? 'decals' : 'objects';
    images[`prop.${id}`] = `${prefix}props/rust/${group}/${id}.png`;
  });

  const gunnerSkills = [
    'burst', 'scatter', 'railgun', 'magazine', 'reload', 'piercing', 'ricochet', 'crit',
    'explosive', 'knockback', 'weakspot', 'emergency_dash', 'piercing_star', 'hunt_barrage', 'zero_storm'
  ];
  gunnerSkills.forEach((id) => {
    images[`skill.gunner.${id}`] = `${prefix}skills/gunner/icons/${id}.png`;
  });

  const iconIds = [
    'health', 'xp', 'timer', 'cargo', 'credits', 'mission', 'anomaly', 'level',
    'reroll', 'lock', 'success', 'failure', 'dispatch', 'crew', 'ship', 'back',
    'confirm', 'mission_nest', 'mission_beacon', 'mission_drill', 'low_gravity', 'meteor', 'spore_bloom', 'energy_tide',
    'scanner', 'fabricator', 'cargo_hold', 'life_support', 'printer', 'planet_rust', 'planet_spore', 'company_logo'
  ];
  const icons = {};
  iconIds.forEach((id, index) => { icons[id] = index; });

  const objects = {
    rust_nest: { frameWidth: 64, frameHeight: 64, anchor: [32, 56], states: { idle: [0, 4, 7], destroyed: [4, 1, 0] } },
    company_beacon: { frameWidth: 64, frameHeight: 64, anchor: [32, 56], states: { inactive: [0, 1, 0], charging: [1, 4, 8], completed: [5, 1, 0] } },
    mining_drill: { frameWidth: 96, frameHeight: 96, anchor: [48, 84], states: { idle: [0, 1, 0], running: [1, 4, 9], completed: [5, 1, 0] } },
    reward_cache: { frameWidth: 64, frameHeight: 64, anchor: [32, 56], states: { locked: [0, 1, 0], ready: [1, 4, 8], opened: [5, 1, 0] } },
    extraction_terminal: { frameWidth: 64, frameHeight: 64, anchor: [32, 56], states: { offline: [0, 1, 0], uploading: [1, 4, 8], completed: [5, 1, 0] } },
    extraction_field: { frameWidth: 128, frameHeight: 64, anchor: [64, 32], states: { active: [0, 4, 10] } }
  };

  const props = {};
  Object.entries(propSpecs).forEach(([id, spec]) => {
    props[id] = { width: spec[0], height: spec[1], anchor: [spec[2], spec[3]], sizeClass: spec[4] };
  });

  const manifest = {
    images,
    icons,
    objects,
    props,
    gunnerSkills,
    enemyFrames: { front: 0, right: 1, back: 2, left: 3 },
    projectileDirections: ['right', 'down_right', 'down', 'down_left', 'left', 'up_left', 'up', 'up_right'],
    pickupRows: { xp: 0, coin: 1, scrap: 2, medical: 3 },
    font: `${prefix}fonts/fusion_pixel_12/fusion-pixel-12px-proportional-zh_hans.ttf`
  };

  class AssetStore {
    constructor(options = {}) {
      this.createImage = options.createImage;
      this.basePath = options.basePath || '';
      this.images = {};
      this.failures = [];
      this.loadedCount = 0;
      this.totalCount = Object.keys(images).length;
      this.ready = false;
      this.manifest = manifest;
    }

    loadImage(key, path) {
      return new Promise((resolve) => {
        let settled = false;
        let timeoutId = null;
        const finish = (image, error) => {
          if (settled) return;
          settled = true;
          if (timeoutId !== null) clearTimeout(timeoutId);
          if (error) this.failures.push({ key, path, error: String(error.message || error) });
          else {
            this.images[key] = image;
            this.loadedCount += 1;
          }
          resolve();
        };
        try {
          const image = this.createImage();
          image.onload = () => finish(image, null);
          image.onerror = (error) => finish(null, error || new Error(`Unable to load ${path}`));
          image.src = `${this.basePath}${path}`;
          if (image.complete && image.width) finish(image, null);
          timeoutId = setTimeout(() => finish(null, new Error(`Timed out loading ${path}`)), 15000);
        } catch (error) {
          finish(null, error);
        }
      });
    }

    async loadAll() {
      await Promise.all(Object.entries(images).map(([key, path]) => this.loadImage(key, path)));
      this.ready = true;
      return this;
    }

    image(key) {
      return this.images[key] || null;
    }
  }

  const API = { AssetStore, manifest };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.StarDutyAssets = API;
}(typeof globalThis !== 'undefined' ? globalThis : this));
