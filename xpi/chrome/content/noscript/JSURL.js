var JSURL = {
  JS_VERSION: "1.8",
  load: function(url, document) {
    this._run(document, url.substring("javascript:".length)
      .replace(/(?:%[0-9a-f]{2})+/g, function(m) {
        try {
          return decodeURIComponent(m);
        } catch (e) {}
        return unescape(m);
      }));
  },
  
  _patch: (function() {
      var d = window.document;
      function op(data) {
          d.dispatchEvent(new CustomEvent("NoScript::docOp", { detail: data, bubbles: true }));
      }
      function patch(o, m, f) {
          var saved = o[m];
          f._restore = function() { o[m] = saved };
          o[m] = f;
      }
      function restore(o, m) {
          o[m] = o[m]._saved;
      }
      patch(d, "open", function() { op(null) });
      patch(d, "write", function(s) {
          op(typeof(s) === "string" ? s : "" + s); 
      });
      patch(d, "writeln", function(s) { this.write(s + "\n") });
  }).toSource() + "()",
  _restore: (function() {  
     var d = window.document;     
     d.writeln._restore();
     d.write._restore();
     d.open._restore();  
  }).toSource() + "()",
  
  _run: function(document, code) {
    var w = document.defaultView;
    var listener = this._docOpListener;
    var event = this._docOpEvent;
    var eventTarget = w.document;
    eventTarget.addEventListener(event, listener, true);
    var s =  new Cu.Sandbox(document.nodePrincipal, {
        sandboxName: "NoScript::JSURL@" + document.documentURI,
        sandboxPrototype: w,
        wantXray: false,
      });
    var e = function(script)  Cu.evalInSandbox("with(window) {" + script + "}", s, JSURL.JS_VERSION);
    e(this._patch);
    var ret;
    try {
        ret = e(code);   
        if (typeof(ret) !== "undefined" &&
            !DOM.getDocShellForWindow(w).isLoadingDocument) {
          s._ret_ = ret;
          e("window.location.href = 'javascript:' + JSON.stringify('' + this._ret_)");
          delete s._ret_;
          Thread.yieldAll();
        }
    } catch (e) {
        try { w.console.error("" + e) } catch(consoleError) { Cu.reportError(e) }
    } finally {
      try { e(this._restore) } catch(e) {}
      eventTarget.removeEventListener(event, listener, true);
    }
  },
  
  _docOpEvent: "NoScript::docOp",
  _docOpListener: function(e) { 
    var type = e.type;
    e.stopPropagation();
    var listener = arguments.callee;
    e.currentTarget.removeEventListener(type, listener, true);
    var doc = e.target;
    var win = doc.defaultView;
    var code = (typeof(e.detail) === "string") 
                   ? 'document.__proto__.write.call(document, unescape("' + escape(e.detail) + '"))'
                   : 'document.__proto.__open.call(document)';
    var docShell = DOM.getDocShellForWindow(win);
    ScriptSurrogate.executeDOM(doc, code); // window/document may be changed by this
    docShell.document.addEventListener(type, listener, true)
  },
}