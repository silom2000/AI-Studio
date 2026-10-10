try {
  require('./docucraft-handlers.cjs');
  console.log("No top-level error in docucraft-handlers.cjs!");
} catch (e) {
  console.error(e);
}
