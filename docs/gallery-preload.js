// Transition covers are hidden while the courtyard remains visible. Native
// lazy loading cannot start there, so explicitly load only the incoming covers.
export async function prepareGalleryImages(images, {timeoutMs = 2500} = {}) {
  for (const image of images) image.loading = 'eager';
  let timer;
  try {
    await Promise.race([
      Promise.all(images.map(image => Promise.resolve().then(() => image.decode()).catch(() => {}))),
      new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
