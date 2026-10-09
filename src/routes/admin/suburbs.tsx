import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Page, Refusal } from "@/components/page";
import { useAction } from "@/components/use-action";
import { cn } from "@/lib/utils";
import { addSuburb, getAdminSuburbs } from "@/web/admin";
import { copy } from "@/web/copy";
import { onlyForAdmins } from "@/web/guards";

export const Route = createFileRoute("/admin/suburbs")({
  beforeLoad: ({ context }) => {
    onlyForAdmins(context);
  },
  loader: () => getAdminSuburbs(),
  component: Suburbs,
});

const t = copy.admin.suburbs;

type Region = Awaited<ReturnType<typeof getAdminSuburbs>>[number];

/** Every Region's suburbs, and adding one the City creates; none is ever moved, renamed, or removed (#142). */
function Suburbs() {
  const regions = Route.useLoaderData();
  const total = regions.reduce((sum, region) => sum + region.suburbs.length, 0);
  return (
    <Page title={t.title}>
      <p className="max-w-2xl text-sm text-muted-foreground">{t.lead}</p>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-2">
          <Card className="py-0">
            <ul className="divide-y">
              {regions.map((region) => (
                <RegionRow key={region.id} region={region} />
              ))}
            </ul>
          </Card>
          <p className="text-xs text-muted-foreground">{t.total(total)}</p>
        </div>
        <AddCard regions={regions} />
      </div>
    </Page>
  );
}

function RegionRow({ region }: { region: Region }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="p-4">
      <div className="flex items-center gap-3">
        <span className="flex-1 font-medium">{region.name}</span>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls={`suburbs-${region.id}`}
          aria-label={open ? t.close(region.name) : t.open(region.name)}
          onClick={() => setOpen(!open)}
        >
          <span className="text-muted-foreground">{t.count(region.suburbs.length)}</span>
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </div>
      {open && (
        <ul
          id={`suburbs-${region.id}`}
          className="mt-3 columns-2 gap-4 text-xs text-muted-foreground sm:columns-3"
        >
          {region.suburbs.map((suburb) => (
            <li key={suburb.id} className="break-inside-avoid py-0.5">
              {suburb.name}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function AddCard({ regions }: { regions: Region[] }) {
  const action = useAction();
  const [name, setName] = useState("");
  const [regionId, setRegionId] = useState("");
  const [alike, setAlike] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  async function add(despiteAlike: boolean) {
    setAdded(null);
    const region = regions.find((each) => each.id === regionId)?.name ?? "";
    await action.run(
      async () => {
        const result = await addSuburb({ data: { name, regionId, despiteAlike } });
        // A name that reads like another's is added only when asked again.
        setAlike(!result.ok && result.refusal.reason === "reads-alike");
        return result;
      },
      () => {
        setAdded(t.added(name.trim().replace(/\s+/g, " "), region));
        setName("");
      },
    );
  }

  return (
    <Card size="sm" className="self-start">
      <CardHeader>
        <CardTitle>{t.add}</CardTitle>
        <CardDescription>{t.addLead}</CardDescription>
      </CardHeader>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void add(false);
        }}
      >
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="suburb-name">{t.name}</Label>
            <Input
              id="suburb-name"
              autoComplete="off"
              placeholder={t.namePlaceholder}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setAlike(false);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="suburb-region">{t.region}</Label>
            <select
              id="suburb-region"
              className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
              value={regionId}
              onChange={(event) => {
                setRegionId(event.target.value);
                setAlike(false);
              }}
            >
              <option value="">{t.chooseRegion}</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          </div>
          <Refusal message={action.refusal} />
          {added && <p className="text-sm text-muted-foreground">{added}</p>}
        </CardContent>
        <CardFooter className="flex-wrap gap-2 pt-4">
          <Button type="submit" disabled={action.busy || !name.trim() || !regionId}>
            {t.submit}
          </Button>
          {alike && (
            <Button
              type="button"
              variant="outline"
              disabled={action.busy}
              onClick={() => void add(true)}
            >
              {t.anyway}
            </Button>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}
