import { useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { FileText, ImagePlus, Mic, Paperclip, ShieldAlert, Square } from "lucide-react";
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
 * only. Once Hired, the Engagement's also takes voice notes and PDFs (#131).
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
        {item.files.length > 0 && <MessageFiles files={item.files} />}
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

/** A message's voice notes, played where they are, and its PDFs, opened in a new tab. */
function MessageFiles({ files }: { files: Extract<Item, { kind: "message" }>["files"] }) {
  const pdfs = files.filter((file) => file.kind === "pdf");
  return (
    <ul className="space-y-2">
      {files.map((file) => (
        <li key={file.id}>
          {file.kind === "voice-note" ? (
            <div className="space-y-1">
              <div className="text-xs opacity-80">{t.voiceNote(file.seconds)}</div>
              <audio controls preload="none" src={file.href} className="w-64 max-w-full" />
            </div>
          ) : (
            <a
              href={file.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 underline-offset-2 hover:underline"
            >
              <FileText className="size-4" />
              {t.pdf(pdfs.indexOf(file) + 1)}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Writes a message. A refused send says why under it and keeps the draft;
 * the first time, it says first that the Admin may read the Conversation.
 * Before Payment it attaches photos; in the Engagement's, also PDFs and
 * voice notes, chosen or recorded here.
 */
function Composer({ view }: { view: ConversationView }) {
  const action = useAction();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const recorder = useVoiceRecorder((note) => setFiles((chosen) => [...chosen, note]));

  function clearFiles() {
    setFiles([]);
  }

  async function send() {
    const form = new FormData();
    form.append("conversationId", view.conversationId);
    form.append("text", text);
    // Anything else is drawn as a photo, which leaves a file the browser cannot draw as it is.
    const shrunk = await Promise.all(
      files.map((file) =>
        file.type === "application/pdf" || file.type.startsWith("audio/")
          ? file
          : shrinkPhoto(file),
      ),
    );
    for (const file of shrunk) form.append("files", file);
    await action.run(
      () => sendMessage({ data: form }),
      () => {
        setText("");
        clearFiles();
      },
    );
  }

  const busy = action.busy || recorder.seconds !== null;
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
          {view.afterPayment ? t.adminMayReadAfterPayment : t.adminMayRead}
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
        id={`files-${view.conversationId}`}
        type="file"
        accept={view.afterPayment ? `${PHOTO_TYPES},application/pdf,audio/*` : PHOTO_TYPES}
        multiple
        className="sr-only"
        onChange={(event) => {
          // Added to what is chosen or recorded already; the input empties to take the same file again.
          const picked = [...(event.target.files ?? [])];
          setFiles((chosen) => [...chosen, ...picked]);
          event.target.value = "";
        }}
      />
      <Refusal message={action.refusal ?? (recorder.failed ? t.cannotRecord : null)} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          {view.afterPayment ? <Paperclip /> : <ImagePlus />}
          {view.afterPayment ? t.attach : t.photos}
        </Button>
        {view.afterPayment &&
          (recorder.seconds === null ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void recorder.start()}
              disabled={action.busy || recorder.starting}
            >
              <Mic />
              {t.record}
            </Button>
          ) : (
            <Button type="button" size="sm" variant="destructive" onClick={recorder.stop}>
              <Square />
              {t.stopRecording(recorder.seconds)}
            </Button>
          ))}
        {files.length > 0 ? (
          <>
            <span className="text-xs text-muted-foreground">
              {view.afterPayment ? t.filesChosen(files.length) : t.photosChosen(files.length)}
            </span>
            <Button type="button" size="xs" variant="ghost" onClick={clearFiles}>
              {view.afterPayment ? t.clearFiles : t.clearPhotos}
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            {view.afterPayment
              ? t.filesHint(MESSAGE_ATTACHMENTS_MAX)
              : t.photosHint(MESSAGE_ATTACHMENTS_MAX)}
          </span>
        )}
        <Button
          type="submit"
          className="ml-auto"
          disabled={busy || (!text.trim() && files.length === 0)}
        >
          {t.send}
        </Button>
      </div>
    </form>
  );
}

const PHOTO_TYPES = "image/jpeg,image/png,image/webp,image/heic";

/** What a recording may be, the browser's first choice that it supports: Chrome and Firefox record Opus, Safari AAC. */
const RECORDING_TYPES = [
  { type: "audio/webm;codecs=opus", extension: "webm" },
  { type: "audio/ogg;codecs=opus", extension: "ogg" },
  { type: "audio/mp4", extension: "m4a" },
];

/**
 * The longest recording, a little under the 5 minutes a voice note may be
 * (`MAX_VOICE_NOTE_SECONDS` in the domain), as a recorder stops a moment late.
 */
const RECORDING_MAX_SECONDS = 5 * 60 - 2;

/**
 * Records a voice note from the microphone, stopping by itself before it is
 * too long; each recording is handed over as a file, to a callback that only
 * sets state. `seconds` is how long the one going has run, or null when none is.
 */
function useVoiceRecorder(onRecorded: (file: File) => void) {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);

  // Leaving the page stops the microphone.
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
    [],
  );

  async function start() {
    if (starting || recorder.current) return;
    setFailed(false);
    setStarting(true);
    let stream: MediaStream | null = null;
    let media: MediaRecorder;
    let format: (typeof RECORDING_TYPES)[number] | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      format = RECORDING_TYPES.find((each) => MediaRecorder.isTypeSupported(each.type));
      media = new MediaRecorder(stream, format && { mimeType: format.type });
    } catch {
      // No microphone allowed, or no recorder in this browser: the microphone is let go.
      for (const track of stream?.getTracks() ?? []) track.stop();
      setFailed(true);
      return;
    } finally {
      setStarting(false);
    }
    const tracks = stream.getTracks();
    const chunks: Blob[] = [];
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setSeconds(elapsed);
      if (elapsed >= RECORDING_MAX_SECONDS && media.state === "recording") media.stop();
    }, 250);
    media.ondataavailable = (event) => chunks.push(event.data);
    media.onstop = () => {
      clearInterval(timer);
      for (const track of tracks) track.stop();
      recorder.current = null;
      setSeconds(null);
      const type = media.mimeType || format?.type || "audio/webm";
      onRecorded(new File(chunks, `voice-note.${format?.extension ?? "webm"}`, { type }));
    };
    media.start();
    recorder.current = media;
    setSeconds(0);
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  return { seconds, failed, starting, start, stop };
}
