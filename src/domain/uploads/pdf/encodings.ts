// The character encodings a simple PDF font may use, as Unicode text for each
// code, and the glyph names a font's /Differences give codes.

type Encoding = readonly (string | undefined)[];

function ascii(): (string | undefined)[] {
  const table: (string | undefined)[] = Array.from({ length: 256 });
  for (let code = 0x20; code < 0x7f; code++) table[code] = String.fromCharCode(code);
  return table;
}

function withHigh(base: (string | undefined)[], from: number, chars: string): Encoding {
  [...chars].forEach((char, i) => {
    if (char !== "\u0000") base[from + i] = char;
  });
  return base;
}

/** Windows code page 1252: Latin-1, with punctuation in 0x80–0x9F. */
export const WIN_ANSI: Encoding = (() => {
  const table = ascii();
  for (let code = 0xa0; code <= 0xff; code++) table[code] = String.fromCharCode(code);
  return withHigh(table, 0x80, "€\u0000‚ƒ„…†‡ˆ‰Š‹Œ\u0000Ž\u0000\u0000‘’“”•–—˜™š›œ\u0000žŸ");
})();

export const MAC_ROMAN: Encoding = withHigh(
  ascii(),
  0x80,
  "ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ",
);

/** Adobe's StandardEncoding, the default of a Type 1 font. */
export const STANDARD: Encoding = (() => {
  const table = ascii();
  table[0x27] = "’";
  table[0x60] = "‘";
  const high: [number, string][] = [
    [0xa1, "¡¢£⁄¥ƒ§¤'“«‹›ﬁﬂ"],
    [0xb1, "–†‡·"],
    [0xb6, "¶•‚„”»…‰"],
    [0xbf, "¿"],
    [0xc1, "`´ˆ˜¯˘˙¨"],
    [0xca, "˚¸"],
    [0xcd, "˝˛ˇ—"],
    [0xe1, "Æ"],
    [0xe3, "ª"],
    [0xe8, "ŁØŒº"],
    [0xf1, "æ"],
    [0xf5, "ı"],
    [0xf8, "łøœß"],
  ];
  for (const [from, chars] of high) withHigh(table, from, chars);
  return table;
})();

export function namedEncoding(name: string | null): Encoding | null {
  switch (name) {
    case "WinAnsiEncoding":
      return WIN_ANSI;
    case "MacRomanEncoding":
      return MAC_ROMAN;
    case "StandardEncoding":
      return STANDARD;
    default:
      return null;
  }
}

// Glyph names

const NAMED: Record<string, string> = {
  space: " ",
  nbspace: " ",
  exclam: "!",
  quotedbl: '"',
  numbersign: "#",
  dollar: "$",
  percent: "%",
  ampersand: "&",
  quotesingle: "'",
  parenleft: "(",
  parenright: ")",
  asterisk: "*",
  plus: "+",
  comma: ",",
  hyphen: "-",
  minus: "−",
  period: ".",
  slash: "/",
  colon: ":",
  semicolon: ";",
  less: "<",
  equal: "=",
  greater: ">",
  question: "?",
  at: "@",
  bracketleft: "[",
  backslash: "\\",
  bracketright: "]",
  asciicircum: "^",
  underscore: "_",
  grave: "`",
  braceleft: "{",
  bar: "|",
  braceright: "}",
  asciitilde: "~",
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  quoteleft: "‘",
  quoteright: "’",
  quotedblleft: "“",
  quotedblright: "”",
  quotesinglbase: "‚",
  quotedblbase: "„",
  endash: "–",
  emdash: "—",
  bullet: "•",
  ellipsis: "…",
  dagger: "†",
  daggerdbl: "‡",
  degree: "°",
  copyright: "©",
  registered: "®",
  trademark: "™",
  section: "§",
  paragraph: "¶",
  periodcentered: "·",
  guillemotleft: "«",
  guillemotright: "»",
  guilsinglleft: "‹",
  guilsinglright: "›",
  exclamdown: "¡",
  questiondown: "¿",
  cent: "¢",
  sterling: "£",
  yen: "¥",
  Euro: "€",
  euro: "€",
  currency: "¤",
  multiply: "×",
  divide: "÷",
  plusminus: "±",
  fraction: "⁄",
  germandbls: "ß",
  AE: "Æ",
  ae: "æ",
  OE: "Œ",
  oe: "œ",
  Oslash: "Ø",
  oslash: "ø",
  Lslash: "Ł",
  lslash: "ł",
  dotlessi: "ı",
  ordfeminine: "ª",
  ordmasculine: "º",
  mu: "µ",
  ff: "ff",
  fi: "fi",
  fl: "fl",
  ffi: "ffi",
  ffl: "ffl",
};

const ACCENTS: Record<string, string> = {
  acute: "́",
  grave: "̀",
  circumflex: "̂",
  dieresis: "̈",
  tilde: "̃",
  ring: "̊",
  cedilla: "̧",
  caron: "̌",
};

/** The text a glyph name stands for, by the Adobe Glyph List's rules; null if it is not known. */
export function glyphText(name: string): string | null {
  // A variant ("a.sc", "one.oldstyle") is its base glyph.
  const base = name.split(".")[0]!;
  if (!base) return null;
  // A ligature ("f_f_i") is its parts.
  if (base.includes("_")) {
    const parts = base.split("_").map(glyphText);
    return parts.every((part) => part !== null) ? parts.join("") : null;
  }
  if (base in NAMED) return NAMED[base]!;
  if (/^[A-Za-z]$/.test(base)) return base;
  const accented = /^([A-Za-z])(acute|grave|circumflex|dieresis|tilde|ring|cedilla|caron)$/.exec(
    base,
  );
  if (accented) return (accented[1]! + ACCENTS[accented[2]!]!).normalize("NFC");
  const uni = /^uni((?:[0-9A-F]{4})+)$/.exec(base);
  if (uni) {
    const units = uni[1]!.match(/.{4}/g)!.map((hex) => parseInt(hex, 16));
    return String.fromCharCode(...units);
  }
  const u = /^u([0-9A-F]{4,6})$/.exec(base);
  if (u) {
    const point = parseInt(u[1]!, 16);
    return point <= 0x10ffff ? String.fromCodePoint(point) : null;
  }
  return null;
}
