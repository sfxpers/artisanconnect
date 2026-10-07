import { useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { ImagePlus, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Refusal } from "@/components/page";
import { useAction } from "@/components/use-action";
import { cn } from "@/lib/utils";
import { MESSAGE_ATTACHMENTS_MAX, MESSAGE_MAX } from "@/domain/conversations/inputs";
import { copy, formatDate } from "@/web/copy";
import {
  openConversation,
  sendMessage,
  withdrawMessage,
  type getConversation,
  type getConversations,
} from "@/web/conversations";
import { shrinkPhoto } from "@/web/shrink-photo";

export type ConversationSummary = NonNullable<Awaited<ReturnType<typeof getConversations>>>[number];
export type ConversationView = NonNullable<Awaited<ReturnType<typeof getConversation>>>;
type Item = ConversationView["items"][number];

const t = copy.conversation;

/**
 * The Messages tab of the Job page (#125): the Client's Conversations, one
 * per Artisan, beside the one open; the Artisan's own. Events show as rows
 * that are not speech, and the viewer's messages being checked show to them
 * only.
 */
export function Messages({
  jobId,
  conversations,
  open,
  asClient,
}: {
  jobId: string;
  conversations: ConversationSummary[];
  open: ConversationView | null;
  asClient: boolean;
}) {
  if (conversations.length === 0) {
    return <p className="text-sm text-muted-foreground">{asClient ? t.none : t.noneArtisan}</p>;
  }
  const summary = conversations.find((each) => each.conversationId === open?.conversationId);
  return (
    <div className={cn("grid gap-4", asClient && "md:grid-cols-[14rem_1fr]")}>
      {asClient && (
        <ul className="space-y-1">
          {conversations.map((each) => (
            <li key={each.conversationId}>
              <Link
                to="/jobs/$jobId"
                params={{ jobId }}
                search={{ tab: "messages", conversation: each.conversationId }}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted",
                  each.conversationId === open?.conversationId && "bg-muted font-medium",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{each.with.name ?? t.noName}</span>
                {each.unread > 0 && <Badge>{t.unread(each.unread)}</Badge>}
                {!each.takesMessages && <Badge variant="secondary">{t.ended}</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {open && <Thread key={open.conversationId} view={open} unread={summary?.unread ?? 0} />}
    </div>
  );
}

/** One Conversation: what was said, oldest first, and the composer while it takes messages. */
function Thread({ view, unread }: { view: ConversationView; unread: number }) {
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);

  // Opening it reads what was delivered; the unread mark then goes on the next load.
  useEffect(() => {
    void openConversation({ data: { conversationId: view.conversationId } }).then(() => {
      if (unread > 0) void router.invalidate();
    });
  }, [view.conversationId, view.items.length, unread, router]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [view.items.length]);

  return (
    <Card className="min-w-0">
      <CardContent className="space-y-4">
        <div className="text-sm font-medium">{view.with.name ?? t.noName}</div>
        <ol className="max-h-[32rem] space-y-3 overflow-y-auto">
          {view.items.length === 0 && <li className="text-sm text-muted-foreground">{t.empty}</li>}
          {view.items.map((item) => (
            <li key={item.kind === "message" ? item.messageId : `${item.event}:${String(item.at)}`}>
              <ItemRow item={item} />
            </li>
          ))}
          <div ref={end} />
        </ol>
        {view.takesMessages ? (
          <Composer view={view} />
        ) : (
          <p className="text-sm text-muted-foreground">{t.readOnly}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ItemRow({ item }: { item: Item }) {
  const action = useAction();
  if (item.kind === "event") {
    return (
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span>
          {t.events[item.event]} · {formatDate(item.at)}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col gap-1", item.mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] space-y-2 rounded-2xl px-3 py-2 text-sm",
          item.mine ? "bg-primary text-primary-foreground" : "bg-muted",
          item.state !== "delivered" && "opacity-70",
        )}
      >
        {item.text && <p className="whitespace-pre-line break-words">{item.text}</p>}
        {item.photos.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5">
            {item.photos.map((photo, index) => (
              <a key={photo.id} href={photo.href} target="_blank" rel="noreferrer">
                <img
                  src={photo.thumbnailHref}
                  alt={t.photo(index + 1)}
                  className="aspect-[4/3] w-full rounded-lg object-cover"
                />
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {item.state === "held" && (
          <>
            <Badge variant="secondary">{t.beingChecked}</Badge>
            <span>{t.beingCheckedLead}</span>
            <Button
              size="xs"
              variant="ghost"
              disabled={action.busy}
              onClick={() =>
                void action.run(() => withdrawMessage({ data: { messageId: item.messageId } }))
              }
            >
              {t.withdraw}
            </Button>
          </>
        )}
        {item.state === "refused" && item.refused && (
          <span className="text-destructive">{t.refused(item.refused.reason)}</span>
        )}
        <span>{formatDate(item.at)}</span>
      </div>
      <Refusal message={action.refusal} />
    </div>
  );
}

/**
 * Writes a message. A refused send says why under it and keeps the draft;
 * the first time, it says first that the Admin may read the Conversation.
 */
function Composer({ view }: { view: ConversationView }) {
  const action = useAction();
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const input = useRef<HTMLInputElement>(null);

  async function send() {
    const form = new FormData();
    form.append("conversationId", view.conversationId);
    form.append("text", text);
    for (const file of await Promise.all(photos.map(shrinkPhoto))) form.append("photos", file);
    await action.run(
      () => sendMessage({ data: form }),
      () => {
        setText("");
        setPhotos([]);
        if (input.current) input.current.value = "";
      },
    );
  }

  return (
    <form
      className="space-y-2 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      {view.firstMessage && (
        <p className="flex gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          {t.adminMayRead}
        </p>
      )}
      <Textarea
        value={text}
        placeholder={t.placeholder}
        rows={3}
        maxLength={MESSAGE_MAX}
        onChange={(event) => setText(event.target.value)}
      />
      <input
        ref={input}
        id={`photos-${view.conversationId}`}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        multiple
        className="sr-only"
        onChange={(event) => setPhotos([...(event.target.files ?? [])])}
      />
      <Refusal message={action.refusal} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => input.current?.click()}
          disabled={action.busy}
        >
          <ImagePlus />
          {t.photos}
        </Button>
        {photos.length > 0 ? (
          <>
            <span className="text-xs text-muted-foreground">{t.photosChosen(photos.length)}</span>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => {
                setPhotos([]);
                if (input.current) input.current.value = "";
              }}
            >
              {t.clearPhotos}
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            {t.photosHint(MESSAGE_ATTACHMENTS_MAX)}
          </span>
        )}
        <Button
          type="submit"
          className="ml-auto"
          disabled={action.busy || (!text.trim() && photos.length === 0)}
        >
          {t.send}
        </Button>
      </div>
    </form>
  );
}
