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

window.addEventListener('hashchange', revealLinkedCase);
filterGallery();
revealLinkedCase();
