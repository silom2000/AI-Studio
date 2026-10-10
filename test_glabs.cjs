try {
  require('./glabs-handlers.cjs');
  console.log("No top-level error in glabs-handlers.cjs!");
} catch (e) {
  console.error(e);
}
