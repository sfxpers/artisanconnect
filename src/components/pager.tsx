import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { copy } from "@/web/copy";

/** The pages around this one, the first and last, and gaps between: [1, null, 4, 5, 6, null, 9]. */
function pagesNear(page: number, pageCount: number): (number | null)[] {
  const shown = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter((n) => n >= 1 && n <= pageCount)
    .sort((a, b) => a - b);
  return shown.flatMap((n, i) => (i > 0 && n - shown[i - 1]! > 1 ? [null, n] : [n]));
}

/** shadcn's Pagination over a list's pages; nothing when there is one page. */
export function Pager({
  page,
  pageCount,
  label,
  go,
}: {
  page: number;
  pageCount: number;
  label: string;
  go: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const link = (n: number) => ({
    href: `?page=${n}`,
    onClick: (event: React.MouseEvent) => {
      event.preventDefault();
      go(n);
    },
  });
  return (
    <Pagination aria-label={label}>
      <PaginationContent>
        {page > 1 && (
          <PaginationItem>
            <PaginationPrevious text={copy.browse.previous} {...link(page - 1)} />
          </PaginationItem>
        )}
        {pagesNear(page, pageCount).map((n, i) => (
          <PaginationItem key={n ?? `gap${i}`}>
            {n === null ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink isActive={n === page} {...link(n)}>
                {n}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}
        {page < pageCount && (
          <PaginationItem>
            <PaginationNext text={copy.browse.next} {...link(page + 1)} />
          </PaginationItem>
        )}
      </PaginationContent>
    </Pagination>
  );
}
