const { core, event, overlay, file, preferences, utils } = iina;

var overlayLoaded = false;
var overlayVisible = false;
var pauseTimer = null;
var pauseStartedAt = 0;
var waitingForMetadata = false;
var activeLookupToken = 0;
var currentMedia = null;
var lastSourceSignature = "";
var lastLookupKey = "";

var parser = (function() {
  var VIDEO_EXTENSION_RE = /\.(mkv|mp4|m4v|avi|mov|wmv|mpg|mpeg|ts|m2ts|webm|flv)$/i;
  var EPISODE_PATTERNS = [
    /\bS(\d{1,2})\s*E(\d{1,2})(?:\s*E\d{1,2})?\b/i,
    /\b(\d{1,2})x(\d{1,2})(?:x\d{1,2})?\b/i,
    /\bSeason\s*(\d{1,2})\s*Episode\s*(\d{1,2})\b/i
  ];
  var YEAR_RE = /\b(19\d{2}|20\d{2})\b/;
  var NOISE_RE = /\b(?:2160p|1080p|720p|480p|4k|8k|bluray|blu-ray|bdrip|brrip|dvdrip|webrip|web[- ]?dl|hdrip|hdtv|remux|x264|x265|h\.?264|h\.?265|hevc|av1|aac(?:2\.0)?|ac3|eac3|dts(?:-?hd)?|truehd|ddp(?:5\.1|7\.1)?|atmos|10bit|8bit|proper|repack|extended|unrated|criterion|amzn|nf|dsnp|hmax|max|atvp|multi|subs?|dubbed|yts|rarbg|internal|limited|readnfo|complete)\b/i;
  var SEASON_FOLDER_RE = /^season[\s._-]*\d+$/i;
  var GENERIC_FOLDER_RE = /^(tv|shows|series|movies|films|video|videos)$/i;

  function safeDecode(text) {
    if (!text) return "";
    try {
      return decodeURIComponent(text);
    } catch (_error) {
      return text;
    }
  }

  function getPathFromUrl(url) {
    var raw = String(url || "");
    if (/^[a-z]+:\/\//i.test(raw)) {
      raw = raw.replace(/[?#].*$/, "");
    }
    var value = safeDecode(raw);
    value = value.replace(/^file:\/\//i, "");
    return value;
  }

  function stripExtension(name) {
    return String(name || "").replace(VIDEO_EXTENSION_RE, "");
  }

  function normalizeWhitespace(text) {
    return String(text || "")
      .replace(/[\[\]{}()]/g, " ")
      .replace(/[._]+/g, " ")
      .replace(/\s+-\s+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function trimNoise(text) {
    var value = normalizeWhitespace(text);
    var match = value.match(NOISE_RE);
    if (match && typeof match.index === "number") {
      value = value.slice(0, match.index).trim();
    }
    return value.replace(/[-\s]+$/g, "").trim();
  }

  function extractYear(text) {
    var match = String(text || "").match(YEAR_RE);
    return match ? parseInt(match[1], 10) : null;
  }

  function removeYear(text) {
    return normalizeWhitespace(String(text || "").replace(YEAR_RE, " "));
  }

  function prettifyTitle(text) {
    var value = trimNoise(text);
    return value.replace(/\b([A-Za-z])([A-Za-z']*)\b/g, function(_match, first, rest) {
      return first.toUpperCase() + rest.toLowerCase();
    });
  }

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function splitSegments(path) {
    return String(path || "")
      .split("/")
      .filter(function(part) { return !!part; });
  }

  function findSeriesFolder(segments) {
    for (var index = segments.length - 1; index >= 0; index -= 1) {
      var candidate = stripExtension(safeDecode(segments[index]));
      var cleaned = normalizeWhitespace(candidate);
      if (!cleaned) continue;
      if (SEASON_FOLDER_RE.test(cleaned)) continue;
      if (GENERIC_FOLDER_RE.test(cleaned)) continue;
      return cleaned;
    }
    return "";
  }

  function buildEpisodeLookupKey(showTitle, year, season, episode) {
    return ["episode", slugify(showTitle), year || "", season || "", episode || ""].join("|");
  }

  function buildMovieLookupKey(title, year) {
    return ["movie", slugify(title), year || ""].join("|");
  }

  function parseEpisodeFromName(baseName, parentSegments) {
    var cleanedName = normalizeWhitespace(baseName);
    var match = null;

    for (var index = 0; index < EPISODE_PATTERNS.length; index += 1) {
      match = cleanedName.match(EPISODE_PATTERNS[index]);
      if (match) break;
    }

    if (!match || typeof match.index !== "number") return null;

    var rawShowTitle = cleanedName.slice(0, match.index).trim();
    var rawEpisodeTitle = cleanedName.slice(match.index + match[0].length).trim();
    var season = parseInt(match[1], 10);
    var episode = parseInt(match[2], 10);
    var parentShowTitle = findSeriesFolder(parentSegments);
    var year = extractYear(rawShowTitle) || extractYear(parentShowTitle);
    var showTitle = prettifyTitle(removeYear(rawShowTitle || parentShowTitle));
    var episodeTitle = prettifyTitle(trimNoise(rawEpisodeTitle));

    if (!showTitle && parentShowTitle) {
      showTitle = prettifyTitle(removeYear(parentShowTitle));
    }

    if (!showTitle) return null;

    return {
      kind: "episode",
      showTitle: showTitle,
      season: season,
      episode: episode,
      episodeTitle: episodeTitle || "",
      year: year,
      lookupKey: buildEpisodeLookupKey(showTitle, year, season, episode)
    };
  }

  function parseMovieFromName(baseName, parentSegments) {
    var cleanedName = normalizeWhitespace(baseName);
    if (!cleanedName) return null;

    var yearMatch = cleanedName.match(YEAR_RE);
    var noiseMatch = cleanedName.match(NOISE_RE);
    var cutIndex = cleanedName.length;
    var year = null;

    if (yearMatch && typeof yearMatch.index === "number") {
      year = parseInt(yearMatch[1], 10);
      cutIndex = Math.min(cutIndex, yearMatch.index);
    }
    if (noiseMatch && typeof noiseMatch.index === "number") {
      cutIndex = Math.min(cutIndex, noiseMatch.index);
    }

    var rawTitle = cleanedName.slice(0, cutIndex).trim();
    var parentTitle = findSeriesFolder(parentSegments);
    var title = prettifyTitle(removeYear(rawTitle || parentTitle));

    if (!title && parentTitle) {
      title = prettifyTitle(removeYear(parentTitle));
    }
    if (!title) return null;

    return {
      kind: "movie",
      title: title,
      year: year || extractYear(parentTitle),
      lookupKey: buildMovieLookupKey(title, year || extractYear(parentTitle))
    };
  }

  function parseNameLike(value) {
    var path = getPathFromUrl(value);
    var segments = splitSegments(path);
    var fileName = segments.length ? segments[segments.length - 1] : path;
    var baseName = stripExtension(fileName);
    var parentSegments = segments.slice(0, -1);
    var episode = parseEpisodeFromName(baseName, parentSegments);
    var movie = parseMovieFromName(baseName, parentSegments);

    if (episode) return episode;
    if (movie) return movie;

    var fallbackTitle = prettifyTitle(baseName);
    if (!fallbackTitle) return null;

    return {
      kind: "unknown",
      title: fallbackTitle,
      lookupKey: buildMovieLookupKey(fallbackTitle, null)
    };
  }

  function parseMediaFromSource(url, title) {
    var fromUrl = parseNameLike(url || "");
    var fromTitle = parseNameLike(title || "");

    if (fromUrl && fromUrl.kind !== "unknown") return fromUrl;
    if (fromTitle && fromTitle.kind !== "unknown") return fromTitle;
    return fromUrl || fromTitle || null;
  }

  return {
    parseMediaFromSource: parseMediaFromSource
  };
})();

var cacheLib = (function() {
  var CACHE_PATH = "@data/cache.json";

  function createEmptyCache() {
    return {
      version: 1,
      entries: {}
    };
  }

  function createCacheStore(fileApi) {
    var cache = null;

    function ensureLoaded() {
      if (cache) return cache;

      if (!fileApi.exists(CACHE_PATH)) {
        cache = createEmptyCache();
        return cache;
      }

      try {
        cache = JSON.parse(fileApi.read(CACHE_PATH) || "{}");
      } catch (_error) {
        cache = createEmptyCache();
      }

      if (!cache || typeof cache !== "object" || !cache.entries) {
        cache = createEmptyCache();
      }

      return cache;
    }

    function persist() {
      fileApi.write(CACHE_PATH, JSON.stringify(cache, null, 2));
    }

    return {
      get: function(key) {
        if (!key) return null;
        var state = ensureLoaded();
        return state.entries[key] || null;
      },
      setMany: function(keys, value) {
        var state = ensureLoaded();
        keys.forEach(function(key) {
          if (!key) return;
          state.entries[key] = value;
        });
        persist();
      }
    };
  }

  return {
    createCacheStore: createCacheStore
  };
})();

var tmdb = (function() {
  var API_ROOT = "https://api.themoviedb.org/3";

  function normalizeText(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenSet(text) {
    var normalized = normalizeText(text);
    if (!normalized) return [];
    return normalized.split(" ").filter(Boolean);
  }

  function overlapScore(expected, actual) {
    var expectedTokens = tokenSet(expected);
    var actualTokens = tokenSet(actual);
    if (!expectedTokens.length || !actualTokens.length) return 0;

    var actualIndex = {};
    var intersection = 0;
    var union = {};

    actualTokens.forEach(function(token) {
      actualIndex[token] = true;
      union[token] = true;
    });
    expectedTokens.forEach(function(token) {
      union[token] = true;
      if (actualIndex[token]) intersection += 1;
    });

    var unionSize = Object.keys(union).length || 1;
    var containment = intersection / expectedTokens.length;
    var jaccard = intersection / unionSize;
    return (containment * 0.65) + (jaccard * 0.35);
  }

  function extractYear(dateString) {
    var value = String(dateString || "");
    if (!/^\d{4}/.test(value)) return null;
    return parseInt(value.slice(0, 4), 10);
  }

  function cleanParams(params) {
    var output = {};
    Object.keys(params || {}).forEach(function(key) {
      var value = params[key];
      if (value === undefined || value === null || value === "") return;
      output[key] = value;
    });
    return output;
  }

  function encodeParams(params) {
    return Object.keys(params || {})
      .map(function(key) {
        return encodeURIComponent(key) + "=" + encodeURIComponent(String(params[key]));
      })
      .join("&");
  }

  function debugUrl(path, params) {
    var query = encodeParams(params);
    return API_ROOT + path + (query ? ("?" + query) : "");
  }

  function authOptions(auth, params) {
    var token = String(auth || "").trim();
    var clean = cleanParams(params || {});
    var options = {
      headers: {
        Accept: "application/json"
      }
    };

    if (!token) {
      throw new Error("TMDB authentication is missing");
    }

    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) || token.length > 48) {
      options.headers.Authorization = "Bearer " + token;
    } else {
      clean.api_key = token;
    }

    options.query = clean;
    return options;
  }

  async function requestJson(_httpApi, auth, path, params) {
    var options = authOptions(auth, params);
    var url = debugUrl(path, options.query);
    var marker = "__PAUSE_MEDIA_INFO_STATUS__:";
    var curlArgs = [
      "-sS",
      "-L",
      "-H", "Accept: application/json"
    ];

    if (options.headers.Authorization) {
      curlArgs.push("-H", "Authorization: " + options.headers.Authorization.replace(/^Bearer\s+/, "Bearer "));
    }

    curlArgs.push("-w", "\n" + marker + "%{http_code}");
    curlArgs.push(url);

    log("TMDB GET " + url);
    var response = await utils.exec("/usr/bin/curl", curlArgs);
    var stdout = response.stdout || "";
    var stderr = response.stderr || "";
    var markerIndex = stdout.lastIndexOf(marker);
    var rawText = markerIndex >= 0 ? stdout.slice(0, markerIndex).trim() : stdout.trim();
    var statusCode = markerIndex >= 0 ? parseInt(stdout.slice(markerIndex + marker.length).trim(), 10) : 0;
    var body = null;

    if (response.status !== 0) {
      log("TMDB curl error " + path + ": " + errStr(stderr || response.status));
      throw new Error(stderr || ("curl failed with status " + response.status));
    }

    if (rawText) {
      log("TMDB raw " + path + " " + rawText.slice(0, 280));
      try {
        body = JSON.parse(rawText);
      } catch (error) {
        log("TMDB parse failure " + path + ": " + errStr(error));
        body = null;
      }
    }

    if (!body) {
      body = {};
    }

    log("TMDB " + statusCode + " " + path);

    if (statusCode >= 400 || !statusCode) {
      throw new Error(body.status_message || ("TMDB error " + statusCode));
    }

    return body;
  }

  function scoreMovie(parsed, candidate) {
    var titleScore = Math.max(
      overlapScore(parsed.title, candidate.title),
      overlapScore(parsed.title, candidate.original_title)
    );
    var expectedYear = parsed.year;
    var actualYear = extractYear(candidate.release_date);
    var yearScore = 0;

    if (expectedYear && actualYear) {
      if (expectedYear === actualYear) yearScore = 1;
      else if (Math.abs(expectedYear - actualYear) === 1) yearScore = 0.5;
      else yearScore = -0.35;
    }

    return (titleScore * 1.0) + (yearScore * 0.25);
  }

  function scoreShow(parsed, candidate) {
    var titleScore = Math.max(
      overlapScore(parsed.showTitle, candidate.name),
      overlapScore(parsed.showTitle, candidate.original_name)
    );
    var expectedYear = parsed.year;
    var actualYear = extractYear(candidate.first_air_date);
    var yearScore = 0;

    if (expectedYear && actualYear) {
      if (expectedYear === actualYear) yearScore = 1;
      else if (Math.abs(expectedYear - actualYear) === 1) yearScore = 0.5;
      else yearScore = -0.35;
    }

    return (titleScore * 1.0) + (yearScore * 0.25);
  }

  function pickBest(results, scorer) {
    var ranked = (results || [])
      .map(function(result) {
        return {
          result: result,
          score: scorer(result)
        };
      })
      .sort(function(left, right) {
        if (right.score !== left.score) return right.score - left.score;
        return (right.result.popularity || 0) - (left.result.popularity || 0);
      });

    if (!ranked.length) return null;
    if (ranked[0].score < 0.3) return null;
    return ranked[0].result;
  }

  function logCandidates(label, results, kind, scorer) {
    var ranked = (results || [])
      .map(function(result) {
        return {
          id: result.id,
          name: kind === "movie" ? (result.title || result.original_title || "") : (result.name || result.original_name || ""),
          year: kind === "movie" ? extractYear(result.release_date) : extractYear(result.first_air_date),
          score: scorer(result)
        };
      })
      .sort(function(left, right) {
        return right.score - left.score;
      })
      .slice(0, 5);

    if (!ranked.length) {
      log(label + " candidates: none");
      return;
    }

    log(label + " candidates: " + ranked.map(function(item) {
      return "#" + item.id + " " + item.name + (item.year ? " (" + item.year + ")" : "") + " score=" + item.score.toFixed(3);
    }).join(" | "));
  }

  async function fetchMovie(httpApi, auth, parsed, language) {
    var search = await requestJson(httpApi, auth, "/search/movie", {
      query: parsed.title,
      year: parsed.year || undefined,
      language: language,
      include_adult: false
    });
    logCandidates("TMDB movie search", search.results, "movie", function(candidate) {
      return scoreMovie(parsed, candidate);
    });
    var chosen = pickBest(search.results, function(candidate) {
      return scoreMovie(parsed, candidate);
    });

    if (!chosen && parsed.year) {
      search = await requestJson(httpApi, auth, "/search/movie", {
        query: parsed.title,
        language: language,
        include_adult: false
      });
      logCandidates("TMDB movie fallback search", search.results, "movie", function(candidate) {
        return scoreMovie(parsed, candidate);
      });
      chosen = pickBest(search.results, function(candidate) {
        return scoreMovie(parsed, candidate);
      });
    }

    if (!chosen) {
      throw new Error("No TMDB movie match was found");
    }

    var details = await requestJson(httpApi, auth, "/movie/" + chosen.id, {
      language: language
    });

    return {
      kind: "movie",
      source: "tmdb",
      tmdbId: details.id,
      primaryTitle: details.title || parsed.title,
      secondaryTitle: String(extractYear(details.release_date) || parsed.year || "Movie"),
      tertiaryTitle: details.tagline || "",
      summary: details.overview || "No synopsis available for this movie yet."
    };
  }

  async function fetchEpisode(httpApi, auth, parsed, language) {
    var search = await requestJson(httpApi, auth, "/search/tv", {
      query: parsed.showTitle,
      first_air_date_year: parsed.year || undefined,
      language: language,
      include_adult: false
    });
    logCandidates("TMDB tv search", search.results, "tv", function(candidate) {
      return scoreShow(parsed, candidate);
    });
    var chosen = pickBest(search.results, function(candidate) {
      return scoreShow(parsed, candidate);
    });

    if (!chosen && parsed.year) {
      search = await requestJson(httpApi, auth, "/search/tv", {
        query: parsed.showTitle,
        language: language,
        include_adult: false
      });
      logCandidates("TMDB tv fallback search", search.results, "tv", function(candidate) {
        return scoreShow(parsed, candidate);
      });
      chosen = pickBest(search.results, function(candidate) {
        return scoreShow(parsed, candidate);
      });
    }

    if (!chosen) {
      throw new Error("No TMDB show match was found");
    }

    var episode = await requestJson(httpApi, auth, "/tv/" + chosen.id + "/season/" + parsed.season + "/episode/" + parsed.episode, {
      language: language
    });
    var summary = episode.overview || "";

    if (!summary) {
      var series = await requestJson(httpApi, auth, "/tv/" + chosen.id, {
        language: language
      });
      summary = series.overview || "";
    }

    return {
      kind: "episode",
      source: "tmdb",
      tmdbId: chosen.id,
      primaryTitle: chosen.name || parsed.showTitle,
      secondaryTitle: "Season " + parsed.season + ": Ep. " + parsed.episode,
      tertiaryTitle: episode.name || parsed.episodeTitle || "",
      summary: summary || "No synopsis available for this episode yet."
    };
  }

  async function fetchMetadata(httpApi, auth, parsed, language) {
    if (parsed.kind === "episode") {
      return fetchEpisode(httpApi, auth, parsed, language);
    }
    return fetchMovie(httpApi, auth, parsed, language);
  }

  return {
    fetchMetadata: fetchMetadata
  };
})();

var cache = cacheLib.createCacheStore(file);
var DEBUG_LOG_PATH = "@data/debug.log";
var CACHE_POLICY_TMDB = "tmdb";
var CACHE_POLICY_NO_AUTH = "fallback-no-auth";
var CACHE_POLICY_ERROR = "fallback-error";
var CACHE_POLICY_NO_MATCH = "fallback-no-match";
var ERROR_RETRY_MS = 6 * 60 * 60 * 1000;
var NO_MATCH_RETRY_MS = 7 * 24 * 60 * 60 * 1000;

function errStr(error) {
  if (error == null) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || String(error);
  if (typeof error === "object" && typeof error.message === "string") return error.message;
  try {
    return JSON.stringify(error);
  } catch (_stringifyError) {
    return String(error);
  }
}

function prefString(key, fallbackValue) {
  var value = preferences.get(key);
  if (value == null || value === "") return fallbackValue;
  return String(value);
}

function prefNumber(key, fallbackValue) {
  var value = preferences.get(key);
  if (typeof value === "number" && !isNaN(value)) return value;
  var parsed = parseFloat(value);
  return isNaN(parsed) ? fallbackValue : parsed;
}

function prefBool(key, fallbackValue) {
  var value = preferences.get(key);
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallbackValue;
}

function appendDebugLog(message) {
  var line = "[" + new Date().toISOString() + "] " + message;
  try {
    var existing = file.exists(DEBUG_LOG_PATH) ? (file.read(DEBUG_LOG_PATH) || "") : "";
    var next = existing + line + "\n";
    if (next.length > 24000) {
      next = next.slice(next.length - 24000);
    }
    file.write(DEBUG_LOG_PATH, next);
  } catch (_error) {}
}

function log(message) {
  iina.console.log("[PauseCard] " + message);
  appendDebugLog("[PauseCard] " + message);
}

function debugEnabled() {
  return prefBool("debug_osd", false);
}

function debugOsd(message) {
  if (!debugEnabled()) return;
  try {
    core.osd("Pause Card: " + message);
  } catch (_error) {}
}

function wrapEvent(label, fn) {
  return function() {
    var args = arguments;
    Promise.resolve().then(function() {
      return fn.apply(null, args);
    }).catch(function(error) {
      var message = label + ": " + errStr(error);
      log(message);
      debugOsd(message);
    });
  };
}

function ensureOverlayLoaded() {
  if (overlayLoaded) return;
  overlay.loadFile("overlay.html");
  overlayLoaded = true;
}

function getCurrentSource() {
  var url = "";
  var title = "";

  try {
    url = core.status.url || "";
  } catch (_error) {}

  try {
    title = core.status.title || "";
  } catch (_error2) {}

  return {
    url: String(url || ""),
    title: String(title || "")
  };
}

function buildFallbackDisplay(parsed, message) {
  if (!parsed) {
    return {
      primaryTitle: "Unknown Title",
      secondaryTitle: "",
      tertiaryTitle: "",
      summary: message || "This file name could not be classified automatically.",
      source: "fallback"
    };
  }

  if (parsed.kind === "episode") {
    return {
      kind: "episode",
      source: "fallback",
      primaryTitle: parsed.showTitle,
      secondaryTitle: "Season " + parsed.season + ": Ep. " + parsed.episode,
      tertiaryTitle: parsed.episodeTitle || "",
      summary: message || "Automatic metadata lookup is waiting for TMDB credentials."
    };
  }

  return {
    kind: parsed.kind,
    source: "fallback",
    primaryTitle: parsed.title,
    secondaryTitle: parsed.year ? String(parsed.year) : "Movie",
    tertiaryTitle: "",
    summary: message || "Automatic metadata lookup is waiting for TMDB credentials."
  };
}

function cacheKeysFor(source, parsed) {
  var keys = [];
  if (source && source.url) keys.push("url|" + source.url);
  if (parsed && parsed.lookupKey) keys.push("lookup|" + parsed.lookupKey);
  return keys;
}

function parseTimeValue(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  var parsed = Date.parse(String(value));
  return isNaN(parsed) ? 0 : parsed;
}

function buildRetryAfter(msFromNow) {
  return new Date(Date.now() + msFromNow).toISOString();
}

function cachePolicyForFailure(error) {
  var message = errStr(error);
  if (/No TMDB/.test(message)) return CACHE_POLICY_NO_MATCH;
  return CACHE_POLICY_ERROR;
}

function retryAfterForPolicy(policy) {
  if (policy === CACHE_POLICY_NO_MATCH) return buildRetryAfter(NO_MATCH_RETRY_MS);
  if (policy === CACHE_POLICY_ERROR) return buildRetryAfter(ERROR_RETRY_MS);
  return null;
}

function shouldUseCachedEntry(entry) {
  var auth = prefString("tmdb_auth", "").trim();
  if (!entry) return false;
  if (!entry.policy) {
    if (entry.source === "tmdb") return true;
    return !auth;
  }
  if (entry.policy === CACHE_POLICY_TMDB || entry.source === "tmdb") return true;
  if (!auth) return true;
  if (entry.policy === CACHE_POLICY_NO_AUTH) return false;
  if (entry.policy === CACHE_POLICY_ERROR || entry.policy === CACHE_POLICY_NO_MATCH) {
    return Date.now() < parseTimeValue(entry.retryAfter);
  }
  return false;
}

function getCachedEntry(source, parsed) {
  var keys = cacheKeysFor(source, parsed);
  for (var index = 0; index < keys.length; index += 1) {
    var entry = cache.get(keys[index]);
    if (entry && shouldUseCachedEntry(entry)) {
      return entry;
    }
  }
  return null;
}

function persistDisplay(source, parsed, display, options) {
  var settings = options || {};
  cache.setMany(cacheKeysFor(source, parsed), {
    policy: settings.policy || (display.source === "tmdb" ? CACHE_POLICY_TMDB : CACHE_POLICY_ERROR),
    retryAfter: settings.retryAfter || null,
    lastError: settings.lastError || null,
    source: display.source || "fallback",
    savedAt: new Date().toISOString(),
    display: display
  });
}

function clearPauseTimer() {
  if (!pauseTimer) return;
  clearTimeout(pauseTimer);
  pauseTimer = null;
}

function hideOverlay() {
  clearPauseTimer();
  waitingForMetadata = false;
  if (overlayLoaded) {
    overlay.postMessage("hideData", {});
    overlay.hide();
  }
  overlayVisible = false;
}

function overlayDelayElapsed() {
  if (!pauseStartedAt) return false;
  return Date.now() - pauseStartedAt >= (prefNumber("pause_delay_seconds", 0.8) * 1000);
}

function showOverlay(display) {
  if (!display || !prefBool("overlay_enabled", true)) return;
  ensureOverlayLoaded();
  overlay.show();
  overlay.postMessage("showData", {
    eyebrow: "You're Watching",
    primaryTitle: display.primaryTitle || "",
    secondaryTitle: display.secondaryTitle || "",
    tertiaryTitle: display.tertiaryTitle || "",
    summary: display.summary || "",
    summaryLines: Math.max(2, Math.min(8, Math.round(prefNumber("synopsis_lines", 4))))
  });
  overlayVisible = true;
}

function refreshOverlayIfNeeded() {
  if (!currentMedia || !currentMedia.display) return;
  if (!core.status.paused) return;
  if (overlayVisible) {
    showOverlay(currentMedia.display);
    return;
  }
  if (waitingForMetadata && overlayDelayElapsed() && currentMedia.status !== "loading") {
    showOverlay(currentMedia.display);
  }
}

function tmdbNotice() {
  return "Add a TMDB API key or read access token in IINA Settings > Plugins > Pause Card.";
}

function lookupFailureNotice(error) {
  var message = errStr(error);
  if (/No TMDB/.test(message)) {
    return "No matching synopsis was found on TMDB for this file.";
  }
  if (/TMDB authentication is missing/.test(message)) {
    return tmdbNotice();
  }
  return "TMDB lookup failed. Check your credentials and network access.";
}

function parsedLabel(parsed) {
  if (!parsed) return "unparsed";
  if (parsed.kind === "episode") {
    return parsed.showTitle + " S" + parsed.season + "E" + parsed.episode;
  }
  return parsed.title || parsed.kind;
}

async function identifyCurrentMedia() {
  var source = getCurrentSource();
  var parsed = parser.parseMediaFromSource(source.url, source.title);
  var lookupToken = activeLookupToken + 1;
  var cachedEntry = getCachedEntry(source, parsed);
  var auth = prefString("tmdb_auth", "").trim();
  var language = prefString("metadata_language", "en-US");

  activeLookupToken = lookupToken;

  if (!parsed) {
    currentMedia = {
      source: source,
      parsed: null,
      status: "fallback",
      display: buildFallbackDisplay(null, "This file name could not be classified automatically.")
    };
    debugOsd("Could not parse current media");
    refreshOverlayIfNeeded();
    return;
  }

  if (
    parsed.lookupKey &&
    parsed.lookupKey === lastLookupKey &&
    currentMedia &&
    currentMedia.parsed &&
    currentMedia.parsed.lookupKey === parsed.lookupKey &&
    (currentMedia.status === "loading" || currentMedia.status === "ready")
  ) {
    log("Skipping duplicate lookup for " + parsedLabel(parsed));
    refreshOverlayIfNeeded();
    return;
  }

  lastLookupKey = parsed.lookupKey || "";
  log("Parsed " + parsedLabel(parsed));
  debugOsd("Parsed " + parsedLabel(parsed));

  if (cachedEntry) {
    currentMedia = {
      source: source,
      parsed: parsed,
      status: cachedEntry.policy === CACHE_POLICY_TMDB || cachedEntry.source === "tmdb" ? "ready" : "fallback",
      display: cachedEntry.display
    };
    log("Using cached " + (cachedEntry.policy || cachedEntry.source || "entry"));
    refreshOverlayIfNeeded();
    return;
  }

  currentMedia = {
    source: source,
    parsed: parsed,
    status: "loading",
    display: buildFallbackDisplay(parsed, auth ? "Looking up synopsis..." : tmdbNotice())
  };
  refreshOverlayIfNeeded();

  if (!auth) {
    currentMedia.status = "fallback";
    persistDisplay(source, parsed, currentMedia.display, {
      policy: CACHE_POLICY_NO_AUTH
    });
    return;
  }

  try {
    var metadata = await tmdb.fetchMetadata(iina.http, auth, parsed, language);
    if (lookupToken !== activeLookupToken) return;
    currentMedia = {
      source: source,
      parsed: parsed,
      status: "ready",
      display: metadata
    };
    persistDisplay(source, parsed, metadata, {
      policy: CACHE_POLICY_TMDB
    });
    log("Matched " + metadata.primaryTitle);
    debugOsd("Matched " + metadata.primaryTitle);
    refreshOverlayIfNeeded();
  } catch (error) {
    if (lookupToken !== activeLookupToken) return;
    var fallback = buildFallbackDisplay(parsed, lookupFailureNotice(error));
    var failurePolicy = cachePolicyForFailure(error);
    currentMedia = {
      source: source,
      parsed: parsed,
      status: "fallback",
      display: fallback
    };
    persistDisplay(source, parsed, fallback, {
      policy: failurePolicy,
      retryAfter: retryAfterForPolicy(failurePolicy),
      lastError: errStr(error)
    });
    log("Lookup failed: " + errStr(error));
    debugOsd(lookupFailureNotice(error));
    refreshOverlayIfNeeded();
  }
}

function onPause() {
  if (!prefBool("overlay_enabled", true)) return;
  if (!currentMedia || !currentMedia.display) {
    debugOsd("No parsed media yet");
    return;
  }

  clearPauseTimer();
  pauseStartedAt = Date.now();
  waitingForMetadata = true;
  pauseTimer = setTimeout(function() {
    pauseTimer = null;
    if (!core.status.paused || !waitingForMetadata) return;
    if (currentMedia && currentMedia.status !== "loading") {
      showOverlay(currentMedia.display);
    }
  }, prefNumber("pause_delay_seconds", 0.8) * 1000);
}

function onResume() {
  hideOverlay();
}

function handleFileLoaded() {
  var source = getCurrentSource();
  var signature = source.url || source.title;

  hideOverlay();
  pauseStartedAt = 0;
  waitingForMetadata = false;

  if (signature && signature === lastSourceSignature && currentMedia) {
    return;
  }

  lastLookupKey = "";
  lastSourceSignature = signature;
  currentMedia = null;
  identifyCurrentMedia();
}

log("Plugin main loaded");

event.on("iina.window-loaded", wrapEvent("iina.window-loaded", function() {
  ensureOverlayLoaded();
  debugOsd("Plugin loaded");
}));

event.on("iina.file-loaded", wrapEvent("iina.file-loaded", function() {
  handleFileLoaded();
}));

event.on("mpv.pause.changed", wrapEvent("mpv.pause.changed", function() {
  if (core.status.paused) onPause();
  else onResume();
}));

event.on("mpv.end-file", wrapEvent("mpv.end-file", function() {
  hideOverlay();
  currentMedia = null;
  pauseStartedAt = 0;
  lastSourceSignature = "";
  lastLookupKey = "";
}));
