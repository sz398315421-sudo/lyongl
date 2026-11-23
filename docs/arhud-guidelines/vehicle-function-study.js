'use strict';
const research = JSON.parse(document.getElementById('research-data').textContent);
const models = new Map(research.vehicles.map(v => [v.id, v]));
const byId = id => document.getElementById(id);
const safe = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sourceLinks = ids => ids.map(id => `<a class="ref" href="#src-${safe(id)}">[${safe(id)}]</a>`).join(' ');
const labels = {modes:'模式与设置',ar:'AR 导航',sr:'SR／环境',map:'地图',tbt:'TBT',assist:'辅助驾驶与告警',extra:'影像、环境与驻车',limit:'边界与待核'};
const sceneFields = {manual:['modes','sr','limit'],nav:['ar','map','tbt'],assist:['sr','assist','limit'],turn:['extra','limit'],reverse:['extra','limit'],weather:['extra','limit'],park:['extra','limit']};

function drawPanel(side) {
  const v = models.get(byId(`${side}-car`).value);
  const sample = byId(`car-${v.id}`).querySelector('figure, .missing').cloneNode(true);
  // Reuse the original static figure, with its attribution and version unchanged.
  const panel = byId(`${side}-panel`);
  panel.replaceChildren();
  const head = document.createElement('header');
  head.innerHTML = `<span class="eyebrow">${safe(v.group)} / ${safe(v.architecture)}</span><h3>${safe(v.model)}</h3><p class="scope">${safe(v.scope)}</p>`;
  panel.append(head, sample);
  const body = document.createElement('div');
  body.innerHTML = `<dl>${sceneFields[byId('task').value].map(k => `<div><dt>${labels[k]}</dt><dd>${safe(v[k])}</dd></div>`).join('')}</dl><p class="caption">事实依据 ${sourceLinks(v.refs)}</p><a class="detail-link" href="#car-${safe(v.id)}">查看该车完整八项说明 ↓</a>`;
  panel.append(body);
}
function renderComparison() {
  const scene = research.scenarios.find(s => s[0] === byId('task').value);
  byId('scene-brief').innerHTML = `<b>${safe(scene[1])}：</b>${safe(scene[2])} ${safe(scene[3])}`;
  drawPanel('left'); drawPanel('right');
}
byId('left-car').value = 'm9';
byId('right-car').value = 'vistiq';
byId('task').value = 'nav';
['left-car','right-car','task'].forEach(id => byId(id).addEventListener('change',renderComparison));
renderComparison();

const cards = [...document.querySelectorAll('.vehicle-grid > .vehicle')];
function filterCards() {
  const term = byId('search').value.trim().toLocaleLowerCase();
  let count = 0;
  for (const card of cards) {
    const matches = (!byId('group').value || card.dataset.group === byId('group').value) &&
      (!byId('feature').value || card.dataset.tags.split(' ').includes(byId('feature').value)) &&
      (!term || card.dataset.search.toLocaleLowerCase().includes(term));
    card.hidden = !matches;
    count += Number(matches);
  }
  byId('count').textContent = `${count} 款车型`;
  byId('empty').hidden = count > 0;
}
function resetFilters() {
  ['search','group','feature'].forEach(id => { byId(id).value = ''; });
  filterCards();
}
byId('search').addEventListener('input',filterCards);
['group','feature'].forEach(id => byId(id).addEventListener('change',filterCards));
byId('reset').addEventListener('click',resetFilters);
function revealLinkedModel() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id.startsWith('car-')) return;
  const card = byId(id);
  if (!card) return;
  if (card.hidden) resetFilters();
  card.querySelector('details').open = true;
  card.scrollIntoView({block:'start'});
}
window.addEventListener('hashchange',revealLinkedModel);
revealLinkedModel();

let beforePrintState;
window.addEventListener('beforeprint', () => {
  beforePrintState = cards.map(card => ({hidden:card.hidden,open:card.querySelector('details').open}));
  cards.forEach(card => {card.hidden = false;card.querySelector('details').open = true;});
});
window.addEventListener('afterprint', () => {
  if (!beforePrintState) return;
  cards.forEach((card,i) => {card.hidden=beforePrintState[i].hidden;card.querySelector('details').open=beforePrintState[i].open;});
  beforePrintState = undefined;
});
byId('print').addEventListener('click', () => window.print());
