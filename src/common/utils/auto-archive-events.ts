// Announces shipments the API archived on its own. The unload and cancel
// mutations fire this; AutoArchiveNotice (mounted once in AppLayout) shows
// the pop-up, so it survives the unload page navigating away.

import type { AutoArchivedShipment } from "../../queries/types";

const EVENT = "shipment-auto-archived";

export function announceAutoArchive(shipment: AutoArchivedShipment): void {
  window.dispatchEvent(new CustomEvent<AutoArchivedShipment>(EVENT, { detail: shipment }));
}

/** Returns the unsubscribe function. */
export function onAutoArchive(listener: (shipment: AutoArchivedShipment) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<AutoArchivedShipment>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
