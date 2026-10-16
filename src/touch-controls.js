/** Pointer ownership prevents stuck controls after interruptions or multi-touch. */
export function createTouchControls(root, enabled, onGesture) {
  const buttons = { left: false, right: false, throttle: false, brake: false, drift: false };
  const pointers = new Map();
  const pad = root.querySelector('#steering-pad');
  let padPointer = null;
  let origin = 0;
  let axis = 0;

  function setAxis(value) {
    axis = Math.max(-1, Math.min(1, value));
    const travel = Math.min(48, Math.max(24, pad.clientWidth / 2 - 25));
    pad.style.setProperty('--steer-x', `${-axis * travel}px`);
  }
  for (const button of root.querySelectorAll('[data-control]')) {
    const key = button.dataset.control;
    button.addEventListener('pointerdown', (event) => {
      if (!enabled() || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, key);
      buttons[key] = true;
      button.classList.add('pressed');
      onGesture();
    });
    function release(event) {
      pointers.delete(event.pointerId);
      buttons[key] = [...pointers.values()].includes(key);
      button.classList.toggle('pressed', buttons[key]);
    }
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  }
  pad.addEventListener('pointerdown', (event) => {
    if (!enabled() || padPointer !== null || (event.pointerType === 'mouse' && event.button !== 0))
      return;
    event.preventDefault();
    padPointer = event.pointerId;
    origin = event.clientX;
    setAxis(0);
    pad.setPointerCapture(event.pointerId);
    pad.classList.add('pressed');
    onGesture();
  });
  pad.addEventListener('pointermove', (event) => {
    if (event.pointerId !== padPointer) return;
    const distance = origin - event.clientX;
    setAxis(Math.abs(distance) < 4 ? 0 : (Math.sign(distance) * (Math.abs(distance) - 4)) / 60);
  });
  function releasePad(event) {
    if (event.pointerId !== padPointer) return;
    padPointer = null;
    setAxis(0);
    pad.classList.remove('pressed');
  }
  pad.addEventListener('pointerup', releasePad);
  pad.addEventListener('pointercancel', releasePad);
  pad.addEventListener('lostpointercapture', releasePad);
  return {
    buttons,
    get axis() {
      return axis;
    },
    get dragging() {
      return padPointer !== null;
    },
    reset() {
      pointers.clear();
      padPointer = null;
      setAxis(0);
      for (const key in buttons) buttons[key] = false;
      root.querySelectorAll('.pressed').forEach((element) => element.classList.remove('pressed'));
    },
  };
}
