import { BrickWall, Flame, Grid2x2, Hammer, House, PaintRoller, Wrench, Zap } from "lucide-react";
import type { ServiceCategory } from "@/domain/service-categories";

/** Each trade's icon, wherever trades are chosen or shown. */
export const TRADE_ICONS: Record<ServiceCategory, typeof Wrench> = {
  plumbing: Wrench,
  electrical: Zap,
  carpentry: Hammer,
  painting: PaintRoller,
  tiling: Grid2x2,
  brickwork: BrickWall,
  roofing: House,
  welding: Flame,
};
