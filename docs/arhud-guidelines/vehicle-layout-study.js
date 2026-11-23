const gallery = document.getElementById('vehicle-gallery');
const regionSelect = document.getElementById('study-region');
const typeSelect = document.getElementById('study-type');
const count = document.getElementById('study-count');

function filterGallery() {
  let visible = 0;
  for (const card of gallery.children) {
    const matchesRegion = !regionSelect.value || card.dataset.region === regionSelect.value;
    const matchesType = !typeSelect.value || card.dataset.type === typeSelect.value;
    card.hidden = !(matchesRegion && matchesType);
    if (!card.hidden) visible += 1;
  }
  count.textContent = visible ? `${visible} 款车型` : '没有匹配车型';
}

regionSelect.addEventListener('change', filterGallery);
typeSelect.addEventListener('change', filterGallery);

for (const side of ['left', 'right']) {
  const select = document.getElementById(`compare-${side}`);
  const panel = document.getElementById(`compare-${side}-panel`);
  select.addEventListener('change', () => {
    const card = document.getElementById(`case-${select.value}`).cloneNode(true);
    card.removeAttribute('id');
    card.hidden = false;
    card.querySelector('.vehicle-displays').open = true;
    panel.replaceChildren(card);
  });
}

function revealLinkedCase() {
  const id = location.hash.slice(1);
  if (!id.startsWith('case-')) return;
  const target = document.getElementById(id);
  if (!target?.hidden) return;
  regionSelect.value = '';
  typeSelect.value = '';
  filterGallery();
  target.scrollIntoView();
}

const ratioFilter = document.getElementById('ratio-filter');
const ratioCount = document.getElementById('ratio-count');
const screenRows = document.querySelectorAll('[data-ratio-status]');

function filterRatios() {
  let visible = 0;
  for (const row of screenRows) {
    row.hidden = Boolean(ratioFilter.value && row.dataset.ratioStatus !== ratioFilter.value);
    if (!row.hidden) visible += 1;
  }
  ratioCount.textContent = `${visible} 条参数`;
}

function revealLinkedRatios() {
  const id = location.hash.slice(1);
  if (!id.startsWith('ratio-')) return;
  const group = document.getElementById(id);
  if (!group?.querySelector('tr[hidden]')) return;
  ratioFilter.value = '';
  filterRatios();
  group.scrollIntoView();
}

ratioFilter.addEventListener('change', filterRatios);
window.addEventListener('hashchange', revealLinkedRatios);
window.addEventListener('hashchange', revealLinkedCase);
filterRatios();
filterGallery();
revealLinkedRatios();
revealLinkedCase();
