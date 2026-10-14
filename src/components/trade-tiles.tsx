import { Link } from "@tanstack/react-router";
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_NAMES } from "@/domain/service-categories";
import { copy } from "@/web/copy";

/** The eight trades as photo tiles, each opening Browse on it, in the Region given if any. */
export function TradeTiles({ region }: { region?: string }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {SERVICE_CATEGORIES.map((category) => (
        <li key={category}>
          <Link
            to="/artisans"
            search={{ category, region }}
            className="group block space-y-2 rounded-lg"
          >
            <img
              // A half-size copy where the tile is small, so a phone loads a quarter of the bytes.
              src={`/trades/${category}.jpg`}
              srcSet={`/trades/${category}-480.jpg 480w, /trades/${category}.jpg 960w`}
              sizes="(min-width: 640px) 25vw, 50vw"
              alt={copy.landing.tradePhoto(SERVICE_CATEGORY_NAMES[category])}
              loading="lazy"
              width={960}
              height={640}
              className="aspect-4/3 w-full rounded-lg border bg-muted object-cover"
            />
            <span className="block text-sm font-medium group-hover:underline">
              {SERVICE_CATEGORY_NAMES[category]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
