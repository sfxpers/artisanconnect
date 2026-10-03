// PROTOTYPE, throwaway. Behaviour shared by the three variants. No layout here.
import { useState } from "react";
import * as F from "./fixtures";

export type VariantProps = { screen: F.ScreenKey; go: (s: F.ScreenKey) => void };

/** A rand amount typed by a person, clamped to (0, max]. */
export function useAmount(initialCents: number, maxCents: number) {
  const [text, setText] = useState(String(initialCents / 100));
  const parsed = Number.parseFloat(text.replace(/[^\d.]/g, ""));
  const cents = Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  return {
    text,
    setText,
    setCents: (c: number) => setText(String(c / 100)),
    cents,
    valid: cents > 0 && cents <= maxCents,
  };
}

/** A Conversation composer that refuses a send carrying a withheld fact. */
export function useComposer(initialDraft = F.conversationDraft) {
  const [messages, setMessages] = useState(F.conversation);
  const [draft, setDraft] = useState(initialDraft);
  const [refused, setRefused] = useState<string | null>(null);
  const [refusedCount, setRefusedCount] = useState(0);
  const send = () => {
    const why = F.refusedBecause(draft);
    if (why) {
      setRefused(why);
      setRefusedCount((n) => n + 1);
      return;
    }
    if (!draft.trim()) return;
    setMessages((m) => [...m, { from: "Client", text: draft.trim(), at: "now" }]);
    setDraft("");
    setRefused(null);
  };
  return {
    messages,
    draft,
    setDraft: (t: string) => {
      setDraft(t);
      setRefused(null);
    },
    refused,
    refusedCount,
    send,
  };
}

/** The Release ledger after Completion, with a Client who Releases in parts. */
export function useRelease() {
  const [releases, setReleases] = useState(F.release.releases);
  const released = releases.reduce((s, r) => s + r.amount, 0);
  const unreleased = F.release.quoteTotal - released;
  const amount = useAmount(unreleased, unreleased);
  const doRelease = () => {
    if (!amount.valid) return;
    setReleases((r) => [...r, { at: "now", amount: amount.cents }]);
    amount.setCents(Math.max(0, unreleased - amount.cents));
  };
  return { releases, released, unreleased, amount, doRelease };
}

/** Review scores, whole numbers 1 to 5, all four required. */
export function useReview() {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const refused = F.refusedBecause(comment);
  const complete = F.REVIEW_DIMENSIONS.every((d) => scores[d.key]);
  return {
    scores,
    setScore: (k: string, v: number) => setScores((s) => ({ ...s, [k]: v })),
    comment,
    setComment,
    refused,
    canSubmit: complete && !refused,
    submitted,
    submit: () => complete && !refused && setSubmitted(true),
  };
}

/** Post a Job: the answers that make it matchable. */
export function usePostJob() {
  const [category, setCategory] = useState<F.Category | "">("Plumbing");
  const [gas, setGas] = useState<boolean | null>(null);
  const [ack, setAck] = useState(false);
  const [siteType, setSiteType] = useState<"Home" | "Business" | null>(null);
  const [address, setAddress] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [preferredStart, setPreferredStart] = useState("");
  const [posted, setPosted] = useState(false);

  const region = !address.trim()
    ? null
    : /paarl|stellenbosch|joburg|johannesburg|durban/i.test(address)
      ? "unplaceable"
      : "Southern";
  const leak = F.refusedBecause(`${title}\n${description}`);
  const missing = [
    !category && "a Service Category",
    category === "Plumbing" && gas === null && "the gas answer",
    category === "Electrical" && !ack && "the installation acknowledgement",
    !siteType && "the Site type",
    (!region || region === "unplaceable") && "a site we can place",
    !title.trim() && "a title",
    !description.trim() && "a description",
    photos.length === 0 && "a photo of the work",
  ].filter(Boolean) as string[];

  return {
    category,
    setCategory: (c: F.Category | "") => {
      setCategory(c);
      if (c !== "Plumbing") setGas(null);
      if (c !== "Electrical") setAck(false);
    },
    gas,
    setGas,
    ack,
    setAck,
    siteType,
    setSiteType,
    address,
    setAddress,
    region,
    title,
    setTitle,
    description,
    setDescription,
    photos,
    addPhoto: () => setPhotos((p) => [...p, `Photo ${p.length + 1}`]),
    removePhoto: (i: number) => setPhotos((p) => p.filter((_, j) => j !== i)),
    preferredStart,
    setPreferredStart,
    leak,
    missing,
    canPost: missing.length === 0 && !leak,
    posted,
    post: () => setPosted(true),
    fillExample: () => {
      setCategory("Plumbing");
      setGas(true);
      setSiteType("Home");
      setAddress("14 Rosmead Avenue, Kenilworth");
      setTitle(F.job.title);
      setDescription(F.job.description);
      setPhotos([...F.job.photos]);
      setPreferredStart("2026-10-12");
    },
  };
}

/** The Client's Quote comparison: sent order, or rearranged by total or duration. */
export function useQuotes() {
  const [order, setOrder] = useState<"sent" | "total" | "duration">("sent");
  const [quotes, setQuotes] = useState(F.quotes);
  const [pending, setPending] = useState<typeof F.pendingDates | null>(F.pendingDates);
  const sorted = [...quotes].sort((a, b) => {
    if (order === "total") return F.quoteTotal(a) - F.quoteTotal(b);
    if (order === "duration")
      return (a.durationDays ?? Number.POSITIVE_INFINITY) - (b.durationDays ?? Number.POSITIVE_INFINITY);
    return 0;
  });
  const accepted = quotes.find((q) => q.status === "Accepted");
  return {
    order,
    setOrder,
    quotes: sorted,
    pending,
    accepted,
    sendDates: (id: string) => setPending({ ...F.pendingDates, quoteId: id, sentAt: "now" }),
    cancelDates: () => setPending(null),
    decline: (id: string) =>
      setQuotes((qs) => qs.map((q) => (q.id === id ? { ...q, status: "Declined" } : q))),
    /** Stand-in for the Artisan confirming the dates the Client entered. */
    artisanConfirms: () => {
      if (!pending) return;
      setQuotes((qs) =>
        qs.map((q) =>
          q.id === pending.quoteId
            ? { ...q, status: "Accepted" }
            : q.status === "Sent"
              ? { ...q, status: "Not chosen" }
              : q,
        ),
      );
      setPending(null);
    },
    reset: () => {
      setQuotes(F.quotes);
      setPending(F.pendingDates);
    },
  };
}
