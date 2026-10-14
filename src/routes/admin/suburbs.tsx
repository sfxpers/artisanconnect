import { useState } from "react";
import { toast } from "sonner";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { useAppForm } from "@/components/form";
import { Page, Refusal, withSidebar } from "@/components/page";
import { useAction } from "@/components/use-action";
import { cn } from "@/lib/utils";
import { addSuburb, getAdminSuburbs } from "@/web/admin";
import { copy, pageTitle } from "@/web/copy";
import { onlyForAdmins } from "@/web/guards";
import { Choose } from "@/components/choose";

export const Route = createFileRoute("/admin/suburbs")({
  beforeLoad: ({ context }) => {
    onlyForAdmins(context);
  },
  loader: () => getAdminSuburbs(),
  head: () => ({ meta: [{ title: pageTitle(t.title) }] }),
  component: Suburbs,
});

const t = copy.admin.suburbs;

type Region = Awaited<ReturnType<typeof getAdminSuburbs>>[number];

/** Every Region's suburbs, and adding one the City creates; none is ever moved, renamed, or removed (#142). */
function Suburbs() {
  const regions = Route.useLoaderData();
  const total = regions.reduce((sum, region) => sum + region.suburbs.length, 0);
  return (
    <Page title={t.title} lead={t.lead}>
      <div className={withSidebar}>
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
          onClick={() => setOpen(!open)}
        >
          <span className="text-muted-foreground">{t.count(region.suburbs.length)}</span>
          <span className="sr-only">{t.inRegion(region.name)}</span>
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
  const [alike, setAlike] = useState(false);
  const form = useAppForm({
    defaultValues: { name: "", regionId: "" },
    listeners: { onChange: () => setAlike(false) },
    onSubmit: ({ value }) => add(value, false),
  });

  function add({ name, regionId }: typeof form.state.values, despiteAlike: boolean) {
    const region = regions.find((each) => each.id === regionId)?.name ?? "";
    return action.run(
      async () => {
        const result = await addSuburb({ data: { name, regionId, despiteAlike } });
        // A name that reads like another's is added only when asked again.
        setAlike(!result.ok && result.refusal.reason === "reads-alike");
        return result;
      },
      () => {
        toast.success(t.added(name.trim().replace(/\s+/g, " "), region));
        form.setFieldValue("name", "");
      },
    );
  }

  return (
    <Card size="sm" className="self-start">
      <CardHeader>
        <CardTitle>{t.add}</CardTitle>
        <CardDescription>{t.addLead}</CardDescription>
      </CardHeader>
      <form.AppForm>
        {/* The form holds the content and the footer, so it keeps the card's gap between them. */}
        <form.Form className="space-y-4">
          <CardContent className="space-y-3">
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  label={t.name}
                  autoComplete="off"
                  placeholder={t.namePlaceholder}
                />
              )}
            </form.AppField>
            <form.Field name="regionId">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="suburb-region">{t.region}</FieldLabel>
                  <Choose
                    id="suburb-region"
                    value={field.state.value}
                    onChange={field.handleChange}
                    placeholder={t.chooseRegion}
                    options={regions.map((region) => ({ value: region.id, label: region.name }))}
                  />
                </Field>
              )}
            </form.Field>
            <Refusal message={action.refusal} />
          </CardContent>
          <CardFooter className="flex-wrap gap-2 pt-4">
            <form.Subscribe
              selector={(state) => !!state.values.name.trim() && !!state.values.regionId}
            >
              {(ready) => <form.Submit disabled={!ready}>{t.submit}</form.Submit>}
            </form.Subscribe>
            {alike && (
              <Button
                type="button"
                variant="outline"
                disabled={action.busy}
                onClick={() => void add(form.state.values, true)}
              >
                {t.anyway}
              </Button>
            )}
          </CardFooter>
        </form.Form>
      </form.AppForm>
    </Card>
  );
}
