// ==YomiruExtension==
// @name         Mkissa (Anime)
// @version      v1.0.0
// @author       Yomiru
// @lang         all
// @license      MIT
// @icon         https://mkissa.to/favicon.ico
// @package      to.mkissa.anime
// @type         bangumi
// @webSite      https://mkissa.to
// @nsfw         false
// @description  Mkissa anime streaming provider with reverse-engineered client crypto decryption and multi-server playback.
// ==/YomiruExtension==

const PART_A_HEX = "d25f7115e4cd7d891b7d01e6cd4425b76873d16773221a2a15b8fb6000ce37b0";
const BUILD_ID = "180";
const WEEK_MS = 604800000;
const FIVE_MIN_MS = 300000;
const LANE_ANIME = "k7";
const BASE_CDN = "https://aln.youtube-anime.com/";

function getCrypto() {
  if (typeof CryptoJS !== "undefined") return CryptoJS;
  if (typeof globalThis !== "undefined" && globalThis.CryptoJS) return globalThis.CryptoJS;
  if (typeof window !== "undefined" && window.CryptoJS) return window.CryptoJS;
  throw new Error("CryptoJS is unavailable in execution context");
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToWordArray(bytes) {
  const C = getCrypto();
  const words = [];
  for (let i = 0; i < bytes.length; i += 4) {
    words.push(
      (bytes[i] << 24) |
      ((bytes[i + 1] || 0) << 16) |
      ((bytes[i + 2] || 0) << 8) |
      (bytes[i + 3] || 0)
    );
  }
  return C.lib.WordArray.create(words, bytes.length);
}

function wordArrayToBytes(wordArray) {
  const bytes = new Uint8Array(wordArray.sigBytes);
  for (let i = 0; i < wordArray.sigBytes; i++) {
    bytes[i] = (wordArray.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return bytes;
}

function gf128Mul(x, h) {
  const z = new Uint8Array(16);
  const v = new Uint8Array(h);
  for (let i = 0; i < 16; i++) {
    const byte = x[i];
    for (let bit = 7; bit >= 0; bit--) {
      if ((byte >>> bit) & 1) {
        for (let j = 0; j < 16; j++) z[j] ^= v[j];
      }
      const lsb = v[15] & 1;
      for (let j = 15; j > 0; j--) {
        v[j] = (v[j] >>> 1) | ((v[j - 1] & 1) << 7);
      }
      v[0] >>>= 1;
      if (lsb) v[0] ^= 0xe1;
    }
  }
  return z;
}

function generateBootToken(lane, epoch) {
  const C = getCrypto();
  const cT = "NmmeXF:" + BUILD_ID;
  const uT = lane + "+" + BUILD_ID + "+mkissa.to+mkissa+" + epoch;
  const partAWords = C.enc.Hex.parse(PART_A_HEX);
  const hmac1 = C.HmacSHA256(cT, partAWords);
  const hmac2 = C.HmacSHA256(uT, hmac1);
  return hmac2.toString(C.enc.Hex);
}

function deriveSessionKey(partBBase64) {
  const C = getCrypto();
  const partBWords = C.enc.Base64.parse(partBBase64);
  const partBBytes = wordArrayToBytes(partBWords);
  const partABytes = hexToBytes(PART_A_HEX);
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    key[i] = partBBytes[i] ^ partABytes[i];
  }
  return key;
}

function deriveIv(epoch, buildId, queryHash, timestamp, lane) {
  const C = getCrypto();
  const seed = epoch + ":" + buildId + ":" + queryHash + ":" + timestamp + ":" + lane;
  const hash = C.SHA256(seed);
  const bytes = wordArrayToBytes(hash);
  return bytes.slice(0, 12);
}

function encryptGcm(plaintextStr, keyBytes, ivBytes) {
  const C = getCrypto();
  const keyWA = bytesToWordArray(keyBytes);
  const plainBytes = [];
  for (let i = 0; i < plaintextStr.length; i++) {
    const code = plaintextStr.charCodeAt(i);
    if (code < 128) {
      plainBytes.push(code);
    } else if (code < 2048) {
      plainBytes.push((code >> 6) | 192, (code & 63) | 128);
    } else {
      plainBytes.push((code >> 12) | 224, ((code >> 6) & 63) | 128, (code & 63) | 128);
    }
  }
  const plainWA = bytesToWordArray(plainBytes);

  const ivWords = [
    (ivBytes[0] << 24) | (ivBytes[1] << 16) | (ivBytes[2] << 8) | ivBytes[3],
    (ivBytes[4] << 24) | (ivBytes[5] << 16) | (ivBytes[6] << 8) | ivBytes[7],
    (ivBytes[8] << 24) | (ivBytes[9] << 16) | (ivBytes[10] << 8) | ivBytes[11],
    2
  ];
  const ivWA = C.lib.WordArray.create(ivWords, 16);

  const enc = C.AES.encrypt(plainWA, keyWA, {
    iv: ivWA,
    mode: C.mode.CTR,
    padding: C.pad.NoPadding
  });

  const ciphertextBytes = wordArrayToBytes(enc.ciphertext);

  const zeroWA = C.lib.WordArray.create([0, 0, 0, 0], 16);
  const hEnc = C.AES.encrypt(zeroWA, keyWA, {
    mode: C.mode.ECB,
    padding: C.pad.NoPadding
  });
  const hBytes = wordArrayToBytes(hEnc.ciphertext);

  let y = new Uint8Array(16);
  for (let i = 0; i < ciphertextBytes.length; i += 16) {
    const block = new Uint8Array(16);
    for (let j = 0; j < 16 && (i + j) < ciphertextBytes.length; j++) {
      block[j] = ciphertextBytes[i + j];
    }
    for (let j = 0; j < 16; j++) y[j] ^= block[j];
    y = gf128Mul(y, hBytes);
  }

  const lenBlock = new Uint8Array(16);
  const bitLenC = ciphertextBytes.length * 8;
  lenBlock[12] = (bitLenC >>> 24) & 0xff;
  lenBlock[13] = (bitLenC >>> 16) & 0xff;
  lenBlock[14] = (bitLenC >>> 8) & 0xff;
  lenBlock[15] = bitLenC & 0xff;
  for (let j = 0; j < 16; j++) y[j] ^= lenBlock[j];
  y = gf128Mul(y, hBytes);

  const j0Words = [
    (ivBytes[0] << 24) | (ivBytes[1] << 16) | (ivBytes[2] << 8) | ivBytes[3],
    (ivBytes[4] << 24) | (ivBytes[5] << 16) | (ivBytes[6] << 8) | ivBytes[7],
    (ivBytes[8] << 24) | (ivBytes[9] << 16) | (ivBytes[10] << 8) | ivBytes[11],
    1
  ];
  const j0WA = C.lib.WordArray.create(j0Words, 16);
  const j0Enc = C.AES.encrypt(j0WA, keyWA, {
    mode: C.mode.ECB,
    padding: C.pad.NoPadding
  });
  const j0Bytes = wordArrayToBytes(j0Enc.ciphertext);

  const tag = new Uint8Array(16);
  for (let j = 0; j < 16; j++) tag[j] = y[j] ^ j0Bytes[j];

  const packet = new Uint8Array(1 + 12 + ciphertextBytes.length + 16);
  packet[0] = 1;
  packet.set(ivBytes, 1);
  packet.set(ciphertextBytes, 13);
  packet.set(tag, 13 + ciphertextBytes.length);

  return bytesToWordArray(packet).toString(C.enc.Base64);
}

function decryptTobeparsed(b64, keyBytes) {
  const C = getCrypto();
  const rawWA = C.enc.Base64.parse(b64);
  const rawBytes = wordArrayToBytes(rawWA);

  const version = rawBytes[0];
  if (version !== 1) throw new Error("Invalid tobeparsed version: " + version);

  const ivBytes = rawBytes.slice(1, 13);
  const ciphertextBytes = rawBytes.slice(13, rawBytes.length - 16);

  const keyWA = bytesToWordArray(keyBytes);
  const ctWA = bytesToWordArray(ciphertextBytes);

  const ivWords = [
    (ivBytes[0] << 24) | (ivBytes[1] << 16) | (ivBytes[2] << 8) | ivBytes[3],
    (ivBytes[4] << 24) | (ivBytes[5] << 16) | (ivBytes[6] << 8) | ivBytes[7],
    (ivBytes[8] << 24) | (ivBytes[9] << 16) | (ivBytes[10] << 8) | ivBytes[11],
    2
  ];
  const ivWA = C.lib.WordArray.create(ivWords, 16);

  const dec = C.AES.encrypt(ctWA, keyWA, {
    iv: ivWA,
    mode: C.mode.CTR,
    padding: C.pad.NoPadding
  });

  const plainBytes = wordArrayToBytes(dec.ciphertext);
  let str = "";
  for (let i = 0; i < plainBytes.length; i++) {
    str += String.fromCharCode(plainBytes[i]);
  }
  return JSON.parse(decodeURIComponent(escape(str)));
}

export default class extends Extension {
  constructor() {
    super();
    this.session = null;
  }

  async load() {
    await this.registerSetting({
      title: "Mkissa URL",
      key: "mkissa_url",
      type: "input",
      description: "Base homepage URL for Mkissa mirror",
      defaultValue: "https://mkissa.to",
    });

    await this.registerSetting({
      title: "Preferred Audio",
      key: "preferred_audio",
      type: "radio",
      description: "Default audio preference (sub or dub)",
      defaultValue: "sub",
    });
  }

  async getBaseUrl() {
    const custom = await this.getSetting("mkissa_url");
    return (custom && custom.trim()) ? custom.trim().replace(/\/+$/, "") : "https://mkissa.to";
  }

  resolveCover(path) {
    if (!path) return "";
    const trimmed = String(path).trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    if (trimmed.startsWith("//")) return "https:" + trimmed;
    const clean = trimmed.replace(/^\/+/, "");
    if (clean.startsWith("mcovers/") || clean.includes("_tbs/")) return BASE_CDN + clean;
    return BASE_CDN + "mcovers/" + clean;
  }

  async gql(query, variables = {}, extensions = null) {
    const body = { query, variables };
    if (extensions) body.extensions = extensions;

    const res = await this.request("https://api.mkissa.net/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://mkissa.to",
        "Referer": "https://mkissa.to/",
        "x-build-id": BUILD_ID,
      },
      data: JSON.stringify(body),
    });

    const parsed = typeof res === "string" ? JSON.parse(res) : res;
    return parsed;
  }

  async getSession() {
    const now = Date.now();
    if (this.session && this.session.switchAt && now < this.session.switchAt) {
      return this.session;
    }

    const epoch = Math.floor(now / WEEK_MS);
    const bootToken = generateBootToken(LANE_ANIME, epoch);

    const bootRes = await this.request(
      `https://api.mkissa.net/client-crypto/v1/bootstrap?buildId=${BUILD_ID}&k=${LANE_ANIME}`,
      {
        method: "GET",
        headers: {
          "Origin": "https://mkissa.to",
          "Referer": "https://mkissa.to/",
          "x-build-id": BUILD_ID,
          "x-aa-boot": bootToken,
        },
      }
    );

    const bootData = typeof bootRes === "string" ? JSON.parse(bootRes) : bootRes;
    if (!bootData || !bootData.partB) {
      throw new Error("Failed to bootstrap crypto session for anime lane");
    }

    const sessionKey = deriveSessionKey(bootData.partB);
    this.session = {
      epoch: bootData.epoch || epoch,
      sessionKey,
      switchAt: bootData.switchAt || now + 3600000,
    };

    return this.session;
  }

  async popular(page) {
    const query = `
query ($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) {
  shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) {
    edges {
      _id
      name
      thumbnail
      englishName
      nativeName
      score
    }
  }
}
`;
    const res = await this.gql(query, {
      page: page || 1,
      limit: 26,
      translationType: "sub",
      countryOrigin: "ALL",
      search: { sortBy: "Top" },
    });

    const edges = (res && res.data && res.data.shows && res.data.shows.edges) || [];
    return edges.map((e) => ({
      title: e.name || e.englishName || e.nativeName || "Anime",
      url: e._id,
      cover: this.resolveCover(e.thumbnail),
    }));
  }

  async latest(page) {
    const query = `
query ($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) {
  shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) {
    edges {
      _id
      name
      thumbnail
      englishName
      nativeName
      score
    }
  }
}
`;
    const res = await this.gql(query, {
      page: page || 1,
      limit: 26,
      translationType: "sub",
      countryOrigin: "ALL",
      search: {},
    });

    const edges = (res && res.data && res.data.shows && res.data.shows.edges) || [];
    return edges.map((e) => ({
      title: e.name || e.englishName || e.nativeName || "Anime",
      url: e._id,
      cover: this.resolveCover(e.thumbnail),
    }));
  }

  async search(kw, page, filter) {
    let cleanKw = "";
    if (typeof kw === "object" && kw !== null) {
      cleanKw = kw.englishTitle || kw.nativeTitle || kw.query || "";
    } else {
      cleanKw = (kw || "").trim();
    }

    if (!cleanKw) return this.popular(page);

    const query = `
query ($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) {
  shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) {
    edges {
      _id
      name
      thumbnail
      englishName
      nativeName
      score
    }
  }
}
`;
    const res = await this.gql(query, {
      page: page || 1,
      limit: 26,
      translationType: "sub",
      countryOrigin: "ALL",
      search: { query: cleanKw },
    });

    const edges = (res && res.data && res.data.shows && res.data.shows.edges) || [];
    return edges.map((e) => ({
      title: e.name || e.englishName || e.nativeName || "Anime",
      url: e._id,
      cover: this.resolveCover(e.thumbnail),
    }));
  }

  async detail(url) {
    const showId = url.replace(/.*\/anime\//, "").replace(/\/.*/, "").trim();

    const query = `
query ($_id: String!) {
  show(_id: $_id) {
    _id
    name
    englishName
    nativeName
    thumbnail
    banner
    description
    genres
    status
    score
    availableEpisodesDetail
  }
}
`;
    const res = await this.gql(query, { _id: showId });
    const show = (res && res.data && res.data.show) || {};

    const title = show.name || show.englishName || show.nativeName || "Anime";
    const cover = this.resolveCover(show.thumbnail);
    const desc = (show.description || "").replace(/<[^>]+>/g, " ").trim();

    const subList = (show.availableEpisodesDetail && show.availableEpisodesDetail.sub) || [];
    const dubList = (show.availableEpisodesDetail && show.availableEpisodesDetail.dub) || [];

    const sortAsc = (arr) => [...arr].sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));

    const episodes = [];

    if (subList.length > 0) {
      episodes.push({
        title: "Subtitled",
        urls: sortAsc(subList).map((ep) => ({
          name: `Episode ${ep}`,
          url: `${showId};${ep};sub`,
        })),
      });
    }

    if (dubList.length > 0) {
      episodes.push({
        title: "Dubbed",
        urls: sortAsc(dubList).map((ep) => ({
          name: `Episode ${ep}`,
          url: `${showId};${ep};dub`,
        })),
      });
    }

    if (episodes.length === 0) {
      episodes.push({
        title: "Episodes",
        urls: [{ name: "Episode 1", url: `${showId};1;sub` }],
      });
    }

    return {
      title,
      cover,
      desc,
      episodes,
    };
  }

  async watch(episodeId) {
    const parts = String(episodeId).split(";");
    const showId = parts[0];
    const episodeString = parts[1] || "1";
    const preferredLang = (await this.getSetting("preferred_audio")) || "sub";
    const translationType = parts[2] || preferredLang;

    const C = getCrypto();
    const session = await this.getSession();

    const query = `
query(
  $showId: String!
  $translationType: VaildTranslationTypeEnumType!
  $episodeString: String!
) {
  episode(
    showId: $showId
    translationType: $translationType
    episodeString: $episodeString
  ) {
    episodeString
    uploadDate
    sourceUrls
    thumbnail
    notes
    show {
      _id
      name
      countryOfOrigin
    }
  }
}
`;
    const qh = C.SHA256(query).toString(C.enc.Hex);
    const ts = Math.floor(Date.now() / FIVE_MIN_MS) * FIVE_MIN_MS;
    const iv = deriveIv(session.epoch, BUILD_ID, qh, ts, LANE_ANIME);
    const payload = JSON.stringify({
      v: 1,
      ts,
      epoch: session.epoch,
      buildId: BUILD_ID,
      qh,
      k: LANE_ANIME,
    });

    const aaReq = encryptGcm(payload, session.sessionKey, iv);

    const gqlRes = await this.gql(
      query,
      { showId, translationType, episodeString },
      {
        persistedQuery: { version: 1, sha256Hash: qh },
        k: LANE_ANIME,
        aaReq,
      }
    );

    if (!gqlRes || !gqlRes.data || !gqlRes.data.tobeparsed) {
      throw new Error("Unable to decrypt episode stream sources from Mkissa");
    }

    const decrypted = decryptTobeparsed(gqlRes.data.tobeparsed, session.sessionKey);
    const rawSources = (decrypted && decrypted.episode && decrypted.episode.sourceUrls) || [];

    if (rawSources.length === 0) {
      throw new Error("No streaming sources available for this episode");
    }

    const sources = rawSources.map((s) => ({
      name: s.sourceName || "Server",
      url: s.sourceUrl || s.url || "",
      type: (s.sourceUrl || "").includes(".m3u8") ? "hls" : "iframe",
      priority: typeof s.priority === "number" ? s.priority : 0,
    })).sort((a, b) => b.priority - a.priority);

    const primary = sources.find((s) => s.type === "hls") || sources[0];

    return {
      url: primary.url,
      type: primary.type,
      headers: {
        Referer: "https://mkissa.to/",
        Origin: "https://mkissa.to",
      },
      sources,
    };
  }
}
