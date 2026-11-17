import type { KartInput } from '../../shared/types';
import { EMPTY_INPUT } from '../../game-core/config';

export type Control = 'throttle' | 'brake' | 'left' | 'right' | 'drift' | 'item';
const KEY_MAP: Record<string, Control | 'reset'> = {
  KeyW: 'throttle', ArrowUp: 'throttle', KeyS: 'brake', ArrowDown: 'brake',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'drift', KeyE: 'item', KeyR: 'reset',
};

export class InputController {
  private keys = new Set<string>();
  private pointers = new Map<number, Control>();
  private resetPending = false;
  private active = false;

  constructor() {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private onDown = (event: KeyboardEvent) => {
    if (!this.active || !KEY_MAP[event.code] || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof HTMLElement && event.target.matches('input, textarea, [contenteditable]')) return;
    event.preventDefault();
    if (KEY_MAP[event.code] === 'reset') {
      if (!event.repeat) this.resetPending = true;
    } else this.keys.add(event.code);
  };
  private onUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  private onVisibility = () => { if (document.hidden) this.clear(); };
  clear = () => { this.keys.clear(); this.pointers.clear(); this.resetPending = false; };
  setActive(active: boolean) { this.active = active; this.clear(); }
  requestReset() { if (this.active) this.resetPending = true; }
  pressPointer(id: number, control: Control) { if (this.active) this.pointers.set(id, control); }
  releasePointer(id: number) { this.pointers.delete(id); }

  read(): KartInput {
    if (!this.active) return { ...EMPTY_INPUT };
    const held = new Set<Control>(this.pointers.values());
    for (const key of this.keys) {
      const action = KEY_MAP[key];
      if (action !== 'reset') held.add(action);
    }
    const result = {
      throttle: Number(held.has('throttle')), brake: Number(held.has('brake')),
      steer: Number(held.has('right')) - Number(held.has('left')),
      drift: held.has('drift'), reset: this.resetPending, useItem: held.has('item'),
    };
    this.resetPending = false;
    return result;
  }

  dispose() {
    this.clear();
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
