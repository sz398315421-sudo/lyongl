(function (root) {
  'use strict';

  const DATA = {
    title: '星际外勤',
    subtitle: '本星球不在保险范围内',
    version: '0.1.0-mvp',
    palette: {
      ink: '#090d10',
      panel: '#141a1d',
      paper: '#ddd5ba',
      muted: '#817f72',
      acid: '#d9ff57',
      cyan: '#51d9d1',
      orange: '#ff7547',
      danger: '#ff4057',
      rust: '#b9653e',
      spore: '#ad6ee8'
    },
    classes: [
      {
        id: 'gunner',
        name: '枪械师',
        employee: '米娅 · 07',
        color: '#59dbe8',
        accent: '#d9ff57',
        role: '拉开距离 · 弹道清线',
        quote: '命中率低于 92% 的报告，我拒绝签字。',
        unlock: { successes: 0, cost: 0 },
        base: { hp: 92, speed: 102, damage: 13, interval: 0.46, range: 310 },
        cards: [
          { id: 'burst', name: '三点连发', kind: 'core', desc: ['每次多发射 1 枚子弹', '连发散布降低', '伤害额外提升 20%'] },
          { id: 'scatter', name: '散射组件', kind: 'core', desc: ['增加 2 枚侧向弹丸', '散射角收紧', '近距离伤害提升'] },
          { id: 'railgun', name: '轨道枪', kind: 'core', desc: ['周期发射贯穿射线', '射线冷却缩短', '射线宽度与伤害提升'] },
          { id: 'magazine', name: '扩容弹匣', kind: 'modifier', desc: ['弹匣 +2', '弹匣再 +2', '弹匣耗尽时爆发装填'] },
          { id: 'reload', name: '磁力换弹', kind: 'modifier', desc: ['换弹加快 18%', '换弹加快至 32%', '换弹后短暂提升射速'] },
          { id: 'piercing', name: '穿透弹芯', kind: 'modifier', desc: ['子弹穿透 +1', '穿透后伤害衰减降低', '子弹穿透 +2'] },
          { id: 'ricochet', name: '折射弹头', kind: 'modifier', desc: ['命中后弹射 1 次', '弹射距离增加', '可弹射 2 次'] },
          { id: 'crit', name: '暴击演算', kind: 'modifier', desc: ['暴击率 +9%', '暴击伤害提升', '暴击率再 +12%'] },
          { id: 'explosive', name: '爆裂弹', kind: 'modifier', desc: ['命中产生小型爆炸', '爆炸范围提升', '爆炸不再衰减'] },
          { id: 'knockback', name: '动能校准', kind: 'modifier', desc: ['击退提升', '伤害同步提升', '精英也会受到轻微击退'] },
          { id: 'weakspot', name: '弱点锁定', kind: 'survival', desc: ['优先攻击残血目标', '残血增伤 35%', '击杀返还少量换弹时间'] },
          { id: 'emergency_dash', name: '紧急推进', kind: 'survival', desc: ['被包围时自动加速', '触发冷却缩短', '加速期间获得闪避'] }
        ],
        evolutions: [
          { id: 'piercing_star', name: '贯星弹', requires: ['piercing', 'explosive'], desc: '贯穿目标后引发连续爆炸。' },
          { id: 'hunt_barrage', name: '猎杀弹幕', requires: ['ricochet', 'weakspot'], desc: '弹丸自动追猎残血目标并多次折射。' },
          { id: 'zero_storm', name: '零距风暴', requires: ['scatter', 'knockback'], desc: '怪物贴近时自动释放环形霰弹。' }
        ]
      },
      {
        id: 'warrior',
        name: '战士',
        employee: '凯德 · 31',
        color: '#ff7654',
        accent: '#ffd75a',
        role: '贴近怪群 · 范围斩杀',
        quote: '怪物不可怕。季度报销表才可怕。',
        unlock: { successes: 1, cost: 120 },
        base: { hp: 132, speed: 94, damage: 24, interval: 0.72, range: 88 },
        cards: [
          { id: 'cleave', name: '扇形劈砍', kind: 'core', desc: ['斩击范围 +18%', '斩击伤害 +25%', '斩击角度扩大'] },
          { id: 'double_slash', name: '二连斩', kind: 'core', desc: ['35% 概率追加斩击', '概率提升至 55%', '第二斩伤害提升'] },
          { id: 'sword_wave', name: '剑气', kind: 'core', desc: ['每 4 次斩击释放剑气', '改为每 3 次', '剑气尺寸和伤害提升'] },
          { id: 'orbit_blade', name: '浮游剑', kind: 'core', desc: ['召唤 1 把环绕飞剑', '飞剑 +1', '飞剑速度和伤害提升'] },
          { id: 'strength', name: '力量注射', kind: 'modifier', desc: ['伤害 +12%', '伤害累计 +24%', '伤害累计 +40%'] },
          { id: 'attack_speed', name: '快速出剑', kind: 'modifier', desc: ['攻速 +12%', '攻速累计 +24%', '攻速累计 +38%'] },
          { id: 'battle_fury', name: '战意', kind: 'modifier', desc: ['近身击杀短暂增伤', '战意可叠加 2 层', '战意持续时间提升'] },
          { id: 'guard', name: '装甲格挡', kind: 'survival', desc: ['受到伤害降低 8%', '降低累计 15%', '降低累计 23%'] },
          { id: 'dodge', name: '闪避步法', kind: 'survival', desc: ['闪避率 +8%', '闪避率累计 +15%', '闪避后短暂加速'] },
          { id: 'counter', name: '自动反击', kind: 'survival', desc: ['受击释放反击斩', '反击范围提升', '格挡也能触发反击'] },
          { id: 'lifesteal', name: '生命汲取', kind: 'survival', desc: ['近战击杀回复生命', '回复量提升', '精英伤害也可吸血'] },
          { id: 'unyielding', name: '不屈协议', kind: 'survival', desc: ['低生命时提升伤害', '同时提升移速', '首次濒死保留 1 点生命'] }
        ],
        evolutions: [
          { id: 'rift_slash', name: '裂空斩', requires: ['cleave', 'sword_wave'], desc: '巨型斩击撕开空间并释放多道剑气。' },
          { id: 'star_ring', name: '星环剑阵', requires: ['orbit_blade', 'attack_speed'], desc: '高速飞剑形成持续切割的星环。' },
          { id: 'phantom_counter', name: '幻影反攻', requires: ['dodge', 'counter'], desc: '闪避成功时释放全向幻影斩。' }
        ]
      },
      {
        id: 'mechanic',
        name: '机械师',
        employee: '洛克 · 88',
        color: '#d9ff57',
        accent: '#54b9ff',
        role: '绕场布阵 · 机械火力网',
        quote: '无人机也应该有带薪维护日。',
        unlock: { successes: 3, allMissions: true, cost: 240 },
        base: { hp: 104, speed: 98, damage: 10, interval: 0.68, range: 280 },
        cards: [
          { id: 'drone', name: '攻击无人机', kind: 'core', desc: ['无人机伤害 +25%', '无人机 +1', '射程和弹速提升'] },
          { id: 'turret', name: '自动炮塔', kind: 'core', desc: ['周期部署炮塔', '炮塔数量上限 +1', '炮塔伤害提升'] },
          { id: 'repair_bot', name: '维修机器人', kind: 'core', desc: ['缓慢恢复生命', '修复速度提升', '满血时转化为护盾'] },
          { id: 'mech_count', name: '并行端口', kind: 'modifier', desc: ['无人机 +1', '机械伤害提升', '机械攻速提升'] },
          { id: 'overclock', name: '超频', kind: 'modifier', desc: ['机械攻速 +14%', '累计 +28%', '超频时概率双发'] },
          { id: 'salvage', name: '废料效率', kind: 'modifier', desc: ['击杀更易获得废料', '废料提升机械伤害', '废料上限提高'] },
          { id: 'arc', name: '连锁电弧', kind: 'modifier', desc: ['机械弹丸连锁 1 次', '连锁伤害提升', '连锁次数 +1'] },
          { id: 'self_destruct', name: '自爆协议', kind: 'modifier', desc: ['无人机周期自爆并重建', '冷却缩短', '爆炸范围提升'] },
          { id: 'shield', name: '护盾发生器', kind: 'survival', desc: ['减伤 7%', '减伤累计 13%', '周期获得一次伤害免疫'] },
          { id: 'quick_deploy', name: '快速部署', kind: 'modifier', desc: ['炮塔部署加快', '炮塔寿命提升', '炮塔出现时释放冲击波'] },
          { id: 'recycle_heal', name: '回收治疗', kind: 'survival', desc: ['每 20 份废料回复生命', '需求降至 15 份', '治疗同时短暂加速'] },
          { id: 'magnet', name: '磁力拾取', kind: 'survival', desc: ['拾取范围 +35%', '拾取范围累计 +65%', '拾取经验时概率获得废料'] }
        ],
        evolutions: [
          { id: 'swarm_protocol', name: '蜂群协议', requires: ['drone', 'arc'], desc: '无人机组成电弧蜂群，攻击在怪群间跳跃。' },
          { id: 'mobile_fortress', name: '移动堡垒', requires: ['turret', 'shield'], desc: '炮塔改为环绕玩家的护卫炮台。' },
          { id: 'infinite_recycle', name: '无限回收协议', requires: ['self_destruct', 'salvage'], desc: '无人机连续自爆、重建并回收生命。' }
        ]
      }
    ],
    planets: [
      {
        id: 'rust', name: '锈蚀荒原', code: 'RX-13', color: '#4c2f28', floor: '#201c1a', grid: '#493128', accent: '#ff8a4a',
        description: '废弃采掘月。磁暴活跃，前任员工状态：待确认。',
        elite: '磁暴监管者'
      },
      {
        id: 'spore', name: '孢子沼泽', code: 'SP-09', color: '#30223d', floor: '#18151e', grid: '#3b2a48', accent: '#c780ff',
        description: '活体菌海。请勿舔舐任何会呼吸的地面。',
        elite: '母囊巡游者'
      }
    ],
    missions: [
      { id: 'nests', name: '摧毁巢穴', icon: '×', brief: '定位并注销 3 处未备案生命设施。', basePay: 82 },
      { id: 'beacons', name: '激活信标', icon: '◇', brief: '重新激活 3 座公司资产信标。', basePay: 78 },
      { id: 'drill', name: '守护钻机', icon: '▣', brief: '在资源钻机完成采样前保持在岗。', basePay: 88 }
    ],
    anomalies: [
      { id: 'low_gravity', name: '低重力', effect: '移动略快，击退效果增强。' },
      { id: 'meteor', name: '陨石雨', effect: '周期出现可躲避的坠落预警。' },
      { id: 'spore_bloom', name: '孢子爆发', effect: '部分怪物死亡后留下短暂污染。' },
      { id: 'energy_tide', name: '能源潮汐', effect: '周期性同时强化双方行动速度。' }
    ],
    shipModules: [
      { id: 'scanner', name: '侦测阵列', icon: '⌁', desc: '提前揭示异常与奖励方位', costs: [90, 210, 420] },
      { id: 'fabricator', name: '现场制造舱', icon: '⌘', desc: '每局获得升级重抽次数', costs: [110, 250, 480] },
      { id: 'cargo', name: '强化货舱', icon: '▤', desc: '失败时额外保留 10% 战利品', costs: [100, 230, 450] },
      { id: 'life_support', name: '生命维持舱', icon: '+', desc: '小幅提升生命与拾取范围', costs: [120, 280, 520] },
      { id: 'printer', name: '打印舱', icon: '◎', desc: '降低新宇航员打印成本', costs: [140, 320, 600] }
    ]
  };

  DATA.classById = Object.fromEntries(DATA.classes.map((item) => [item.id, item]));
  DATA.planetById = Object.fromEntries(DATA.planets.map((item) => [item.id, item]));
  DATA.missionById = Object.fromEntries(DATA.missions.map((item) => [item.id, item]));
  DATA.anomalyById = Object.fromEntries(DATA.anomalies.map((item) => [item.id, item]));

  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  root.StarDutyData = DATA;
}(typeof globalThis !== 'undefined' ? globalThis : this));
