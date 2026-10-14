// The server functions that take files take FormData; these read its fields.

/** A field's text, or undefined when it was left out or is a file. */
export function textOf(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

/** The files sent under a name, leaving out an empty one a file input sends when none is chosen. */
export function filesOf(form: FormData, name: string): File[] {
  return form
    .getAll(name)
    .filter((value): value is File => value instanceof File && value.size > 0);
}
