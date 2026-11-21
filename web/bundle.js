import {maxOrderQuantity} from './catalog.js';

export function bundleContents(quantity, extraRemote = false) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxOrderQuantity) return null;
  return {
    pods: quantity,
    remotes: 1 + (extraRemote === true ? 1 : 0),
    pads: quantity,
    rings: quantity,
    singleLeads: quantity % 2,
    splitLeads: Math.floor(quantity / 2),
    chargingLeads: Math.ceil(quantity / 2)
  };
}
