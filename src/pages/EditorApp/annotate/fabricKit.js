// Fabric v6 named exports used by the timeline overlay editor and its export
// renderer. Kept to what we reference so the editor chunk stays lean.
import {
  Canvas,
  StaticCanvas,
  Textbox,
  Path,
  Rect,
  Ellipse,
  Group,
  FabricImage,
  FabricObject,
  PencilBrush,
  util,
} from "fabric";

export {
  Canvas,
  StaticCanvas,
  Textbox,
  Path,
  Rect,
  Ellipse,
  Group,
  FabricImage,
  FabricObject,
  PencilBrush,
  util,
};

// Custom props that must survive toObject()/enlivenObjects() round trips.
export const CUSTOM_PROPS = ["seId", "seKind"];
