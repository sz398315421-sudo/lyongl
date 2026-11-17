import { useRef, useState } from 'react';
import { cropAvatarFile } from '../avatar/avatar';

export function AvatarPicker({
  value,
  onChange,
  syncLabel,
}: {
  value: string;
  onChange: (value: string) => void | Promise<void>;
  syncLabel?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await onChange(await cropAvatarFile(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '头像处理失败，请重试。');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return <section className="avatar-picker" aria-label="选择驾驶员头像">
    <div className="avatar-picker-copy">
      <span className="micro-label">DRIVER STICKER / 驾驶员贴纸</span>
      <strong>把你的脸，贴进纸上世界。</strong>
      <p>自动裁成正方形，保留一圈白色剪纸边。</p>
    </div>
    <div className="avatar-picker-actions">
      <div className="avatar-preview" aria-label={value ? '已选择头像' : '默认纸片头像'}>
        {value ? <img src={value} alt="已选择的驾驶员头像" /> : <span className="default-avatar" aria-hidden="true">P</span>}
      </div>
      <div className="avatar-picker-buttons">
        <input ref={input} data-testid="avatar-input" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void choose(event.target.files?.[0])} />
        <button className="small-button avatar-button" type="button" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? '正在裁纸…' : value ? '换一张头像' : '上传头像'}
        </button>
        <span>{value ? syncLabel ?? '已贴好 · 仅本次游戏使用' : '未上传时使用默认头像'}</span>
      </div>
    </div>
    {error ? <p className="avatar-error" role="alert">{error}</p> : null}
  </section>;
}
