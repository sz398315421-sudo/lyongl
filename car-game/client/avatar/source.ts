export function isAvatarImageSource(source: string): boolean {
  return source.startsWith('data:image/') || /^https:\/\//i.test(source);
}
