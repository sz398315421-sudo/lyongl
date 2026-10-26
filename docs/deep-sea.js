/* Product content verified against lyongl.xyz/#explore, October 2026. */
const experiments=[
 {id:'adas',name:'ADAS 场景',english:'DRIVING SCENES',category:'3D 场景 / HMI',description:'在道路与泊车场景之间切换，探索智能驾驶的三维可视化表达。',action:'探索场景',alt:'ADAS 自动驾驶道路场景与车辆可视化设置界面'},
 {id:'luyoupu',name:'路有谱',english:'A JOURNEY IN MIND',category:'旅行产品 / UI',description:'从目的地探索到行程规划，让每一次出发，都心里有谱。',action:'发现旅程',alt:'路有谱旅行产品，展示海岸风景、目的地搜索与热门路线'},
 {id:'danmugame',name:'CHROMAFALL',english:'COLOR TAKES CONTROL',category:'弹幕游戏 / 实时演示',description:'让颜色决定胜负。一场融合物理弹珠、技能与霓虹领地的视觉实验。',action:'进入对局',alt:'CHROMAFALL 霓虹领地游戏与对局导演台'},
 {id:'game-demo2',name:'星际外勤',english:'OFF-WORLD, ON DUTY',category:'游戏原型 / 交互体验',description:'登陆未知星球，完成任务，再决定何时撤离。体验单手操作的太空冒险原型。',action:'开始试玩',alt:'星际外勤游戏原型，展示像素宇航员与外勤调度界面'}
];
document.querySelector('#experiments').innerHTML=experiments.map((p,i)=>`<a class="experiment-card" href="https://lyongl.xyz/${p.id}/" target="_blank" rel="noopener noreferrer" aria-label="${p.action}：${p.name}（在新标签页打开）"><div class="experiment-preview"><img src="assets/explore/${p.id}.webp" alt="${p.alt}" width="1265" height="712" loading="${i<2?'eager':'lazy'}" decoding="async"><span class="experiment-number" aria-hidden="true">0${i+1}</span><span class="experiment-open" aria-hidden="true">↗</span></div><div class="experiment-details"><div class="experiment-caption"><span>${p.english}</span><span>${p.category}</span></div><h2>${p.name}</h2><p>${p.description}</p><span class="experiment-action">${p.action}<span aria-hidden="true">↗</span></span></div></a>`).join('');
