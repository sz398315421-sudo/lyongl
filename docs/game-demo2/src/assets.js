(function (root) {
  'use strict';

  const prefix = 'assets/game/';
  const images = {
    'ground.rust': `${prefix}planets/rust_ground.png`,
    'ground.spore': `${prefix}planets/spore_ground.png`,
    'ground.moon': `${prefix}planets/moon_ground.png`,
    'planet.rust.icon': `${prefix}ui/icons/planet_rust.png`,
    'planet.spore.icon': `${prefix}ui/icons/planet_spore.png`,
    'planet.moon.icon': `${prefix}planets/moon/planet_moon.png`,
    'planet.moon.cover': `${prefix}planets/moon/moon_cover.png`,
    'character.gunner_mia': `${prefix}characters/gunner_mia/gunner_mia_4dir.png`,
    'character.warrior_kade': `${prefix}characters/warrior_kade/warrior_kade_4dir.png`,
    'character.mechanic_locke': `${prefix}characters/mechanic_locke/mechanic_locke_4dir.png`,
    'pet.mechanic_drone': `${prefix}characters/mechanic_locke/pet/mechanic_drone.png`,
    'enemy.swarm': `${prefix}enemies/rust/scrap_mite/scrap_mite_4dir.png`,
    'enemy.shooter': `${prefix}enemies/rust/plasma_watcher/plasma_watcher_4dir.png`,
    'enemy.charger': `${prefix}enemies/rust/rivethorn_ram/rivethorn_ram_4dir.png`,
    'enemy.bloater': `${prefix}enemies/rust/pressure_bloater/pressure_bloater_4dir.png`,
    'enemy.spore_swarm': `${prefix}enemies/spore/mycelium_skitter/mycelium_skitter_4dir.png`,
    'enemy.spore_shooter': `${prefix}enemies/spore/acid_eye_pod/acid_eye_pod_4dir.png`,
    'enemy.spore_charger': `${prefix}enemies/spore/fungal_ram/fungal_ram_4dir.png`,
    'enemy.spore_bloater': `${prefix}enemies/spore/spore_bloater/spore_bloater_4dir.png`,
    'enemy.moon_swarm': `${prefix}enemies/moon/static_crawler/static_crawler_4dir.png`,
    'enemy.moon_shooter': `${prefix}enemies/moon/prism_sentry/prism_sentry_4dir.png`,
    'enemy.moon_charger': `${prefix}enemies/moon/crater_ram/crater_ram_4dir.png`,
    'enemy.moon_bloater': `${prefix}enemies/moon/void_bloater/void_bloater_4dir.png`,
    'object.rust_nest': `${prefix}objects/rust/rust_nest/rust_nest.png`,
    'object.spore_nest': `${prefix}objects/spore/spore_nest/spore_nest.png`,
    'object.moon_nest': `${prefix}objects/moon/moon_nest/moon_nest.png`,
    'object.auto_turret': `${prefix}objects/mechanic/auto_turret/auto_turret.png`,
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
    'ui.cockpit.shell': `${prefix}ui/cockpit/cockpit_main_shell.png`,
    'ui.cockpit.shell_2x': `${prefix}ui/cockpit/cockpit_main_shell_2x.png`,
    'ui.cockpit.main_info_expanded_shell': `${prefix}ui/cockpit/cockpit_main_info_expanded_shell.png`,
    'ui.cockpit.main_info_expanded_shell_2x': `${prefix}ui/cockpit/cockpit_main_info_expanded_shell_2x.png`,
    'ui.cockpit.dispatch_normal': `${prefix}ui/cockpit/cockpit_dispatch_normal.png`,
    'ui.cockpit.dispatch_pressed': `${prefix}ui/cockpit/cockpit_dispatch_pressed.png`,
    'ui.cockpit.nav_idle': `${prefix}ui/cockpit/cockpit_nav_idle.png`,
    'ui.cockpit.nav_active': `${prefix}ui/cockpit/cockpit_nav_active.png`,
    'ui.cockpit.preview': `${prefix}ui/cockpit/cockpit_main_preview.png`,
    'ui.cockpit.archive_shell': `${prefix}ui/cockpit/cockpit_archive_shell.png`,
    'ui.cockpit.archive_shell_2x': `${prefix}ui/cockpit/cockpit_archive_shell_2x.png`,
    'ui.cockpit.activity_shell': `${prefix}ui/cockpit/cockpit_activity_shell.png`,
    'ui.cockpit.activity_shell_2x': `${prefix}ui/cockpit/cockpit_activity_shell_2x.png`,
    'ui.cockpit.tasks_shell': `${prefix}ui/cockpit/cockpit_tasks_shell.png`,
    'ui.cockpit.tasks_shell_2x': `${prefix}ui/cockpit/cockpit_tasks_shell_2x.png`,
    'ui.cockpit.upgrade_shell': `${prefix}ui/cockpit/cockpit_upgrade_shell.png`,
    'ui.cockpit.upgrade_shell_2x': `${prefix}ui/cockpit/cockpit_upgrade_shell_2x.png`,
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
    'ui.exit.return_hq_normal': `${prefix}ui/exit_run/return_hq_button_normal.png`,
    'ui.exit.return_hq_pressed': `${prefix}ui/exit_run/return_hq_button_pressed.png`,
    'ui.exit.return_hq_disabled': `${prefix}ui/exit_run/return_hq_button_disabled.png`,
    'ui.exit.danger_normal': `${prefix}ui/exit_run/exit_danger_button_normal.png`,
    'ui.exit.danger_pressed': `${prefix}ui/exit_run/exit_danger_button_pressed.png`,
    'ui.exit.danger_disabled': `${prefix}ui/exit_run/exit_danger_button_disabled.png`,
    'ui.exit.warning_panel': `${prefix}ui/exit_run/exit_warning_panel.png`,
    'ui.exit.loss_icon': `${prefix}ui/exit_run/loss_warning_icon.png`,
    'projectile.pulse_round': `${prefix}projectiles/player/pulse_round/pulse_round_8dir.png`,
    'projectile.scatter_pellet': `${prefix}projectiles/player/scatter_pellet/scatter_pellet_8dir.png`,
    'projectile.piercing_round': `${prefix}projectiles/player/piercing_round/piercing_round_8dir.png`,
    'projectile.ricochet_round': `${prefix}projectiles/player/ricochet_round/ricochet_round_8dir.png`,
    'projectile.explosive_round': `${prefix}projectiles/player/explosive_round/explosive_round_8dir.png`,
    'projectile.piercing_star_round': `${prefix}projectiles/player/piercing_star_round/piercing_star_round_8dir.png`,
    'projectile.hunter_round': `${prefix}projectiles/player/hunter_round/hunter_round_8dir.png`,
    'projectile.plasma_bolt': `${prefix}projectiles/enemy/plasma_bolt/plasma_bolt_8dir.png`
  };

  // Runtime decoration contract: exactly eight active assets per planet.
  // The review packages remain the source of truth for the pixels; these
  // entries add the dimensions and gameplay collision metadata used by the
  // seeded prop placer and movement resolver.
  const propSpecs = {
    scrap_plate: { planet: 'rust', group: 'objects', width: 32, height: 32, anchor: [16, 28], sizeClass: 'small', collisionRadius: 10 },
    cable_coil: { planet: 'rust', group: 'objects', width: 32, height: 32, anchor: [16, 28], sizeClass: 'small', collisionRadius: 10 },
    pipe_junction: { planet: 'rust', group: 'objects', width: 64, height: 64, anchor: [32, 56], sizeClass: 'medium', collisionRadius: 20 },
    power_pylon: { planet: 'rust', group: 'objects', width: 64, height: 64, anchor: [32, 56], sizeClass: 'medium', collisionRadius: 20 },
    scorch_mark: { planet: 'rust', group: 'decals', width: 64, height: 64, anchor: [32, 32], sizeClass: 'decal', collisionRadius: 8 },
    oil_stain: { planet: 'rust', group: 'decals', width: 64, height: 64, anchor: [32, 32], sizeClass: 'decal', collisionRadius: 8 },
    metal_seam: { planet: 'rust', group: 'decals', width: 64, height: 64, anchor: [32, 32], sizeClass: 'decal', collisionRadius: 8 },
    cable_run: { planet: 'rust', group: 'decals', width: 64, height: 64, anchor: [32, 32], sizeClass: 'decal', collisionRadius: 8 },

    spore_pod_cluster: { planet: 'spore', group: 'objects', width: 32, height: 32, anchor: [16, 28], sizeClass: 'small', collisionRadius: 10 },
    mycelium_stump: { planet: 'spore', group: 'objects', width: 32, height: 32, anchor: [16, 28], sizeClass: 'small', collisionRadius: 10 },
    fungal_mound: { planet: 'spore', group: 'objects', width: 64, height: 64, anchor: [32, 56], sizeClass: 'medium', collisionRadius: 20 },
    husk_remains: { planet: 'spore', group: 'objects', width: 64, height: 64, anchor: [32, 56], sizeClass: 'medium', collisionRadius: 20 },
    spore_pool_decal: { planet: 'spore', group: 'decals', width: 64, height: 64, anchor: [32, 32], sizeClass: 'decal', collisionRadius: 8 },
    mycelium_rift: { planet: 'spore', group: 'decals', width: 64, height: 64, anchor: [32, 32], sizeClass: 'decal', collisionRadius: 8 },
    acid_stain: { planet: 'spore', group: 'decals', width: 64, height: 64, anchor: [32, 32], sizeClass: 'decal', collisionRadius: 8 },
    root_trail: { planet: 'spore', group: 'decals', width: 64, height: 64, anchor: [32, 32], sizeClass: 'decal', collisionRadius: 8 },

    moon_shallow_crater: { planet: 'moon', group: null, width: 64, height: 32, anchor: [32, 24], sizeClass: 'decal', collisionRadius: 10 },
    moon_regolith_chunk: { planet: 'moon', group: null, width: 48, height: 48, anchor: [24, 40], sizeClass: 'small', collisionRadius: 16 },
    moon_crystal_cluster: { planet: 'moon', group: null, width: 64, height: 64, anchor: [32, 56], sizeClass: 'medium', collisionRadius: 21 },
    moon_energy_seam: { planet: 'moon', group: null, width: 64, height: 32, anchor: [32, 24], sizeClass: 'decal', collisionRadius: 10 },
    moon_probe_wreck: { planet: 'moon', group: null, width: 96, height: 64, anchor: [48, 56], sizeClass: 'large', collisionRadius: 21 },
    moon_antenna_fragment: { planet: 'moon', group: null, width: 64, height: 96, anchor: [32, 88], sizeClass: 'medium', collisionRadius: 21 },
    moon_lander_panel: { planet: 'moon', group: null, width: 96, height: 64, anchor: [48, 56], sizeClass: 'large', collisionRadius: 21 },
    moon_dust_ridge: { planet: 'moon', group: null, width: 96, height: 48, anchor: [48, 40], sizeClass: 'decal', collisionRadius: 16 }
  };

  const propSets = {
    rust: ['scrap_plate', 'cable_coil', 'pipe_junction', 'power_pylon', 'scorch_mark', 'oil_stain', 'metal_seam', 'cable_run'],
    spore: ['spore_pod_cluster', 'mycelium_stump', 'fungal_mound', 'husk_remains', 'spore_pool_decal', 'mycelium_rift', 'acid_stain', 'root_trail'],
    moon: ['moon_shallow_crater', 'moon_regolith_chunk', 'moon_crystal_cluster', 'moon_energy_seam', 'moon_probe_wreck', 'moon_antenna_fragment', 'moon_lander_panel', 'moon_dust_ridge']
  };

  Object.entries(propSpecs).forEach(([id, spec]) => {
    const path = spec.planet === 'moon'
      ? `${prefix}props/moon/${id}.png`
      : `${prefix}props/${spec.planet}/${spec.group}/${id}.png`;
    images[`prop.${id}`] = path;
  });

  const enemyDefinitions = {
    rust: {
      scrap_mite: 'swarm', plasma_watcher: 'shooter', rivethorn_ram: 'charger', pressure_bloater: 'bloater'
    },
    spore: {
      mycelium_skitter: 'swarm', acid_eye_pod: 'shooter', fungal_ram: 'charger', spore_bloater: 'bloater'
    },
    moon: {
      static_crawler: 'swarm', prism_sentry: 'shooter', crater_ram: 'charger', void_bloater: 'bloater'
    }
  };
  const dangerEnemyTypes = new Set(['shooter', 'charger', 'bloater']);
  const enemyVariants = { danger: {}, elite: {}, eliteDanger: {} };
  Object.entries(enemyDefinitions).forEach(([planet, entries]) => {
    Object.entries(entries).forEach(([assetId, enemyType]) => {
      if (dangerEnemyTypes.has(enemyType)) {
        const dangerPath = `${prefix}enemies/${planet}/${assetId}/attack_danger/${assetId}_attack_danger_4dir.png`;
        images[`enemy.danger.${planet}.${assetId}`] = dangerPath;
        enemyVariants.danger[`${planet}.${assetId}`] = {
          key: `enemy.danger.${planet}.${assetId}`, path: dangerPath, frameWidth: 64, frameHeight: 64,
          frameCount: 4, anchor: { x: 32, y: 56 }, directionOrder: ['front', 'right', 'back', 'left']
        };
      }
      const elitePath = `${prefix}enemies/${planet}/${assetId}/elite/${assetId}_elite_4dir.png`;
      images[`enemy.elite.${planet}.${assetId}`] = elitePath;
      enemyVariants.elite[`${planet}.${assetId}`] = {
        key: `enemy.elite.${planet}.${assetId}`, path: elitePath, frameWidth: 96, frameHeight: 96,
        frameCount: 4, anchor: { x: 48, y: 82 }, directionOrder: ['front', 'right', 'back', 'left']
      };
      if (dangerEnemyTypes.has(enemyType)) {
        const eliteDangerPath = `${prefix}enemies/${planet}/${assetId}/elite/attack_danger/${assetId}_elite_attack_danger_4dir.png`;
        images[`enemy.eliteDanger.${planet}.${assetId}`] = eliteDangerPath;
        enemyVariants.eliteDanger[`${planet}.${assetId}`] = {
          key: `enemy.eliteDanger.${planet}.${assetId}`, path: eliteDangerPath, frameWidth: 96, frameHeight: 96,
          frameCount: 4, anchor: { x: 48, y: 82 }, directionOrder: ['front', 'right', 'back', 'left']
        };
      }
    });
  });

  const gunnerSkills = [
    'burst', 'scatter', 'railgun', 'magazine', 'reload', 'piercing', 'ricochet', 'crit',
    'explosive', 'knockback', 'weakspot', 'emergency_dash', 'piercing_star', 'hunt_barrage', 'zero_storm'
  ];
  gunnerSkills.forEach((id) => {
    images[`skill.gunner.${id}`] = `${prefix}skills/gunner/icons/${id}.png`;
  });
  const warriorSkills = [
    'cleave', 'double_slash', 'sword_wave', 'orbit_blade', 'strength', 'attack_speed', 'battle_fury',
    'guard', 'dodge', 'counter', 'lifesteal', 'unyielding', 'rift_slash', 'star_ring', 'phantom_counter'
  ];
  const mechanicSkills = [
    'drone', 'turret', 'repair_bot', 'mech_count', 'overclock', 'salvage', 'arc', 'self_destruct',
    'shield', 'quick_deploy', 'recycle_heal', 'magnet', 'swarm_protocol', 'mobile_fortress', 'infinite_recycle'
  ];
  // The V19 additions are archive/upgrade icons only.  Keep them out of the
  // character action list above because their character animation sheets are
  // not part of this icon-only update.
  const newComboIcons = {
    gunner: ['burst_overdrive', 'railgun_overcharge', 'critical_dash'],
    warrior: ['fury_combo', 'iron_fury', 'blood_oath'],
    mechanic: ['parallel_overclock', 'field_reconstruction', 'magnetic_reclaim']
  };
  const skillIconSets = {
    gunner: [...gunnerSkills, ...newComboIcons.gunner],
    warrior: [...warriorSkills, ...newComboIcons.warrior],
    mechanic: [...mechanicSkills, ...newComboIcons.mechanic]
  };
  Object.entries({ warrior: warriorSkills, mechanic: mechanicSkills }).forEach(([classId, skillIds]) => {
    skillIds.forEach((id) => {
      const iconId = classId === 'mechanic' && id === 'shield' ? 'shield_generator' : id;
      images[`skill.${classId}.${id}`] = `${prefix}skills/${classId}/icons/${iconId}.png`;
    });
  });
  // Keep the older mechanic shield icon inside the release closure as a
  // compatibility asset for archived saves and tooling snapshots.
  images['skill.mechanic.shield_legacy'] = `${prefix}skills/mechanic/icons/shield.png`;
  Object.entries(newComboIcons).forEach(([classId, skillIds]) => {
    skillIds.forEach((id) => {
      images[`skill.${classId}.${id}`] = `${prefix}skills/${classId}/icons/${id}.png`;
    });
  });

  // Runtime character actions are kept in one deterministic table so the
  // browser build and the mini-game build use the same frame contract.  The
  // action sheets are rows-by-direction (front, right, back, left), while
  // individual frame PNGs remain available for tooling and fallback checks.
  const characterRoleSpecs = {
    gunner_mia: {
      classId: 'gunner',
      directionRowMap: [0, 3, 2, 1],
      skills: gunnerSkills,
      combos: ['piercing_star', 'hunt_barrage', 'zero_storm', 'burst_overdrive', 'railgun_overcharge', 'critical_dash'],
      weaponMuzzles: {
        // Coordinates are relative to the 64x64 action-frame feet anchor.
        // The projectile and its VFX both use this point as their origin.
        front: { x: 16, y: -14 },
        right: { x: 20, y: -13 },
        back: { x: 15, y: -14 },
        left: { x: -19, y: -13 }
      },
      vfx: {
        burst: 'muzzle_flash', scatter: 'muzzle_flash', railgun: 'railgun_beam', reload: 'muzzle_flash',
        piercing_star: 'piercing_star_burst', hunt_barrage: 'hunt_barrage_lock', zero_storm: 'zero_storm_burst',
        weakspot: 'weakspot_lock', emergency_dash: 'emergency_dash',
        burst_overdrive: 'burst_overdrive', railgun_overcharge: 'railgun_overcharge', critical_dash: 'critical_dash'
      }
    },
    warrior_kade: {
      classId: 'warrior',
      directionRowMap: [0, 3, 2, 1],
      skills: warriorSkills,
      combos: ['rift_slash', 'star_ring', 'phantom_counter', 'fury_combo', 'iron_fury', 'blood_oath'],
      // Melee VFX use the sword hand as their pivot. Coordinates are relative
      // to the 64x64 character frame's feet anchor, matching weaponMuzzles on
      // ranged classes so gameplay can share one direction-aware interface.
      weaponMuzzles: {
        front: { x: 10, y: -20 },
        right: { x: 14, y: -21 },
        back: { x: 10, y: -23 },
        left: { x: -14, y: -21 }
      },
      vfx: {
        cleave: 'slash_arc', sword_wave: 'sword_wave', orbit_blade: 'orbit_blade', guard: 'guard', counter: 'counter',
        rift_slash: 'sword_wave', star_ring: 'star_ring', phantom_counter: 'phantom_counter',
        fury_combo: 'fury_combo', iron_fury: 'iron_fury', blood_oath: 'blood_oath'
      }
    },
    mechanic_locke: {
      classId: 'mechanic',
      directionRowMap: [0, 3, 2, 1],
      skills: mechanicSkills,
      combos: ['swarm_protocol', 'mobile_fortress', 'infinite_recycle', 'parallel_overclock', 'field_reconstruction', 'magnetic_reclaim'],
      vfx: {
        drone: 'drone_muzzle', turret: 'turret_deploy', repair_bot: 'repair_pulse', arc: 'drone_arc',
        self_destruct: 'self_destruct_burst', shield: 'shield_pulse', swarm_protocol: 'swarm_protocol',
        mobile_fortress: 'mobile_fortress', infinite_recycle: 'recycle_burst', recycle_heal: 'recycle_heal',
        parallel_overclock: 'parallel_overclock', field_reconstruction: 'field_reconstruction', magnetic_reclaim: 'magnetic_reclaim'
      }
    }
  };
  const characterActions = {};
  Object.entries(characterRoleSpecs).forEach(([characterId, roleSpec]) => {
    const base = `${prefix}characters/${characterId}/actions`;
    const actions = {};
    const addAction = (state, skillId, frameCount, fps, loop, vfx = null) => {
      const folder = state === 'skill' ? `skills/${skillId}` : state;
      const filename = `${characterId}_${state === 'skill' ? skillId : state}_4dir.png`;
      const path = `${base}/${folder}/${filename}`;
      const key = `character.action.${characterId}.${state}${skillId ? `.${skillId}` : ''}`;
      images[key] = path;
      const spec = {
        key, path, state, skillId: skillId || null, frameWidth: 64, frameHeight: 64, frameCount,
        fps, loop,
        eventFrame: state === 'skill'
          ? (frameCount === 6 ? 3 : 2)
          : (state === 'attack' ? Math.min(1, frameCount - 1) : null),
        anchor: { x: 32, y: 56 }, directionOrder: ['front', 'right', 'back', 'left'],
        // Keep the authored side-row convention explicit for renderers.
        // Runtime direction order remains front/right/back/left; the game
        // maps screen-right to the authored left-facing row and vice versa.
        directionRowMap: [0, 3, 2, 1],
        sheetLayout: 'rows-by-direction', imageSmoothingEnabled: false
      };
      if (vfx) spec.vfx = vfx;
      if (state === 'skill') actions.skills[skillId] = spec;
      else actions[state] = spec;
    };
    actions.skills = {};
    addAction('idle', null, 4, 4, true);
    addAction('walk', null, 6, 10, true);
    addAction('attack', null, roleSpec.combos.includes(roleSpec.skills[0]) ? 6 : 5, 12, false, roleSpec.vfx[roleSpec.skills[0]] || null);
    roleSpec.skills.forEach((skillId) => {
      const frameCount = roleSpec.combos.includes(skillId) ? 6 : 5;
      addAction('skill', skillId, frameCount, 12, false, roleSpec.vfx[skillId] || null);
    });
    characterActions[characterId] = actions;
  });

  // Spore and moon enemies use the same rows-by-direction action contract as
  // the rust set.  The static four-direction sheet remains the safe fallback
  // when an action sheet is unavailable or still loading.
  const enemyActions = {};
  const enemyActionDefinitions = {
    rust: {
      scrap_mite: 'swarm', plasma_watcher: 'shooter', rivethorn_ram: 'charger', pressure_bloater: 'bloater'
    },
    spore: {
      mycelium_skitter: 'swarm', acid_eye_pod: 'shooter', fungal_ram: 'charger', spore_bloater: 'bloater'
    },
    moon: {
      static_crawler: 'swarm', prism_sentry: 'shooter', crater_ram: 'charger', void_bloater: 'bloater'
    }
  };
  const enemyActionFrames = { idle: 4, walk: 6, attack: 4, hit: 2, death: 6 };
  Object.entries(enemyActionDefinitions).forEach(([planet, entries]) => {
    Object.entries(entries).forEach(([assetId, enemyType]) => {
      const states = {};
      Object.entries(enemyActionFrames).forEach(([state, frameCount]) => {
        const path = `${prefix}enemies/${planet}/${assetId}/actions/${state}/${assetId}_${state}_4dir.png`;
        const key = `enemy.action.${planet}.${assetId}.${state}`;
        images[key] = path;
        states[state] = {
          key, path, state, frameWidth: 64, frameHeight: 64, frameCount,
          fps: state === 'walk' ? 10 : (state === 'idle' ? 6 : 14), loop: state === 'idle' || state === 'walk',
          anchor: { x: 32, y: 56 }, directionOrder: ['front', 'right', 'back', 'left'],
          sheetLayout: 'rows-by-direction', imageSmoothingEnabled: false
        };
      });
      enemyActions[`${planet}.${assetId}`] = { planet, assetId, enemyType, states };
    });
  });

  // Skill VFX sheets are an independent layer.  Loading the sheets here
  // lets the action state machine trigger exact event-frame effects while
  // preserving transparent character frames.
  const vfxSpecs = {
    counter: ['warrior', 96, 96, 6, 14, false, 'lighter'], drone_arc: ['mechanic', 64, 64, 5, 16, false, 'lighter'],
    drone_muzzle: ['mechanic', 32, 32, 4, 18, false, 'lighter'], emergency_dash: ['gunner', 64, 64, 5, 16, false, 'lighter'],
    guard: ['warrior', 64, 64, 4, 10, true, 'lighter'], hunt_barrage_lock: ['gunner', 64, 64, 8, 12, false, 'source-over'],
    mobile_fortress: ['mechanic', 96, 96, 8, 12, true, 'lighter'], muzzle_flash: ['gunner', 32, 32, 4, 18, false, 'source-over'],
    orbit_blade: ['warrior', 64, 64, 6, 14, true, 'lighter'], phantom_counter: ['warrior', 96, 96, 8, 15, false, 'lighter'],
    piercing_star_burst: ['gunner', 96, 96, 8, 16, false, 'source-over'], railgun_beam: ['gunner', 128, 32, 4, 20, true, 'lighter'],
    recycle_burst: ['mechanic', 128, 128, 8, 15, false, 'lighter'], recycle_heal: ['mechanic', 128, 128, 8, 15, false, 'lighter'], repair_pulse: ['mechanic', 64, 64, 6, 12, true, 'lighter'],
    self_destruct_burst: ['mechanic', 128, 128, 6, 15, false, 'source-over'], shield_pulse: ['mechanic', 96, 96, 6, 12, true, 'lighter'],
    slash_arc: ['warrior', 64, 64, 5, 16, false, 'source-over'], star_ring: ['warrior', 96, 96, 8, 12, true, 'lighter'],
    swarm_protocol: ['mechanic', 96, 96, 8, 15, false, 'lighter'], sword_wave: ['warrior', 96, 96, 8, 15, false, 'lighter'],
    turret_deploy: ['mechanic', 64, 64, 5, 12, false, 'source-over'], weakspot_lock: ['gunner', 64, 64, 5, 10, true, 'source-over'],
    zero_storm_burst: ['gunner', 128, 128, 8, 15, false, 'source-over'],
    burst_overdrive: ['gunner', 96, 96, 8, 15, false, 'lighter'],
    railgun_overcharge: ['gunner', 96, 96, 8, 15, false, 'lighter'],
    critical_dash: ['gunner', 96, 96, 8, 15, false, 'lighter'],
    radial_damage: ['gunner', 96, 96, 8, 18, false, 'lighter'],
    fury_combo: ['warrior', 96, 96, 8, 15, false, 'lighter'],
    iron_fury: ['warrior', 96, 96, 8, 15, false, 'lighter'],
    blood_oath: ['warrior', 96, 96, 8, 15, false, 'lighter'],
    parallel_overclock: ['mechanic', 96, 96, 8, 15, false, 'lighter'],
    field_reconstruction: ['mechanic', 96, 96, 8, 15, false, 'lighter'],
    magnetic_reclaim: ['mechanic', 96, 96, 8, 15, false, 'lighter']
  };
  Object.assign(vfxSpecs, {
    explosive_impact: ['gunner', 96, 96, 8, 18, false, 'source-over'],
    meteor_warning: ['gunner', 96, 64, 6, 12, true, 'source-over'],
    meteor_impact: ['gunner', 128, 128, 10, 18, false, 'source-over'],
    spore_pool: ['enemy', 96, 96, 6, 10, true, 'lighter']
  });
  const vfx = {};
  Object.entries(vfxSpecs).forEach(([id, spec]) => {
    const [role, frameWidth, frameHeight, frameCount, fps, loop, blendMode] = spec;
    const path = id === 'spore_pool'
      ? `${prefix}enemies/vfx/spore/spore_pool/${id}.png`
      : `${prefix}skills/${role}/vfx/${id}/${id}.png`;
    const key = `vfx.${id}`;
    images[key] = path;
    vfx[id] = {
      key, path, frameWidth, frameHeight, frameCount, fps, loop, blendMode,
      anchor: { x: frameWidth === 128 && frameHeight === 32 ? 0 : Math.floor(frameWidth / 2), y: Math.floor(frameHeight / 2) },
      sheetLayout: 'horizontal', imageSmoothingEnabled: false
    };
  });
  // These two sheets are authored left-to-right: the hot sword core is near
  // the left edge, not at the frame center. Keeping the authored pivot here
  // makes rotation occur around the weapon hand instead of around the middle
  // of the energy arc.
  if (vfx.slash_arc) vfx.slash_arc.anchor = { x: 10, y: 32 };
  if (vfx.sword_wave) vfx.sword_wave.anchor = { x: 13, y: 48 };

  const enemyVfx = {};
  const enemyVfxDefinitions = {
    swarm_attack: [32, 32, 4, 18, false, 'source-over'],
    swarm_hit: [32, 32, 4, 18, false, 'source-over'],
    shooter_charge: [64, 64, 5, 12, true, 'lighter'],
    shooter_fire: [32, 32, 4, 18, false, 'lighter'],
    charger_charge: [64, 64, 5, 12, true, 'source-over'],
    charger_impact: [96, 96, 6, 16, false, 'source-over'],
    bloater_inflate: [64, 64, 5, 12, true, 'source-over'],
    bloater_burst: [128, 128, 8, 16, false, 'source-over'],
    bloater_pool: [96, 96, 6, 10, true, 'lighter']
  };
  // All three ecosystems share the same behavior vocabulary and explicit
  // species lookup used by their action sheets.
  Object.keys(enemyActionDefinitions).forEach((planet) => {
    const entries = enemyActionDefinitions[planet] || null;
    Object.entries(enemyVfxDefinitions).forEach(([effectId, spec]) => {
      const [frameWidth, frameHeight, frameCount, fps, loop, blendMode] = spec;
      const path = `${prefix}enemies/vfx/${planet}/${effectId}/${planet}_${effectId}.png`;
      const key = `vfx.enemy.${planet}.${effectId}`;
      images[key] = path;
      enemyVfx[`${planet}.${effectId}`] = {
        key, path, planet, effectId, enemyType: effectId.split('_')[0], frameWidth, frameHeight, frameCount, fps, loop, blendMode,
        anchor: { x: Math.floor(frameWidth / 2), y: Math.floor(frameHeight / 2) },
        sheetLayout: 'horizontal', imageSmoothingEnabled: false
      };
    });
    if (!entries) return;
    Object.entries(entries).forEach(([assetId, enemyType]) => {
      // Keep the mapping explicit for callers that need to resolve the
      // behavior-specific effect without inferring it from a species name.
      enemyVfx[`${planet}.${assetId}`] = { enemyType, effects: enemyVfxDefinitions };
    });
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
    auto_turret: { frameWidth: 64, frameHeight: 64, anchor: [32, 56], states: { idle: [0, 1, 0] } },
    rust_nest: { frameWidth: 64, frameHeight: 64, anchor: [32, 56], states: { idle: [0, 4, 7], destroyed: [4, 1, 0] } },
    // The authored spore frames have different transparent margins. Keep the
    // ground contact and visual center fixed while the idle art animates.
    spore_nest: {
      frameWidth: 64,
      frameHeight: 64,
      anchor: [32, 56],
      frameOffsets: { idle: [[-2, 0], [3, 0], [-2, 8], [3, 8]] },
      states: { idle: [0, 4, 7] }
    },
    // Moon frames only need a one-pixel horizontal correction; their ground
    // line is already consistent across the sequence.
    moon_nest: {
      frameWidth: 64,
      frameHeight: 64,
      anchor: [32, 56],
      frameOffsets: { idle: [[0, 0], [1, 0], [0, 0], [1, 0]] },
      states: { idle: [0, 4, 7] }
    },
    company_beacon: { frameWidth: 64, frameHeight: 64, anchor: [32, 56], states: { inactive: [0, 1, 0], charging: [1, 4, 8], completed: [5, 1, 0] } },
    mining_drill: { frameWidth: 96, frameHeight: 96, anchor: [48, 84], states: { idle: [0, 1, 0], running: [1, 4, 9], completed: [5, 1, 0] } },
    reward_cache: { frameWidth: 64, frameHeight: 64, anchor: [32, 56], states: { locked: [0, 1, 0], ready: [1, 4, 8], opened: [5, 1, 0] } },
    extraction_terminal: { frameWidth: 64, frameHeight: 64, anchor: [32, 56], states: { offline: [0, 1, 0], uploading: [1, 4, 8], completed: [5, 1, 0] } },
    extraction_field: { frameWidth: 128, frameHeight: 64, anchor: [64, 32], states: { active: [0, 4, 10] } }
  };

  const pets = {
    mechanic_drone: {
      key: 'pet.mechanic_drone',
      frameWidth: 32,
      frameHeight: 32,
      frameCount: 4,
      directionOrder: ['front', 'right', 'back', 'left'],
      directionMode: 'orbit-tangent',
      anchor: { x: 16, y: 16 },
      suggestedDisplaySize: 20,
      imageSmoothingEnabled: false
    }
  };

  const props = {};
  Object.entries(propSpecs).forEach(([id, spec]) => {
    props[id] = {
      width: spec.width,
      height: spec.height,
      anchor: spec.anchor,
      sizeClass: spec.sizeClass,
      planet: spec.planet,
      collision: true,
      collisionShape: 'circle',
      collisionRadius: spec.collisionRadius,
      sourceReference: images[`prop.${id}`]
    };
  });

  const manifest = {
    images,
    icons,
    objects,
    pets,
    props,
    gunnerSkills,
    skillIconSets,
    characterActions,
    characterRoleSpecs,
    vfx,
    enemyActions,
    enemyVfx,
    enemyVariants,
    propSets,
    planetAssets: {
      rust: { icon: 'planet.rust.icon', cover: 'planet.rust.icon' },
      spore: { icon: 'planet.spore.icon', cover: 'planet.spore.icon' },
      moon: { icon: 'planet.moon.icon', cover: 'planet.moon.cover' }
    },
    exitUi: {
      returnHq: {
        normal: 'ui.exit.return_hq_normal', pressed: 'ui.exit.return_hq_pressed', disabled: 'ui.exit.return_hq_disabled'
      },
      danger: {
        normal: 'ui.exit.danger_normal', pressed: 'ui.exit.danger_pressed', disabled: 'ui.exit.danger_disabled'
      },
      warningPanel: 'ui.exit.warning_panel', lossIcon: 'ui.exit.loss_icon'
    },
    enemyFrames: { front: 0, right: 1, back: 2, left: 3 },
    projectileDirections: ['right', 'down_right', 'down', 'down_left', 'left', 'up_left', 'up', 'up_right'],
    pickupRows: { xp: 0, coin: 1, scrap: 2, medical: 3 },
    font: `${prefix}fonts/fusion_pixel_12/fusion-pixel-12px-proportional-zh_hans.ttf`
  };

  class AssetStore {
    constructor(options = {}) {
      this.createImage = options.createImage;
      this.basePath = options.basePath || '';
      // Version the image URLs at the loader boundary.  A long-lived
      // file:// preview can otherwise keep an older placeholder icon after
      // the runtime PNG has been replaced.
      this.cacheBust = options.cacheBust ? String(options.cacheBust) : '';
      // GitHub Pages and mobile browsers can throttle a burst of hundreds of
      // simultaneous image requests. Keep a small queue so every runtime
      // asset gets a fair request slot instead of silently falling back.
      const requestedConcurrency = Number(options.loadConcurrency);
      this.loadConcurrency = Number.isFinite(requestedConcurrency)
        ? Math.max(1, Math.floor(requestedConcurrency))
        : 12;
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
          const cachePath = this.cacheBust
            ? `${path}${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(this.cacheBust)}`
            : path;
          image.src = `${this.basePath}${cachePath}`;
          if (image.complete && image.width) finish(image, null);
          timeoutId = setTimeout(() => finish(null, new Error(`Timed out loading ${path}`)), 15000);
        } catch (error) {
          finish(null, error);
        }
      });
    }

    async loadAll() {
      const entries = Object.entries(images);
      let cursor = 0;
      const worker = async () => {
        while (cursor < entries.length) {
          const index = cursor;
          cursor += 1;
          const [key, path] = entries[index];
          await this.loadImage(key, path);
        }
      };
      const workerCount = Math.min(this.loadConcurrency, entries.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));
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
