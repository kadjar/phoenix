define("phoenix", ["exports"], function(__exports__) {
  "use strict";

  function __es6_export__(name, value) {
    __exports__[name] = value;
  }

  "use strict";

  var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

  var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  var SOCKET_STATES = { connecting: 0, open: 1, closing: 2, closed: 3 };
  var CHANNEL_EVENTS = {
    close: "phx_close",
    error: "phx_error",
    join: "phx_join",
    reply: "phx_reply",
    leave: "phx_leave"
  };

  var Push = (function () {

    // Initializes the Push
    //
    // chan - The Channel
    // event - The event, ie `"phx_join"`
    // payload - The payload, ie `{user_id: 123}`
    // mergePush - The optional `Push` to merge hooks from

    function Push(chan, event, payload, mergePush) {
      var _this = this;

      _classCallCheck(this, Push);

      this.chan = chan;
      this.event = event;
      this.payload = payload || {};
      this.receivedResp = null;
      this.afterHooks = [];
      this.recHooks = {};
      this.sent = false;
      if (mergePush) {
        mergePush.afterHooks.forEach(function (hook) {
          return _this.after(hook.ms, hook.callback);
        });
        for (var status in mergePush.recHooks) {
          if (mergePush.recHooks.hasOwnProperty(status)) {
            this.receive(status, mergePush.recHooks[status]);
          }
        }
      }
    }

    _createClass(Push, [{
      key: "send",
      value: function send() {
        var _this2 = this;

        var ref = this.chan.socket.makeRef();
        var refEvent = this.chan.replyEventName(ref);

        this.chan.on(refEvent, function (payload) {
          _this2.receivedResp = payload;
          _this2.matchReceive(payload);
          _this2.chan.off(refEvent);
          _this2.cancelAfters();
        });

        this.startAfters();
        this.sent = true;
        this.chan.socket.push({
          topic: this.chan.topic,
          event: this.event,
          payload: this.payload,
          ref: ref
        });
      }
    }, {
      key: "receive",
      value: function receive(status, callback) {
        if (this.receivedResp && this.receivedResp.status === status) {
          callback(this.receivedResp.response);
        }
        this.recHooks[status] = callback;
        return this;
      }
    }, {
      key: "after",
      value: function after(ms, callback) {
        var timer = null;
        if (this.sent) {
          timer = setTimeout(callback, ms);
        }
        this.afterHooks.push({ ms: ms, callback: callback, timer: timer });
        return this;
      }
    }, {
      key: "matchReceive",

      // private

      value: function matchReceive(_ref) {
        var status = _ref.status;
        var response = _ref.response;
        var ref = _ref.ref;

        var callback = this.recHooks[status];
        if (!callback) {
          return;
        }

        if (this.event === CHANNEL_EVENTS.join) {
          callback(this.chan);
        } else {
          callback(response);
        }
      }
    }, {
      key: "cancelAfters",
      value: function cancelAfters() {
        this.afterHooks.forEach(function (hook) {
          clearTimeout(hook.timer);
          hook.timer = null;
        });
      }
    }, {
      key: "startAfters",
      value: function startAfters() {
        this.afterHooks.map(function (hook) {
          if (!hook.timer) {
            hook.timer = setTimeout(function () {
              return hook.callback();
            }, hook.ms);
          }
        });
      }
    }]);

    return Push;
  })();

  var Channel = (function () {
    function Channel(topic, message, callback, socket) {
      _classCallCheck(this, Channel);

      this.topic = topic;
      this.message = message;
      this.callback = callback;
      this.socket = socket;
      this.bindings = [];
      this.afterHooks = [];
      this.recHooks = {};
      this.joinPush = new Push(this, CHANNEL_EVENTS.join, this.message);

      this.reset();
    }

    _createClass(Channel, [{
      key: "after",
      value: function after(ms, callback) {
        this.joinPush.after(ms, callback);
        return this;
      }
    }, {
      key: "receive",
      value: function receive(status, callback) {
        this.joinPush.receive(status, callback);
        return this;
      }
    }, {
      key: "rejoin",
      value: function rejoin() {
        this.reset();
        this.joinPush.send();
      }
    }, {
      key: "onClose",
      value: function onClose(callback) {
        this.on(CHANNEL_EVENTS.close, callback);
      }
    }, {
      key: "onError",
      value: function onError(callback) {
        var _this3 = this;

        this.on(CHANNEL_EVENTS.error, function (reason) {
          callback(reason);
          _this3.trigger(CHANNEL_EVENTS.close, "error");
        });
      }
    }, {
      key: "reset",
      value: function reset() {
        var _this4 = this;

        this.bindings = [];
        var newJoinPush = new Push(this, CHANNEL_EVENTS.join, this.message, this.joinPush);
        this.joinPush = newJoinPush;
        this.onError(function (reason) {
          setTimeout(function () {
            return _this4.rejoin();
          }, _this4.socket.reconnectAfterMs);
        });
        this.on(CHANNEL_EVENTS.reply, function (payload) {
          _this4.trigger(_this4.replyEventName(payload.ref), payload);
        });
      }
    }, {
      key: "on",
      value: function on(event, callback) {
        this.bindings.push({ event: event, callback: callback });
      }
    }, {
      key: "isMember",
      value: function isMember(topic) {
        return this.topic === topic;
      }
    }, {
      key: "off",
      value: function off(event) {
        this.bindings = this.bindings.filter(function (bind) {
          return bind.event !== event;
        });
      }
    }, {
      key: "trigger",
      value: function trigger(triggerEvent, msg) {
        this.bindings.filter(function (bind) {
          return bind.event === triggerEvent;
        }).map(function (bind) {
          return bind.callback(msg);
        });
      }
    }, {
      key: "push",
      value: function push(event, payload) {
        var pushEvent = new Push(this, event, payload);
        pushEvent.send();

        return pushEvent;
      }
    }, {
      key: "replyEventName",
      value: function replyEventName(ref) {
        return "chan_reply_" + ref;
      }
    }, {
      key: "leave",
      value: function leave() {
        var _this5 = this;

        return this.push(CHANNEL_EVENTS.leave).receive("ok", function () {
          _this5.socket.leave(_this5);
          _this5.reset();
        });
      }
    }]);

    return Channel;
  })();

  exports.Channel = Channel;

  var Socket = (function () {

    // Initializes the Socket
    //
    // endPoint - The string WebSocket endpoint, ie, "ws://example.com/ws",
    //                                               "wss://example.com"
    //                                               "/ws" (inherited host & protocol)
    // opts - Optional configuration
    //   transport - The Websocket Transport, ie WebSocket, Phoenix.LongPoller.
    //               Defaults to WebSocket with automatic LongPoller fallback.
    //   heartbeatIntervalMs - The millisec interval to send a heartbeat message
    //   reconnectAfterMs - The millisec interval to reconnect after connection loss
    //   logger - The optional function for specialized logging, ie:
    //            `logger: function(msg){ console.log(msg) }`
    //   longpoller_timeout - The maximum timeout of a long poll AJAX request.
    //                        Defaults to 20s (double the server long poll timer).
    //
    // For IE8 support use an ES5-shim (https://github.com/es-shims/es5-shim)
    //

    function Socket(endPoint) {
      var opts = arguments[1] === undefined ? {} : arguments[1];

      _classCallCheck(this, Socket);

      this.states = SOCKET_STATES;
      this.stateChangeCallbacks = { open: [], close: [], error: [], message: [] };
      this.flushEveryMs = 50;
      this.reconnectTimer = null;
      this.channels = [];
      this.sendBuffer = [];
      this.ref = 0;
      this.transport = opts.transport || window.WebSocket || LongPoller;
      this.heartbeatIntervalMs = opts.heartbeatIntervalMs || 30000;
      this.reconnectAfterMs = opts.reconnectAfterMs || 5000;
      this.logger = opts.logger || function () {}; // noop
      this.longpoller_timeout = opts.longpoller_timeout || 20000;
      this.endPoint = this.expandEndpoint(endPoint);

      this.resetBufferTimer();
    }

    _createClass(Socket, [{
      key: "protocol",
      value: function protocol() {
        return location.protocol.match(/^https/) ? "wss" : "ws";
      }
    }, {
      key: "expandEndpoint",
      value: function expandEndpoint(endPoint) {
        if (endPoint.charAt(0) !== "/") {
          return endPoint;
        }
        if (endPoint.charAt(1) === "/") {
          return "" + this.protocol() + ":" + endPoint;
        }

        return "" + this.protocol() + "://" + location.host + "" + endPoint;
      }
    }, {
      key: "disconnect",
      value: function disconnect(callback, code, reason) {
        if (this.conn) {
          this.conn.onclose = function () {}; // noop
          if (code) {
            this.conn.close(code, reason || "");
          } else {
            this.conn.close();
          }
          this.conn = null;
        }
        callback && callback();
      }
    }, {
      key: "connect",
      value: function connect() {
        var _this6 = this;

        this.disconnect(function () {
          _this6.conn = new _this6.transport(_this6.endPoint);
          _this6.conn.timeout = _this6.longpoller_timeout;
          _this6.conn.onopen = function () {
            return _this6.onConnOpen();
          };
          _this6.conn.onerror = function (error) {
            return _this6.onConnError(error);
          };
          _this6.conn.onmessage = function (event) {
            return _this6.onConnMessage(event);
          };
          _this6.conn.onclose = function (event) {
            return _this6.onConnClose(event);
          };
        });
      }
    }, {
      key: "resetBufferTimer",
      value: function resetBufferTimer() {
        var _this7 = this;

        clearTimeout(this.sendBufferTimer);
        this.sendBufferTimer = setTimeout(function () {
          return _this7.flushSendBuffer();
        }, this.flushEveryMs);
      }
    }, {
      key: "log",

      // Logs the message. Override `this.logger` for specialized logging. noops by default
      value: function log(msg) {
        this.logger(msg);
      }
    }, {
      key: "onOpen",

      // Registers callbacks for connection state change events
      //
      // Examples
      //
      //    socket.onError function(error){ alert("An error occurred") }
      //
      value: function onOpen(callback) {
        this.stateChangeCallbacks.open.push(callback);
      }
    }, {
      key: "onClose",
      value: function onClose(callback) {
        this.stateChangeCallbacks.close.push(callback);
      }
    }, {
      key: "onError",
      value: function onError(callback) {
        this.stateChangeCallbacks.error.push(callback);
      }
    }, {
      key: "onMessage",
      value: function onMessage(callback) {
        this.stateChangeCallbacks.message.push(callback);
      }
    }, {
      key: "onConnOpen",
      value: function onConnOpen() {
        var _this8 = this;

        clearInterval(this.reconnectTimer);
        if (!this.conn.skipHeartbeat) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = setInterval(function () {
            return _this8.sendHeartbeat();
          }, this.heartbeatIntervalMs);
        }
        this.rejoinAll();
        this.stateChangeCallbacks.open.forEach(function (callback) {
          return callback();
        });
      }
    }, {
      key: "onConnClose",
      value: function onConnClose(event) {
        var _this9 = this;

        this.log("WS close:");
        this.log(event);
        clearInterval(this.reconnectTimer);
        clearInterval(this.heartbeatTimer);
        this.reconnectTimer = setInterval(function () {
          return _this9.connect();
        }, this.reconnectAfterMs);
        this.stateChangeCallbacks.close.forEach(function (callback) {
          return callback(event);
        });
      }
    }, {
      key: "onConnError",
      value: function onConnError(error) {
        this.log("WS error:");
        this.log(error);
        this.stateChangeCallbacks.error.forEach(function (callback) {
          return callback(error);
        });
      }
    }, {
      key: "connectionState",
      value: function connectionState() {
        switch (this.conn && this.conn.readyState) {
          case this.states.connecting:
            return "connecting";
          case this.states.open:
            return "open";
          case this.states.closing:
            return "closing";
          default:
            return "closed";
        }
      }
    }, {
      key: "isConnected",
      value: function isConnected() {
        return this.connectionState() === "open";
      }
    }, {
      key: "rejoinAll",
      value: function rejoinAll() {
        this.channels.forEach(function (chan) {
          return chan.rejoin();
        });
      }
    }, {
      key: "join",
      value: function join(topic, message, callback) {
        var chan = new Channel(topic, message, callback, this);
        this.channels.push(chan);
        if (this.isConnected()) {
          chan.rejoin();
        }
        return chan;
      }
    }, {
      key: "leave",
      value: function leave(chan) {
        this.channels = this.channels.filter(function (c) {
          return !c.isMember(chan.topic);
        });
      }
    }, {
      key: "push",
      value: function push(data) {
        var _this10 = this;

        var callback = function callback() {
          return _this10.conn.send(JSON.stringify(data));
        };
        if (this.isConnected()) {
          callback();
        } else {
          this.sendBuffer.push(callback);
        }
      }
    }, {
      key: "makeRef",

      // Return the next message ref, accounting for overflows
      value: function makeRef() {
        var newRef = this.ref + 1;
        if (newRef === this.ref) {
          this.ref = 0;
        } else {
          this.ref = newRef;
        }

        return this.ref.toString();
      }
    }, {
      key: "sendHeartbeat",
      value: function sendHeartbeat() {
        this.push({ topic: "phoenix", event: "heartbeat", payload: {}, ref: this.makeRef() });
      }
    }, {
      key: "flushSendBuffer",
      value: function flushSendBuffer() {
        if (this.isConnected() && this.sendBuffer.length > 0) {
          this.sendBuffer.forEach(function (callback) {
            return callback();
          });
          this.sendBuffer = [];
        }
        this.resetBufferTimer();
      }
    }, {
      key: "onConnMessage",
      value: function onConnMessage(rawMessage) {
        this.log("message received:");
        this.log(rawMessage);

        var _JSON$parse = JSON.parse(rawMessage.data);

        var topic = _JSON$parse.topic;
        var event = _JSON$parse.event;
        var payload = _JSON$parse.payload;

        this.channels.filter(function (chan) {
          return chan.isMember(topic);
        }).forEach(function (chan) {
          return chan.trigger(event, payload);
        });
        this.stateChangeCallbacks.message.forEach(function (callback) {
          callback(topic, event, payload);
        });
      }
    }]);

    return Socket;
  })();

  exports.Socket = Socket;

  var LongPoller = (function () {
    function LongPoller(endPoint) {
      _classCallCheck(this, LongPoller);

      this.retryInMs = 5000;
      this.endPoint = null;
      this.token = null;
      this.sig = null;
      this.skipHeartbeat = true;
      this.onopen = function () {}; // noop
      this.onerror = function () {}; // noop
      this.onmessage = function () {}; // noop
      this.onclose = function () {}; // noop
      this.states = SOCKET_STATES;
      this.upgradeEndpoint = this.normalizeEndpoint(endPoint);
      this.pollEndpoint = this.upgradeEndpoint + (/\/$/.test(endPoint) ? "poll" : "/poll");
      this.readyState = this.states.connecting;

      this.poll();
    }

    _createClass(LongPoller, [{
      key: "normalizeEndpoint",
      value: function normalizeEndpoint(endPoint) {
        return endPoint.replace("ws://", "http://").replace("wss://", "https://");
      }
    }, {
      key: "endpointURL",
      value: function endpointURL() {
        return this.pollEndpoint + ("?token=" + encodeURIComponent(this.token) + "&sig=" + encodeURIComponent(this.sig));
      }
    }, {
      key: "closeAndRetry",
      value: function closeAndRetry() {
        this.close();
        this.readyState = this.states.connecting;
      }
    }, {
      key: "ontimeout",
      value: function ontimeout() {
        this.onerror("timeout");
        this.closeAndRetry();
      }
    }, {
      key: "poll",
      value: function poll() {
        var _this11 = this;

        if (!(this.readyState === this.states.open || this.readyState === this.states.connecting)) {
          return;
        }

        Ajax.request("GET", this.endpointURL(), "application/json", null, this.timeout, this.ontimeout.bind(this), function (resp) {
          if (resp) {
            var status = resp.status;
            var token = resp.token;
            var sig = resp.sig;
            var messages = resp.messages;

            _this11.token = token;
            _this11.sig = sig;
          } else {
            var status = 0;
          }

          switch (status) {
            case 200:
              messages.forEach(function (msg) {
                return _this11.onmessage({ data: JSON.stringify(msg) });
              });
              _this11.poll();
              break;
            case 204:
              _this11.poll();
              break;
            case 410:
              _this11.readyState = _this11.states.open;
              _this11.onopen();
              _this11.poll();
              break;
            case 0:
            case 500:
              _this11.onerror();
              _this11.closeAndRetry();
              break;
            default:
              throw "unhandled poll status " + status;
          }
        });
      }
    }, {
      key: "send",
      value: function send(body) {
        var _this12 = this;

        Ajax.request("POST", this.endpointURL(), "application/json", body, this.timeout, this.onerror.bind(this, "timeout"), function (resp) {
          if (!resp || resp.status !== 200) {
            _this12.onerror(status);
            _this12.closeAndRetry();
          }
        });
      }
    }, {
      key: "close",
      value: function close(code, reason) {
        this.readyState = this.states.closed;
        this.onclose();
      }
    }]);

    return LongPoller;
  })();

  exports.LongPoller = LongPoller;

  var Ajax = (function () {
    function Ajax() {
      _classCallCheck(this, Ajax);
    }

    _createClass(Ajax, null, [{
      key: "request",
      value: function request(method, endPoint, accept, body, timeout, ontimeout, callback) {
        if (window.XDomainRequest) {
          var req = new XDomainRequest(); // IE8, IE9
          this.xdomainRequest(req, method, endPoint, body, timeout, ontimeout, callback);
        } else {
          var req = window.XMLHttpRequest ? new XMLHttpRequest() : // IE7+, Firefox, Chrome, Opera, Safari
          new ActiveXObject("Microsoft.XMLHTTP"); // IE6, IE5
          this.xhrRequest(req, method, endPoint, accept, body, timeout, ontimeout, callback);
        }
      }
    }, {
      key: "xdomainRequest",
      value: function xdomainRequest(req, method, endPoint, body, timeout, ontimeout, callback) {
        var _this13 = this;

        req.timeout = timeout;
        req.open(method, endPoint);
        req.onload = function () {
          var response = _this13.parseJSON(req.responseText);
          callback && callback(response);
        };
        if (ontimeout) {
          req.ontimeout = ontimeout;
        }

        // Work around bug in IE9 that requires an attached onprogress handler
        req.onprogress = function () {};

        req.send(body);
      }
    }, {
      key: "xhrRequest",
      value: function xhrRequest(req, method, endPoint, accept, body, timeout, ontimeout, callback) {
        var _this14 = this;

        req.timeout = timeout;
        req.open(method, endPoint, true);
        req.setRequestHeader("Content-Type", accept);
        req.onerror = function () {
          callback && callback(null);
        };
        req.onreadystatechange = function () {
          if (req.readyState === _this14.states.complete && callback) {
            var response = _this14.parseJSON(req.responseText);
            callback(response);
          }
        };
        if (ontimeout) {
          req.ontimeout = ontimeout;
        }

        req.send(body);
      }
    }, {
      key: "parseJSON",
      value: function parseJSON(resp) {
        return resp && resp !== "" ? JSON.parse(resp) : null;
      }
    }]);

    return Ajax;
  })();

  exports.Ajax = Ajax;

  Ajax.states = { complete: 4 };
});

//# sourceMappingURL=phoenix.js.map