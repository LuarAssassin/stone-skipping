import { ThrowGesture } from './gesture';
import type { Launch } from '../simulation/physics';
export function bindGesture(canvas: HTMLCanvasElement, gesture: ThrowGesture, parameters: Launch, syncControls: () => void, start: (replay: boolean, target: Launch) => void) {
    function cancelGesture() {
        const pointerId = gesture.pointerId;
        gesture.cancel();
        if (pointerId !== undefined && canvas.hasPointerCapture(pointerId))
            canvas.releasePointerCapture(pointerId);
        document.querySelector<HTMLProgressElement>('#power')!.value = 0;
        document.querySelector('#aim')!.textContent = '准备：约按住 0.7 秒，轻拖后松手';
        document.querySelector<HTMLElement>('#aim-arrow')!.style.transform = 'rotate(0deg)';
    }
    function pointerInput(event: PointerEvent) { return { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, timeStamp: event.timeStamp > 0 ? event.timeStamp : performance.now() }; }
    canvas.addEventListener('pointerdown', event => {
        if (gesture.pointerId !== undefined) {
            if (event.pointerId !== gesture.pointerId)
                cancelGesture();
            return;
        }
        if (!event.isPrimary || event.button !== 0)
            return;
        if (gesture.begin(pointerInput(event), canvas.getBoundingClientRect(), parameters)) {
            canvas.setPointerCapture(event.pointerId);
            event.preventDefault();
        }
    });
    canvas.addEventListener('pointermove', event => gesture.move(pointerInput(event)));
    canvas.addEventListener('pointerup', event => {
        const active = gesture.pointerId === event.pointerId;
        const target = gesture.release(pointerInput(event));
        if (active)
            cancelGesture();
        if (canvas.hasPointerCapture(event.pointerId))
            canvas.releasePointerCapture(event.pointerId);
        if (target) {
            Object.assign(parameters, target);
            syncControls();
            start(false, target);
        }
    });
    canvas.addEventListener('pointercancel', cancelGesture);
    canvas.addEventListener('lostpointercapture', event => { if (gesture.pointerId === event.pointerId)
        cancelGesture(); });
    document.addEventListener('pointerdown', event => { if (gesture.pointerId !== undefined && event.pointerId !== gesture.pointerId)
        cancelGesture(); }, true);
    window.addEventListener('blur', cancelGesture);
    window.addEventListener('keydown', event => { if (event.code === 'Escape')
        cancelGesture(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden)
        cancelGesture(); });
    return cancelGesture;
}
