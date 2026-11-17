import type { Control, InputController } from '../game/input';

const buttons: { control: Control; label: string; text: string; className: string }[] = [
  { control: 'left', label: '向左转向', text: '←', className: 'touch-left' },
  { control: 'right', label: '向右转向', text: '→', className: 'touch-right' },
  { control: 'brake', label: '刹车 / 倒车', text: '倒车', className: 'touch-brake' },
  { control: 'drift', label: '漂移', text: '漂移', className: 'touch-drift' },
  { control: 'item', label: '使用道具', text: '道具', className: 'touch-item' },
  { control: 'throttle', label: '加速', text: '↑', className: 'touch-throttle' },
];

export function TouchControls({ input }: { input: InputController }) {
  return <div className="touch-controls" aria-label="触屏驾驶控制">
    {buttons.map(button => <button key={button.control}
      className={'touch-button ' + button.className}
      aria-label={button.label}
      onPointerDown={event => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.dataset.held = 'true';
        input.pressPointer(event.pointerId, button.control);
      }}
      onPointerUp={event => {
        input.releasePointer(event.pointerId);
        delete event.currentTarget.dataset.held;
      }}
      onPointerCancel={event => {
        input.releasePointer(event.pointerId);
        delete event.currentTarget.dataset.held;
      }}
      onLostPointerCapture={event => {
        input.releasePointer(event.pointerId);
        delete event.currentTarget.dataset.held;
      }}
    >{button.text}</button>)}
  </div>;
}
