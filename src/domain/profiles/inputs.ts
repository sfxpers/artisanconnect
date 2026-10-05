// Shared with the web app's form, so an edit is refused the same way in both.
// Nothing here may import what only runs on the server.

import * as z from "zod";

/** The most characters a Profile's About text may have. */
export const ABOUT_MAX = 1000;

/** The most work photos a Profile may hold. */
export const PROFILE_PHOTOS_MAX = 10;

/** The About text, trimmed. */
export const aboutText = z
  .string({ error: "Write the About text." })
  .trim()
  .max(ABOUT_MAX, { error: `Keep the About text to ${ABOUT_MAX} characters.` });
