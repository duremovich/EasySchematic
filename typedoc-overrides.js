// Tag the body with a class derived from the URL path so the CSS overrides
// can target page types. TypeDoc's default theme doesn't emit any body class
// of its own, so we do it here.
(function tagBodyByPath() {
  var path = window.location.pathname;
  var cls;
  if (/\/modules\//.test(path)) {
    cls = "tsd-page-module";
  } else if (/\/(?:dev|ScriptReference)\/?(?:index\.html)?$/.test(path) || path.endsWith("/dev/") || path.endsWith("/dev/index.html")) {
    cls = "tsd-page-index";
  }
  if (cls) {
    document.body.classList.add(cls);
  }
})();
