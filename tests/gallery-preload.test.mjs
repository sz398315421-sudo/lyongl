import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareGalleryImages} from '../docs/gallery-preload.js';

test('hidden lazy covers are promoted before decoding so the first navigation can finish', async () => {
  const images = Array.from({length:4}, () => ({loading:'lazy', decoded:false,
    decode() {
      assert.equal(this.loading, 'eager');
      assert.ok(images.every(image => image.loading === 'eager'));
      this.decoded = true;
      return Promise.resolve();
    }}));
  await prepareGalleryImages(images);
  assert.ok(images.every(image => image.decoded));
});

test('a stalled image download releases navigation at the deadline', async () => {
  const image = {loading:'lazy', decode:() => new Promise(() => {})};
  await prepareGalleryImages([image], {timeoutMs:10});
  assert.equal(image.loading, 'eager');
});

test('a broken cover does not prevent the other covers from preparing', async () => {
  let decoded = false;
  await prepareGalleryImages([
    {decode:() => Promise.reject(new Error('broken image'))},
    {decode:() => {decoded = true;return Promise.resolve();}},
  ]);
  assert.equal(decoded, true);
});
