const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeProfileNickname(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 12) || '纸片车手';
}

export function validateEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new Error('请输入有效的邮箱地址。');
  return email;
}

export function validatePassword(value: string): string {
  if (value.length < 8) throw new Error('密码至少需要 8 个字符。');
  if (value.length > 72) throw new Error('密码不能超过 72 个字符。');
  return value;
}

export function validateFinishPosition(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new Error('完赛名次必须在 1 到 6 之间。');
  return value;
}

export async function avatarDataUrlToBlob(dataUrl: string): Promise<Blob> {
  if (!/^data:image\/png;base64,/i.test(dataUrl)) throw new Error('头像必须先处理为 PNG 图片。');
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  if (blob.type !== 'image/png' || blob.size === 0 || blob.size > 2 * 1024 * 1024) {
    throw new Error('处理后的头像不能超过 2 MB。');
  }
  return blob;
}
