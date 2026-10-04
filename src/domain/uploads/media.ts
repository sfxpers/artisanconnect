import { ascii, need, startsWith, Unreadable, viewOf } from "./bytes";

// WebM, Ogg, and MP4 hold sound, pictures, or both. A voice note is one of
// them with only sound in it; anything with a picture track is video. Only the
// container is read, never the sound itself: enough to know what is in it and
// how long it plays.

export type MediaContainer = "webm" | "ogg" | "mp4";

export type Media =
  | { kind: "audio"; container: MediaContainer; seconds: number }
  | { kind: "video" }
  /** A track that is neither sound nor picture, or none at all. */
  | { kind: "other" };

export function mediaContainer(bytes: Uint8Array): MediaContainer | null {
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "webm";
  if (startsWith(bytes, "OggS")) return "ogg";
  if (startsWith(bytes, "ftyp", 4)) return "mp4";
  return null;
}

export function readMedia(bytes: Uint8Array, container: MediaContainer): Media {
  switch (container) {
    case "webm":
      return readWebm(bytes);
    case "ogg":
      return readOgg(bytes);
    case "mp4":
      return readMp4(bytes);
  }
}

/** Takes the longest of the lengths a file states and its tracks show, so a file cannot understate itself. */
function audio(container: MediaContainer, seconds: number[]): Media {
  return { kind: "audio", container, seconds: Math.max(0, ...seconds.filter(Number.isFinite)) };
}

// WebM (Matroska): EBML elements, each an id, a size, and its content.

const EBML = {
  header: 0x1a45dfa3,
  docType: 0x4282,
  segment: 0x18538067,
  info: 0x1549a966,
  timecodeScale: 0x2ad7b1,
  duration: 0x4489,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackType: 0x83,
  cluster: 0x1f43b675,
  timecode: 0xe7,
  simpleBlock: 0xa3,
  blockGroup: 0xa0,
  block: 0xa1,
  blockDuration: 0x9b,
  attachments: 0x1941a469,
} as const;

/** Elements that sit directly in a Segment; one of these ends a Cluster of unknown size. */
const SEGMENT_CHILDREN: ReadonlySet<number> = new Set([
  0x114d9b74, // SeekHead
  EBML.info,
  EBML.tracks,
  EBML.cluster,
  0x1c53bb6b, // Cues
  EBML.attachments,
  0x1043a770, // Chapters
  0x1254c367, // Tags
  EBML.header,
  EBML.segment,
]);

const TRACK_TYPE = { video: 1, audio: 2 } as const;

type Element = { id: number; start: number; dataStart: number; end: number; unknownSize: boolean };

function readVint(bytes: Uint8Array, at: number, keepMarker: boolean) {
  need(bytes, at, 1);
  const first = bytes[at]!;
  const length = Math.clz32(first) - 23;
  if (length < 1 || length > 8) throw new Unreadable("Bad EBML number.");
  need(bytes, at, length);
  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = value === 0xff >> length;
  for (let i = 1; i < length; i++) {
    const byte = bytes[at + i]!;
    value = value * 256 + byte;
    allOnes &&= byte === 0xff;
  }
  return { value, length, allOnes };
}

function readElement(bytes: Uint8Array, at: number, parentEnd: number): Element {
  const id = readVint(bytes, at, true);
  const size = readVint(bytes, at + id.length, false);
  const dataStart = at + id.length + size.length;
  if (size.allOnes)
    return { id: id.value, start: at, dataStart, end: parentEnd, unknownSize: true };
  const end = dataStart + size.value;
  if (end > parentEnd) throw new Unreadable("An element runs past its parent.");
  return { id: id.value, start: at, dataStart, end, unknownSize: false };
}

function* children(bytes: Uint8Array, start: number, end: number): Generator<Element> {
  for (let at = start; at < end;) {
    const element = readElement(bytes, at, end);
    yield element;
    at = element.end;
  }
}

function readUint(bytes: Uint8Array, element: Element): number {
  let value = 0;
  for (let i = element.dataStart; i < element.end; i++) value = value * 256 + bytes[i]!;
  return value;
}

function readWebm(bytes: Uint8Array): Media {
  const header = readElement(bytes, 0, bytes.length);
  const docType = [...children(bytes, header.dataStart, header.end)].find(
    (e) => e.id === EBML.docType,
  );
  const type = docType && ascii(bytes, docType.dataStart, docType.end - docType.dataStart);
  if (type !== "webm" && type !== "matroska") return { kind: "other" };
  const segment = readElement(bytes, header.end, bytes.length);
  if (segment.id !== EBML.segment) throw new Unreadable("No Segment.");

  let timecodeScale = 1_000_000;
  let statedDuration = 0;
  let lastBlock = 0;
  const trackTypes: number[] = [];
  for (let at = segment.dataStart; at < segment.end;) {
    const element = readElement(bytes, at, segment.end);
    switch (element.id) {
      case EBML.info:
        for (const field of children(bytes, element.dataStart, element.end)) {
          if (field.id === EBML.timecodeScale) timecodeScale = readUint(bytes, field);
          if (field.id === EBML.duration) statedDuration = readFloat(bytes, field);
        }
        break;
      case EBML.tracks:
        for (const entry of children(bytes, element.dataStart, element.end)) {
          if (entry.id !== EBML.trackEntry) continue;
          const type = [...children(bytes, entry.dataStart, entry.end)].find(
            (e) => e.id === EBML.trackType,
          );
          trackTypes.push(type ? readUint(bytes, type) : 0);
        }
        break;
      case EBML.cluster: {
        const cluster = readCluster(bytes, element);
        lastBlock = Math.max(lastBlock, cluster.lastBlock);
        element.end = cluster.end;
        break;
      }
      case EBML.attachments:
        // Matroska can carry whole files inside it.
        return { kind: "other" };
    }
    if (element.unknownSize && element.id !== EBML.cluster) {
      throw new Unreadable("Only a Cluster may have an unknown size.");
    }
    at = element.end;
  }

  if (trackTypes.includes(TRACK_TYPE.video)) return { kind: "video" };
  if (trackTypes.length === 0 || trackTypes.some((t) => t !== TRACK_TYPE.audio)) {
    return { kind: "other" };
  }
  const toSeconds = timecodeScale / 1e9;
  return audio("webm", [statedDuration * toSeconds, lastBlock * toSeconds]);
}

/** The time of a Cluster's last block, and where the Cluster ends if its size was unknown. */
function readCluster(bytes: Uint8Array, cluster: Element) {
  let timecode = 0;
  let lastBlock = 0;
  let at = cluster.dataStart;
  while (at < cluster.end) {
    const element = readElement(bytes, at, cluster.end);
    if (cluster.unknownSize && SEGMENT_CHILDREN.has(element.id)) break;
    if (element.id === EBML.timecode) timecode = readUint(bytes, element);
    if (element.id === EBML.simpleBlock) {
      lastBlock = Math.max(lastBlock, timecode + blockTime(bytes, element.dataStart));
    }
    if (element.id === EBML.blockGroup) {
      let time = 0;
      let duration = 0;
      for (const part of children(bytes, element.dataStart, element.end)) {
        if (part.id === EBML.block) time = blockTime(bytes, part.dataStart);
        if (part.id === EBML.blockDuration) duration = readUint(bytes, part);
      }
      lastBlock = Math.max(lastBlock, timecode + time + duration);
    }
    at = element.end;
  }
  return { lastBlock, end: at };
}

/** A block starts with its track number, then its time relative to its Cluster. */
function blockTime(bytes: Uint8Array, at: number): number {
  const track = readVint(bytes, at, false);
  need(bytes, at + track.length, 2);
  return viewOf(bytes).getInt16(at + track.length);
}

function readFloat(bytes: Uint8Array, element: Element): number {
  const view = viewOf(bytes);
  const size = element.end - element.dataStart;
  if (size === 4) return view.getFloat32(element.dataStart);
  if (size === 8) return view.getFloat64(element.dataStart);
  throw new Unreadable("Bad EBML float.");
}

// Ogg: pages, each belonging to one logical stream. The first page of each
// stream names its codec; a page's granule position is the samples played by
// its end.

function readOgg(bytes: Uint8Array): Media {
  const view = viewOf(bytes);
  const streams = new Map<number, { rate: number; preSkip: number; lastGranule: bigint }>();
  let video = false;
  let other = false;
  for (let at = 0; at < bytes.length;) {
    need(bytes, at, 27);
    if (!startsWith(bytes, "OggS", at) || bytes[at + 4] !== 0)
      throw new Unreadable("Bad Ogg page.");
    const flags = bytes[at + 5]!;
    const granule = view.getBigInt64(at + 6, true);
    const serial = view.getUint32(at + 14, true);
    const segments = bytes[at + 26]!;
    need(bytes, at + 27, segments);
    const lacing = bytes.subarray(at + 27, at + 27 + segments);
    const bodyStart = at + 27 + segments;
    const bodyLength = lacing.reduce((sum, n) => sum + n, 0);
    need(bytes, bodyStart, bodyLength);

    if (flags & 0x02) {
      const codec = oggCodec(bytes, bodyStart, bodyLength);
      if (codec.kind === "video") video = true;
      else if (codec.kind === "other") other = true;
      else streams.set(serial, { ...codec, lastGranule: 0n });
    } else if (!streams.has(serial) && !video && !other) {
      throw new Unreadable("An Ogg page belongs to no stream.");
    }
    const stream = streams.get(serial);
    if (stream && granule > stream.lastGranule) stream.lastGranule = granule;
    at = bodyStart + bodyLength;
  }
  if (video) return { kind: "video" };
  if (other || streams.size === 0) return { kind: "other" };
  // Chained streams play one after another.
  const seconds = [...streams.values()].reduce(
    (sum, s) => sum + Math.max(0, Number(s.lastGranule) - s.preSkip) / s.rate,
    0,
  );
  return audio("ogg", [seconds]);
}

function oggCodec(bytes: Uint8Array, at: number, length: number) {
  const view = viewOf(bytes);
  if (startsWith(bytes, "OpusHead", at) && length >= 19) {
    // Opus granules always count 48 kHz samples, whatever the input rate.
    return { kind: "audio" as const, rate: 48_000, preSkip: view.getUint16(at + 10, true) };
  }
  if (startsWith(bytes, "\x01vorbis", at) && length >= 16) {
    const rate = view.getUint32(at + 12, true);
    if (rate === 0) throw new Unreadable("A Vorbis stream with no rate.");
    return { kind: "audio" as const, rate, preSkip: 0 };
  }
  if (
    startsWith(bytes, "\x80theora", at) ||
    startsWith(bytes, "\x80daala", at) ||
    startsWith(bytes, "OVP80", at)
  ) {
    return { kind: "video" as const };
  }
  return { kind: "other" as const };
}

// MP4 (ISO base media): boxes, each a size, a four-letter type, and its
// content. Each track's handler says what it holds. A recording made in a
// browser is fragmented: its length is in its fragments, not its header.

const IMAGE_BRANDS = new Set([
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "mif1",
  "msf1",
  "avif",
  "avis",
]);
const VIDEO_HANDLERS = new Set(["vide", "pict", "auxv"]);

type Box = { type: string; start: number; dataStart: number; end: number };

function* boxes(bytes: Uint8Array, start: number, end: number): Generator<Box> {
  const view = viewOf(bytes);
  for (let at = start; at < end;) {
    need(bytes, at, 8);
    let size = view.getUint32(at);
    const type = ascii(bytes, at + 4, 4);
    let header = 8;
    if (size === 1) {
      need(bytes, at, 16);
      size = Number(view.getBigUint64(at + 8));
      header = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < header || at + size > end) throw new Unreadable("A box runs past its parent.");
    yield { type, start: at, dataStart: at + header, end: at + size };
    at += size;
  }
}

function child(bytes: Uint8Array, parent: Box, type: string): Box | undefined {
  for (const box of boxes(bytes, parent.dataStart, parent.end)) if (box.type === type) return box;
  return undefined;
}

/** A full box's version, then a time scale and duration laid out as in mvhd and mdhd. */
function timing(bytes: Uint8Array, box: Box): { timescale: number; duration: number } {
  const view = viewOf(bytes);
  const version = bytes[box.dataStart];
  if (version === 1) {
    need(bytes, box.dataStart, 32);
    const duration = view.getBigUint64(box.dataStart + 24);
    return {
      timescale: view.getUint32(box.dataStart + 20),
      duration: duration === 0xffffffffffffffffn ? 0 : Number(duration),
    };
  }
  need(bytes, box.dataStart, 20);
  const duration = view.getUint32(box.dataStart + 16);
  return {
    timescale: view.getUint32(box.dataStart + 12),
    duration: duration === 0xffffffff ? 0 : duration,
  };
}

function readMp4(bytes: Uint8Array): Media {
  const view = viewOf(bytes);
  const top = [...boxes(bytes, 0, bytes.length)];
  const ftyp = top[0]!;
  need(bytes, ftyp.dataStart, 4);
  if (IMAGE_BRANDS.has(ascii(bytes, ftyp.dataStart, 4))) return { kind: "other" };
  const moov = top.find((b) => b.type === "moov");
  if (!moov) throw new Unreadable("No movie header.");

  const seconds: number[] = [];
  const movie = child(bytes, moov, "mvhd");
  const movieTiming = movie ? timing(bytes, movie) : { timescale: 0, duration: 0 };
  if (movieTiming.timescale) seconds.push(movieTiming.duration / movieTiming.timescale);

  const tracks = new Map<number, { timescale: number; defaultDuration: number; end: number }>();
  const handlers: string[] = [];
  for (const trak of boxes(bytes, moov.dataStart, moov.end)) {
    if (trak.type !== "trak") continue;
    const tkhd = child(bytes, trak, "tkhd");
    const mdia = child(bytes, trak, "mdia");
    const hdlr = mdia && child(bytes, mdia, "hdlr");
    const mdhd = mdia && child(bytes, mdia, "mdhd");
    if (!tkhd || !hdlr || !mdhd) throw new Unreadable("A track without its headers.");
    need(bytes, tkhd.dataStart, 24);
    need(bytes, hdlr.dataStart, 12);
    handlers.push(ascii(bytes, hdlr.dataStart + 8, 4));
    const { timescale, duration } = timing(bytes, mdhd);
    if (timescale) seconds.push(duration / timescale);
    const trackId = view.getUint32(tkhd.dataStart + (bytes[tkhd.dataStart] === 1 ? 20 : 12));
    tracks.set(trackId, { timescale, defaultDuration: 0, end: 0 });
  }
  if (handlers.some((h) => VIDEO_HANDLERS.has(h))) return { kind: "video" };
  if (handlers.length === 0 || handlers.some((h) => h !== "soun")) return { kind: "other" };

  const mvex = child(bytes, moov, "mvex");
  if (mvex) {
    for (const box of boxes(bytes, mvex.dataStart, mvex.end)) {
      if (box.type === "mehd" && movieTiming.timescale) {
        const fragmentDuration =
          bytes[box.dataStart] === 1
            ? Number(view.getBigUint64(box.dataStart + 4))
            : view.getUint32(box.dataStart + 4);
        seconds.push(fragmentDuration / movieTiming.timescale);
      }
      if (box.type === "trex") {
        need(bytes, box.dataStart, 16);
        const track = tracks.get(view.getUint32(box.dataStart + 4));
        if (track) track.defaultDuration = view.getUint32(box.dataStart + 12);
      }
    }
  }
  for (const moof of top) {
    if (moof.type !== "moof") continue;
    for (const traf of boxes(bytes, moof.dataStart, moof.end)) {
      if (traf.type === "traf") readFragment(bytes, traf, tracks);
    }
  }
  for (const track of tracks.values()) {
    if (track.timescale) seconds.push(track.end / track.timescale);
  }
  return audio("mp4", seconds);
}

/** Moves a track's end to the end of this fragment of it. */
function readFragment(
  bytes: Uint8Array,
  traf: Box,
  tracks: Map<number, { timescale: number; defaultDuration: number; end: number }>,
) {
  const view = viewOf(bytes);
  const tfhd = child(bytes, traf, "tfhd");
  if (!tfhd) throw new Unreadable("A fragment without its header.");
  need(bytes, tfhd.dataStart, 8);
  const tfhdFlags = view.getUint32(tfhd.dataStart) & 0xffffff;
  const track = tracks.get(view.getUint32(tfhd.dataStart + 4));
  if (!track) throw new Unreadable("A fragment of no track.");
  let defaultDuration = track.defaultDuration;
  if (tfhdFlags & 0x08) {
    let at = tfhd.dataStart + 8;
    if (tfhdFlags & 0x01) at += 8;
    if (tfhdFlags & 0x02) at += 4;
    need(bytes, at, 4);
    defaultDuration = view.getUint32(at);
  }
  const tfdt = child(bytes, traf, "tfdt");
  let time = track.end;
  if (tfdt) {
    need(bytes, tfdt.dataStart, 8);
    time =
      bytes[tfdt.dataStart] === 1
        ? Number(view.getBigUint64(tfdt.dataStart + 4))
        : view.getUint32(tfdt.dataStart + 4);
  }
  for (const trun of boxes(bytes, traf.dataStart, traf.end)) {
    if (trun.type !== "trun") continue;
    need(bytes, trun.dataStart, 8);
    const flags = view.getUint32(trun.dataStart) & 0xffffff;
    const count = view.getUint32(trun.dataStart + 4);
    let at = trun.dataStart + 8;
    if (flags & 0x01) at += 4;
    if (flags & 0x04) at += 4;
    const fields = [0x100, 0x200, 0x400, 0x800].filter((f) => flags & f).length;
    if (!(flags & 0x100)) {
      // Every sample has the default duration; a huge count costs nothing to add up.
      time += count * defaultDuration;
      continue;
    }
    need(bytes, at, count * fields * 4);
    for (let i = 0; i < count; i++, at += fields * 4) time += view.getUint32(at);
  }
  track.end = Math.max(track.end, time);
}
