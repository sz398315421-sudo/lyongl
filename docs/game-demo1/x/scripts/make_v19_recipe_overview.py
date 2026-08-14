from pathlib import Path
from PIL import Image, ImageDraw
from PIL import ImageFont

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / 'assets' / 'concepts' / 'v19_combo_vfx_review'
JOBS = {
    'burst_overdrive': ('gunner', ['burst', 'magazine'], '连续弹幕形成集中火力，短暂强化多发射击反馈'),
    'railgun_overcharge': ('gunner', ['railgun', 'reload'], '轨道枪完成蓄能后释放一次更强的贯穿脉冲'),
    'critical_dash': ('gunner', ['crit', 'emergency_dash'], '推进闪避后锁定目标弱点，释放一次高亮精准打击'),
    'fury_combo': ('warrior', ['double_slash', 'strength'], '连续挥出交叉剑弧，形成一次重叠斩击'),
    'iron_fury': ('warrior', ['battle_fury', 'guard'], '格挡姿态蓄力后释放带护盾反馈的反击冲击'),
    'blood_oath': ('warrior', ['lifesteal', 'unyielding'], '低生命状态下释放生命回收脉冲，并强化近战收束效果'),
    'parallel_overclock': ('mechanic', ['mech_count', 'overclock'], '多台机械同步过载，形成短暂电弧网'),
    'field_reconstruction': ('mechanic', ['quick_deploy', 'repair_bot'], '快速部署维修单元，释放范围维修脉冲'),
    'magnetic_reclaim': ('mechanic', ['recycle_heal', 'magnet'], '磁力聚拢废料并转化为范围恢复能量'),
}

canvas = Image.new('RGBA', (900, 720), (10, 15, 17, 255))
draw = ImageDraw.Draw(canvas)
font = ImageFont.truetype('C:/Windows/Fonts/simhei.ttf', 11)
small_font = ImageFont.truetype('C:/Windows/Fonts/simhei.ttf', 9)
cols, rows = [20, 310, 600], [20, 255, 490]
for index, (asset_id, (role, requires, effect)) in enumerate(JOBS.items()):
    row, col = divmod(index, 3)
    folder = REVIEW / 'vfx' / asset_id
    sheet = Image.open(folder / f'{asset_id}.png').convert('RGBA')
    thumb_w = min(270, sheet.width)
    thumb = sheet.resize((thumb_w, max(1, round(sheet.height * thumb_w / sheet.width))), Image.Resampling.NEAREST)
    x, y = cols[col], rows[row] + 35
    canvas.alpha_composite(thumb, (x, y))
    draw.text((x, rows[row]), f'{role.upper()} // {asset_id}', fill=(230, 240, 230, 255), font=font)
    draw.text((x, rows[row] + 145), f'配方: {" + ".join(requires)}', fill=(205, 225, 205, 255), font=small_font)
    draw.text((x, rows[row] + 165), effect, fill=(170, 190, 180, 255), font=small_font)

canvas.save(REVIEW / 'v19_combo_recipe_effects_overview.png')
canvas.resize((1800, 1440), Image.Resampling.NEAREST).save(REVIEW / 'v19_combo_recipe_effects_overview_2x.png')
