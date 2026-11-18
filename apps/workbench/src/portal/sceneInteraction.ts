const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const wrapYaw = (value: number) => ((value + 180) % 360 + 360) % 360 - 180;

// Camera offsets only: catalogue positions and motion data remain untouched.
export function createSceneInteraction() {
  let yaw = 0, pitch = 0, dragYaw = 0, dragPitch = 0, hoverYaw = 0, hoverPitch = 0;
  return {
    hover(x: number, y: number) { hoverYaw = clamp(x, -1, 1) * 18; hoverPitch = clamp(y, -1, 1) * 11; },
    leave() { hoverYaw = 0; hoverPitch = 0; },
    drag(dx: number, dy: number) {
      dragYaw += dx * 0.32;
      dragPitch = clamp(dragPitch + dy * 0.24, -96, 52);
    },
    step(immediate = false) {
      const targetYaw = dragYaw + hoverYaw, targetPitch = clamp(dragPitch + hoverPitch, -107, 63);
      yaw += (targetYaw - yaw) * (immediate ? 1 : 0.24);
      pitch += (targetPitch - pitch) * (immediate ? 1 : 0.24);
      const settled = Math.abs(targetYaw - yaw) + Math.abs(targetPitch - pitch) < 0.015;
      if (settled) { yaw = targetYaw; pitch = targetPitch; }
      return { yaw: wrapYaw(yaw), pitch: clamp(22 + pitch, -85, 85), settled };
    },
  };
}
