import type { UxEventName, UxEventProps } from '@shared/types/ipc';

import type { PhotoGlobeGateway } from '@renderer/infrastructure/photoGlobeGateway';

export async function trackUxEvent(
  gateway: PhotoGlobeGateway,
  name: UxEventName,
  props?: UxEventProps,
): Promise<void> {
  try {
    await gateway.metricsTrack({ name, props });
  } catch {
    // fail-open by design
  }
}

