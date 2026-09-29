const assert = require("assert");

function loadFreshParser() {
  delete require.cache[require.resolve("../parser")];
  return require("../parser");
}

{
  const parser = loadFreshParser();
  parser.configure({
    loadGuessitModule: function() {
      return require("../vendor/guessit-js.cjs");
    }
  });

  const parsed = parser.parseMediaFromSource(
    "file:///Users/fahim/Downloads/Game%20Changer%205x04%20Name%20A%20Number.mp4",
    ""
  );
  const diagnostics = parser.getDiagnostics();

  assert(parsed, "Expected a parsed result when guessit is available");
  assert.strictEqual(parsed.parserSource, "guessit");
  assert.strictEqual(diagnostics.guessitAvailable, true);
  assert.strictEqual(diagnostics.guessitStatus, "loaded");
  assert.strictEqual(diagnostics.guessitLoadError, null);
}

{
  const parser = loadFreshParser();
  parser.configure({
    loadGuessitModule: function() {
      throw new Error("synthetic load failure");
    }
  });

  const parsed = parser.parseMediaFromSource(
    "/Users/fahim/TV/Game Changer 5x04 Name A Number.mkv",
    ""
  );
  const diagnostics = parser.getDiagnostics();

  assert(parsed, "Expected heuristic fallback when guessit fails to load");
  assert.strictEqual(parsed.parserSource, "heuristic");
  assert.strictEqual(diagnostics.guessitAvailable, false);
  assert.strictEqual(diagnostics.guessitStatus, "load-failed");
  assert.match(diagnostics.guessitLoadError, /synthetic load failure/);
}

console.log("parser diagnostics tests passed");
