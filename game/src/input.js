// Keyboard and mouse, read as one input state per frame.
// Arrows steer and climb, A/D steer, W/S work the throttle, Shift boosts,
// Space (or a mouse click) fires, P pauses, M mutes, Enter/Space confirms
// on the menus. The mouse also steers: holding the pointer left or right of
// centre banks the plane, above or below centre pitches it.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyW: 'throttleUp',
  KeyS: 'throttleDown',
  ShiftLeft: 'boost', ShiftRight: 'boost',
  Space: 'fire',
};

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0.5;
  let mouseY = 0.5;
  let mouseDown = false;
  let mouseActive = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    const name = KEYMAP[event.code];
    if (name) {
      held.add(name);
      if (name === 'fire') actions |= ACTION_CONFIRM;
      event.preventDefault();
      return;
    }
    if (event.code === 'Enter' || event.code === 'NumpadEnter') actions |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'KeyM') actions |= ACTION_MUTE;
  }

  function onKeyUp(event) {
    const name = KEYMAP[event.code];
    if (name) held.delete(name);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) / Math.max(1, rect.width);
    mouseY = (event.clientY - rect.top) / Math.max(1, rect.height);
    mouseActive = true;
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    mouseDown = true;
    held.add('fire');
    actions |= ACTION_CONFIRM;
    onMouseMove(event);
  }

  function onMouseUp(event) {
    if (event.button !== 0) return;
    mouseDown = false;
    held.delete('fire');
  }

  function onBlur() {
    held.clear();
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);

  return {
    /** -1..1 lateral steer: keys first, then the mouse offset from centre. */
    steer() {
      let value = 0;
      if (held.has('left')) value -= 1;
      if (held.has('right')) value += 1;
      if (value === 0 && mouseActive && !mouseDown) {
        const offset = mouseX - 0.5;
        if (Math.abs(offset) > 0.04) value = Math.max(-1, Math.min(1, offset * 2.4));
      }
      return value;
    },
    /** -1..1 pitch: up is climb. Keys first, then the mouse. */
    pitch() {
      let value = 0;
      if (held.has('up')) value += 1;
      if (held.has('down')) value -= 1;
      if (value === 0 && mouseActive && !mouseDown) {
        const offset = 0.5 - mouseY;
        if (Math.abs(offset) > 0.06) value = Math.max(-1, Math.min(1, offset * 2.2));
      }
      return value;
    },
    boost() { return held.has('boost'); },
    throttleUp() { return held.has('throttleUp'); },
    throttleDown() { return held.has('throttleDown'); },
    firing() { return held.has('fire'); },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
