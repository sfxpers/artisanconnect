import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { UserSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/data-table";
import { Input } from "@/components/ui/input";
import { EmptyState, Page } from "@/components/page";
import { copy, pageTitle } from "@/web/copy";
import { onlyForAdmins } from "@/web/guards";
import { findPeople } from "@/web/people";

export const Route = createFileRoute("/admin/people/")({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === "string" && search.q ? { q: search.q } : {},
  beforeLoad: ({ context }) => {
    onlyForAdmins(context);
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => findPeople({ data: { query: deps.q ?? "" } }),
  head: () => ({ meta: [{ title: pageTitle(t.title) }] }),
  component: People,
});

const t = copy.admin.people;

type Person = Awaited<ReturnType<typeof findPeople>>[number];

const columns: DataColumn<Person>[] = [
  {
    id: "name",
    header: t.name,
    accessorFn: (person) => person.name,
    cell: ({ row }) => (
      <Link
        to="/admin/people/$accountId"
        params={{ accountId: row.original.accountId }}
        className="font-medium text-primary hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    id: "kind",
    header: t.kind,
    accessorFn: (person) => copy.signUp.kind.chosen[person.kind],
  },
  { id: "email", header: t.email, accessorFn: (person) => person.email },
  {
    id: "standing",
    header: t.standing,
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex gap-1">
        {row.original.suspended && <Badge variant="destructive">{t.suspended}</Badge>}
        {row.original.closed && <Badge variant="outline">{t.closed[row.original.closed]}</Badge>}
      </div>
    ),
  },
];

/** The People page (#136): find an Account by name or Email, then act on it on its own page. */
function People() {
  const people = Route.useLoaderData();
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const [query, setQuery] = useState(q ?? "");
  return (
    <Page title={t.title} lead={t.lead}>
      <form
        className="flex max-w-md gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void navigate({ to: "/admin/people", search: query.trim() ? { q: query.trim() } : {} });
        }}
      >
        <Input
          aria-label={t.search}
          placeholder={t.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button type="submit">{t.find}</Button>
      </form>
      <DataTable
        label={t.table}
        columns={columns}
        data={people}
        empty={<EmptyState icon={<UserSearch />}>{t.empty}</EmptyState>}
      />
    </Page>
  );
}
