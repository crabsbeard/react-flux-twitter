(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var send = require("./send")
var reduce = require("reducible/reduce")
var isReduced = require("reducible/is-reduced")
var isError = require("reducible/is-error")
var reduced = require("reducible/reduced")
var end = require("reducible/end")

// `Event` is data type representing a stream of values that can be dispatched
// manually in an imperative style by calling `send(event, value)`
function Event() {}

// `Event` type has internal property of for aggregating `watchers`. This
// property has a unique name and is intentionally made non-enumerable (in
// a future it will be a private names
// http://wiki.ecmascript.org/doku.php?id=harmony:private_name_objects) so
// that it's behavior can not be tempered.
var reducer = "watchers@" + module.id
var state = "state@" + module.id
var ended = "ended@" + module.id
Object.defineProperty(Event.prototype, state, {
  value: void(0), enumerable: false, configurable: false, writable: true
})
Object.defineProperty(Event.prototype, reducer, {
  value: void(0), enumerable: false, configurable: false, writable: true
})
Object.defineProperty(Event.prototype, ended, {
  value: false, enumerable: false, configurable: false, writable: true
})



// ## send
//
// `Event` type implements `send` as a primary mechanism for dispatching new
//  values of the given `event`. All of the `watchers` of the `event` will
//  be invoked in FIFO order. Any new `watchers` added in side effect to this
//  call will not be invoked until next `send`. Note at this point `send` will
//  return `false` if no watchers have being invoked and will return `true`
//  otherwise, although this implementation detail is not guaranteed and may
//  change in a future.
send.define(Event, function sendEvent(event, value) {
  // Event may only be reduced by one consumer function.
  // Other data types built on top of signal may allow for more consumers.
  if (event[ended]) return reduced()
  if (value === end || isError(value)) event[ended] = true

  var next = event[reducer]
  if (next) {
    var result = next(value, event[state])
    if (isReduced(result) || event[ended])
      event[reducer] = event[state] = void(0)
    else event[state] = result
  }
})

reduce.define(Event, function(event, next, initial) {
  // Event may only be reduced by one consumer function.
  // Other data types built on top of signal may allow for more consumers.
  if (event[reducer] || event[ended])
    return next(Error("Event is already reduced"), initial)
  event[reducer] = next
  event[state] = initial
})

function event() {
  /**
  Function creates new `Event` that can be `watched` for a new values `send`-ed
  on it. Also `send` function can be used on returned instance to send new
  values.

  ## Example

      var e = event()

      send(e, 0)

      reduce(e, function(index, value) {
        console.log("=>", index, value)
        return index + 1
      }, 0)

      send(e, "a") // => 0 "a"
      send(e, "b") // => 0 "b"
  **/
  return new Event()
}
event.type = Event

module.exports = event

},{"./send":9,"reducible/end":3,"reducible/is-error":4,"reducible/is-reduced":5,"reducible/reduce":7,"reducible/reduced":8}],2:[function(require,module,exports){
"use strict";

var defineProperty = Object.defineProperty || function(object, name, property) {
  object[name] = property.value
  return object
}

// Shortcut for `Object.prototype.toString` for faster access.
var typefy = Object.prototype.toString

// Map to for jumping from typeof(value) to associated type prefix used
// as a hash in the map of builtin implementations.
var types = { "function": "Object", "object": "Object" }

// Array is used to save method implementations for the host objects in order
// to avoid extending them with non-primitive values that could cause leaks.
var host = []
// Hash map is used to save method implementations for builtin types in order
// to avoid extending their prototypes. This also allows to share method
// implementations for types across diff contexts / frames / compartments.
var builtin = {}

function Primitive() {}
function ObjectType() {}
ObjectType.prototype = new Primitive()
function ErrorType() {}
ErrorType.prototype = new ObjectType()

var Default = builtin.Default = Primitive.prototype
var Null = builtin.Null = new Primitive()
var Void = builtin.Void = new Primitive()
builtin.String = new Primitive()
builtin.Number = new Primitive()
builtin.Boolean = new Primitive()

builtin.Object = ObjectType.prototype
builtin.Error = ErrorType.prototype

builtin.EvalError = new ErrorType()
builtin.InternalError = new ErrorType()
builtin.RangeError = new ErrorType()
builtin.ReferenceError = new ErrorType()
builtin.StopIteration = new ErrorType()
builtin.SyntaxError = new ErrorType()
builtin.TypeError = new ErrorType()
builtin.URIError = new ErrorType()


function Method(hint) {
  /**
  Private Method is a callable private name that dispatches on the first
  arguments same named Method:

      method(object, ...rest) => object[method](...rest)

  Optionally hint string may be provided that will be used in generated names
  to ease debugging.

  ## Example

      var foo = Method()

      // Implementation for any types
      foo.define(function(value, arg1, arg2) {
        // ...
      })

      // Implementation for a specific type
      foo.define(BarType, function(bar, arg1, arg2) {
        // ...
      })
  **/

  // Create an internal unique name if `hint` is provided it is used to
  // prefix name to ease debugging.
  var name = (hint || "") + "#" + Math.random().toString(32).substr(2)

  function dispatch(value) {
    // Method dispatches on type of the first argument.
    // If first argument is `null` or `void` associated implementation is
    // looked up in the `builtin` hash where implementations for built-ins
    // are stored.
    var type = null
    var method = value === null ? Null[name] :
                 value === void(0) ? Void[name] :
                 // Otherwise attempt to use method with a generated private
                 // `name` that is supposedly in the prototype chain of the
                 // `target`.
                 value[name] ||
                 // Otherwise assume it's one of the built-in type instances,
                 // in which case implementation is stored in a `builtin` hash.
                 // Attempt to find a implementation for the given built-in
                 // via constructor name and method name.
                 ((type = builtin[(value.constructor || "").name]) &&
                  type[name]) ||
                 // Otherwise assume it's a host object. For host objects
                 // actual method implementations are stored in the `host`
                 // array and only index for the implementation is stored
                 // in the host object's prototype chain. This avoids memory
                 // leaks that otherwise could happen when saving JS objects
                 // on host object.
                 host[value["!" + name]] ||
                 // Otherwise attempt to lookup implementation for builtins by
                 // a type of the value. This basically makes sure that all
                 // non primitive values will delegate to an `Object`.
                 ((type = builtin[types[typeof(value)]]) && type[name])


    // If method implementation for the type is still not found then
    // just fallback for default implementation.
    method = method || Default[name]


    // If implementation is still not found (which also means there is no
    // default) just throw an error with a descriptive message.
    if (!method) throw TypeError("Type does not implements method: " + name)

    // If implementation was found then just delegate.
    return method.apply(method, arguments)
  }

  // Make `toString` of the dispatch return a private name, this enables
  // method definition without sugar:
  //
  //    var method = Method()
  //    object[method] = function() { /***/ }
  dispatch.toString = function toString() { return name }

  // Copy utility methods for convenient API.
  dispatch.implement = implementMethod
  dispatch.define = defineMethod

  return dispatch
}

// Create method shortcuts form functions.
var defineMethod = function defineMethod(Type, lambda) {
  return define(this, Type, lambda)
}
var implementMethod = function implementMethod(object, lambda) {
  return implement(this, object, lambda)
}

// Define `implement` and `define` polymorphic methods to allow definitions
// and implementations through them.
var implement = Method("implement")
var define = Method("define")


function _implement(method, object, lambda) {
  /**
  Implements `Method` for the given `object` with a provided `implementation`.
  Calling `Method` with `object` as a first argument will dispatch on provided
  implementation.
  **/
  return defineProperty(object, method.toString(), {
    enumerable: false,
    configurable: false,
    writable: false,
    value: lambda
  })
}

function _define(method, Type, lambda) {
  /**
  Defines `Method` for the given `Type` with a provided `implementation`.
  Calling `Method` with a first argument of this `Type` will dispatch on
  provided `implementation`. If `Type` is a `Method` default implementation
  is defined. If `Type` is a `null` or `undefined` `Method` is implemented
  for that value type.
  **/

  // Attempt to guess a type via `Object.prototype.toString.call` hack.
  var type = Type && typefy.call(Type.prototype)

  // If only two arguments are passed then `Type` is actually an implementation
  // for a default type.
  if (!lambda) Default[method] = Type
  // If `Type` is `null` or `void` store implementation accordingly.
  else if (Type === null) Null[method] = lambda
  else if (Type === void(0)) Void[method] = lambda
  // If `type` hack indicates built-in type and type has a name us it to
  // store a implementation into associated hash. If hash for this type does
  // not exists yet create one.
  else if (type !== "[object Object]" && Type.name) {
    var Bulitin = builtin[Type.name] || (builtin[Type.name] = new ObjectType())
    Bulitin[method] = lambda
  }
  // If `type` hack indicates an object, that may be either object or any
  // JS defined "Class". If name of the constructor is `Object`, assume it's
  // built-in `Object` and store implementation accordingly.
  else if (Type.name === "Object")
    builtin.Object[method] = lambda
  // Host objects are pain!!! Every browser does some crazy stuff for them
  // So far all browser seem to not implement `call` method for host object
  // constructors. If that is a case here, assume it's a host object and
  // store implementation in a `host` array and store `index` in the array
  // in a `Type.prototype` itself. This avoids memory leaks that could be
  // caused by storing JS objects on a host objects.
  else if (Type.call === void(0)) {
    var index = host.indexOf(lambda)
    if (index < 0) index = host.push(lambda) - 1
    // Prefix private name with `!` so it can be dispatched from the method
    // without type checks.
    implement("!" + method, Type.prototype, index)
  }
  // If Got that far `Type` is user defined JS `Class`. Define private name
  // as hidden property on it's prototype.
  else
    implement(method, Type.prototype, lambda)
}

// And provided implementations for a polymorphic equivalents.
_define(define, _define)
_define(implement, _implement)

// Define exports on `Method` as it's only thing being exported.
Method.implement = implement
Method.define = define
Method.Method = Method
Method.method = Method
Method.builtin = builtin
Method.host = host

module.exports = Method

},{}],3:[function(require,module,exports){
"use strict";

module.exports = String("End of the collection")

},{}],4:[function(require,module,exports){
"use strict";

var stringifier = Object.prototype.toString

function isError(value) {
  return stringifier.call(value) === "[object Error]"
}

module.exports = isError

},{}],5:[function(require,module,exports){
"use strict";

var reduced = require("./reduced")

function isReduced(value) {
  return value && value.is === reduced
}

module.exports = isReduced

},{"./reduced":8}],6:[function(require,module,exports){
"use strict";

var defineProperty = Object.defineProperty || function(object, name, property) {
  object[name] = property.value
  return object
}

// Shortcut for `Object.prototype.toString` for faster access.
var typefy = Object.prototype.toString

// Map to for jumping from typeof(value) to associated type prefix used
// as a hash in the map of builtin implementations.
var types = { "function": "Object", "object": "Object" }

// Array is used to save method implementations for the host objects in order
// to avoid extending them with non-primitive values that could cause leaks.
var host = []
// Hash map is used to save method implementations for builtin types in order
// to avoid extending their prototypes. This also allows to share method
// implementations for types across diff contexts / frames / compartments.
var builtin = {}

function Primitive() {}
function ObjectType() {}
ObjectType.prototype = new Primitive()
function ErrorType() {}
ErrorType.prototype = new ObjectType()

var Default = builtin.Default = Primitive.prototype
var Null = builtin.Null = new Primitive()
var Void = builtin.Void = new Primitive()
builtin.String = new Primitive()
builtin.Number = new Primitive()
builtin.Boolean = new Primitive()

builtin.Object = ObjectType.prototype
builtin.Error = ErrorType.prototype

builtin.EvalError = new ErrorType()
builtin.InternalError = new ErrorType()
builtin.RangeError = new ErrorType()
builtin.ReferenceError = new ErrorType()
builtin.StopIteration = new ErrorType()
builtin.SyntaxError = new ErrorType()
builtin.TypeError = new ErrorType()
builtin.URIError = new ErrorType()


function Method(id) {
  /**
  Private Method is a callable private name that dispatches on the first
  arguments same named Method:

      method(object, ...rest) => object[method](...rest)

  It is supposed to be given **unique** `id` preferably in `"jump@package"`
  like form so it won't collide with `id's` other users create. If no argument
  is passed unique id is generated, but it's proved to be problematic with
  npm where it's easy to end up with a copies of same module where each copy
  will have a different name.

  ## Example

      var foo = Method("foo@awesomeness")

      // Implementation for any types
      foo.define(function(value, arg1, arg2) {
        // ...
      })

      // Implementation for a specific type
      foo.define(BarType, function(bar, arg1, arg2) {
        // ...
      })
  **/

  // Create an internal unique name if one is not provided, also prefix it
  // to avoid collision with regular method names.
  var name = "λ:" + String(id || Math.random().toString(32).substr(2))

  function dispatch(value) {
    // Method dispatches on type of the first argument.
    // If first argument is `null` or `void` associated implementation is
    // looked up in the `builtin` hash where implementations for built-ins
    // are stored.
    var type = null
    var method = value === null ? Null[name] :
                 value === void(0) ? Void[name] :
                 // Otherwise attempt to use method with a generated private
                 // `name` that is supposedly in the prototype chain of the
                 // `target`.
                 value[name] ||
                 // Otherwise assume it's one of the built-in type instances,
                 // in which case implementation is stored in a `builtin` hash.
                 // Attempt to find a implementation for the given built-in
                 // via constructor name and method name.
                 ((type = builtin[(value.constructor || "").name]) &&
                  type[name]) ||
                 // Otherwise assume it's a host object. For host objects
                 // actual method implementations are stored in the `host`
                 // array and only index for the implementation is stored
                 // in the host object's prototype chain. This avoids memory
                 // leaks that otherwise could happen when saving JS objects
                 // on host object.
                 host[value["!" + name]] ||
                 // Otherwise attempt to lookup implementation for builtins by
                 // a type of the value. This basically makes sure that all
                 // non primitive values will delegate to an `Object`.
                 ((type = builtin[types[typeof(value)]]) && type[name])


    // If method implementation for the type is still not found then
    // just fallback for default implementation.
    method = method || Default[name]

    // If implementation is still not found (which also means there is no
    // default) just throw an error with a descriptive message.
    if (!method) throw TypeError("Type does not implements method: " + name)

    // If implementation was found then just delegate.
    return method.apply(method, arguments)
  }

  // Make `toString` of the dispatch return a private name, this enables
  // method definition without sugar:
  //
  //    var method = Method()
  //    object[method] = function() { /***/ }
  dispatch.toString = function toString() { return name }

  // Copy utility methods for convenient API.
  dispatch.implement = implementMethod
  dispatch.define = defineMethod

  return dispatch
}

// Create method shortcuts form functions.
var defineMethod = function defineMethod(Type, lambda) {
  return define(this, Type, lambda)
}
var implementMethod = function implementMethod(object, lambda) {
  return implement(this, object, lambda)
}

// Define `implement` and `define` polymorphic methods to allow definitions
// and implementations through them.
var implement = Method("implement@method")
var define = Method("define@method")


function _implement(method, object, lambda) {
  /**
  Implements `Method` for the given `object` with a provided `implementation`.
  Calling `Method` with `object` as a first argument will dispatch on provided
  implementation.
  **/
  return defineProperty(object, method.toString(), {
    enumerable: false,
    configurable: false,
    writable: false,
    value: lambda
  })
}

function _define(method, Type, lambda) {
  /**
  Defines `Method` for the given `Type` with a provided `implementation`.
  Calling `Method` with a first argument of this `Type` will dispatch on
  provided `implementation`. If `Type` is a `Method` default implementation
  is defined. If `Type` is a `null` or `undefined` `Method` is implemented
  for that value type.
  **/

  // Attempt to guess a type via `Object.prototype.toString.call` hack.
  var type = Type && typefy.call(Type.prototype)

  // If only two arguments are passed then `Type` is actually an implementation
  // for a default type.
  if (!lambda) Default[method] = Type
  // If `Type` is `null` or `void` store implementation accordingly.
  else if (Type === null) Null[method] = lambda
  else if (Type === void(0)) Void[method] = lambda
  // If `type` hack indicates built-in type and type has a name us it to
  // store a implementation into associated hash. If hash for this type does
  // not exists yet create one.
  else if (type !== "[object Object]" && Type.name) {
    var Bulitin = builtin[Type.name] || (builtin[Type.name] = new ObjectType())
    Bulitin[method] = lambda
  }
  // If `type` hack indicates an object, that may be either object or any
  // JS defined "Class". If name of the constructor is `Object`, assume it's
  // built-in `Object` and store implementation accordingly.
  else if (Type.name === "Object")
    builtin.Object[method] = lambda
  // Host objects are pain!!! Every browser does some crazy stuff for them
  // So far all browser seem to not implement `call` method for host object
  // constructors. If that is a case here, assume it's a host object and
  // store implementation in a `host` array and store `index` in the array
  // in a `Type.prototype` itself. This avoids memory leaks that could be
  // caused by storing JS objects on a host objects.
  else if (Type.call === void(0)) {
    var index = host.indexOf(lambda)
    if (index < 0) index = host.push(lambda) - 1
    // Prefix private name with `!` so it can be dispatched from the method
    // without type checks.
    implement("!" + method, Type.prototype, index)
  }
  // If Got that far `Type` is user defined JS `Class`. Define private name
  // as hidden property on it's prototype.
  else
    implement(method, Type.prototype, lambda)
}

// And provided implementations for a polymorphic equivalents.
_define(define, _define)
_define(implement, _implement)

// Define exports on `Method` as it's only thing being exported.
Method.implement = implement
Method.define = define
Method.Method = Method
Method.method = Method
Method.builtin = builtin
Method.host = host

module.exports = Method

},{}],7:[function(require,module,exports){
"use strict";

var method = require("method")

var isReduced = require("./is-reduced")
var isError = require("./is-error")
var end = require("./end")

var reduce = method("reduce@reducible")

// Implementation of `reduce` for the empty collections, that immediately
// signals reducer that it's ended.
reduce.empty = function reduceEmpty(empty, next, initial) {
  next(end, initial)
}

// Implementation of `reduce` for the singular values which are treated
// as collections with a single element. Yields a value and signals the end.
reduce.singular = function reduceSingular(value, next, initial) {
  next(end, next(value, initial))
}

// Implementation of `reduce` for the array (and alike) values, such that it
// will call accumulator function `next` each time with next item and
// accumulated state until it's exhausted or `next` returns marked value
// indicating that it's reduced. Either way signals `end` to an accumulator.
reduce.indexed = function reduceIndexed(indexed, next, initial) {
  var state = initial
  var index = 0
  var count = indexed.length
  while (index < count) {
    var value = indexed[index]
    state = next(value, state)
    index = index + 1
    if (value === end) return end
    if (isError(value)) return state
    if (isReduced(state)) return state.value
  }
  next(end, state)
}

// Both `undefined` and `null` implement accumulate for empty sequences.
reduce.define(void(0), reduce.empty)
reduce.define(null, reduce.empty)

// Array and arguments implement accumulate for indexed sequences.
reduce.define(Array, reduce.indexed)

function Arguments() { return arguments }
Arguments.prototype = Arguments()
reduce.define(Arguments, reduce.indexed)

// All other built-in data types are treated as single value collections
// by default. Of course individual types may choose to override that.
reduce.define(reduce.singular)

// Errors just yield that error.
reduce.define(Error, function(error, next) { next(error) })
module.exports = reduce

},{"./end":3,"./is-error":4,"./is-reduced":5,"method":6}],8:[function(require,module,exports){
"use strict";


// Exported function can be used for boxing values. This boxing indicates
// that consumer of sequence has finished consuming it, there for new values
// should not be no longer pushed.
function reduced(value) {
  /**
  Boxes given value and indicates to a source that it's already reduced and
  no new values should be supplied
  **/
  return { value: value, is: reduced }
}

module.exports = reduced

},{}],9:[function(require,module,exports){
"use strict";

var method = require("method")
var send = method("send")

module.exports = send

},{"method":2}],10:[function(require,module,exports){
var events = require('event');

console.log('Hello, World');
console.log(events);

},{"event":1}]},{},[10])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZXZlbnQvZXZlbnQuanMiLCJub2RlX21vZHVsZXMvZXZlbnQvbm9kZV9tb2R1bGVzL21ldGhvZC9jb3JlLmpzIiwibm9kZV9tb2R1bGVzL2V2ZW50L25vZGVfbW9kdWxlcy9yZWR1Y2libGUvZW5kLmpzIiwibm9kZV9tb2R1bGVzL2V2ZW50L25vZGVfbW9kdWxlcy9yZWR1Y2libGUvaXMtZXJyb3IuanMiLCJub2RlX21vZHVsZXMvZXZlbnQvbm9kZV9tb2R1bGVzL3JlZHVjaWJsZS9pcy1yZWR1Y2VkLmpzIiwibm9kZV9tb2R1bGVzL2V2ZW50L25vZGVfbW9kdWxlcy9yZWR1Y2libGUvbm9kZV9tb2R1bGVzL21ldGhvZC9jb3JlLmpzIiwibm9kZV9tb2R1bGVzL2V2ZW50L25vZGVfbW9kdWxlcy9yZWR1Y2libGUvcmVkdWNlLmpzIiwibm9kZV9tb2R1bGVzL2V2ZW50L25vZGVfbW9kdWxlcy9yZWR1Y2libGUvcmVkdWNlZC5qcyIsIm5vZGVfbW9kdWxlcy9ldmVudC9zZW5kLmpzIiwiL2hvbWUvY3JhYnNiZWFyZC9kZXYvcmVhY3Rqcy9jaGlycGVyL3NyYy9tYWluLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDak9BO0FBQ0E7QUFDQTtBQUNBOztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNOQSxJQUFJLE1BQU0sR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7O0FBRTlCLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7QUFDNUIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHNlbmQgPSByZXF1aXJlKFwiLi9zZW5kXCIpXG52YXIgcmVkdWNlID0gcmVxdWlyZShcInJlZHVjaWJsZS9yZWR1Y2VcIilcbnZhciBpc1JlZHVjZWQgPSByZXF1aXJlKFwicmVkdWNpYmxlL2lzLXJlZHVjZWRcIilcbnZhciBpc0Vycm9yID0gcmVxdWlyZShcInJlZHVjaWJsZS9pcy1lcnJvclwiKVxudmFyIHJlZHVjZWQgPSByZXF1aXJlKFwicmVkdWNpYmxlL3JlZHVjZWRcIilcbnZhciBlbmQgPSByZXF1aXJlKFwicmVkdWNpYmxlL2VuZFwiKVxuXG4vLyBgRXZlbnRgIGlzIGRhdGEgdHlwZSByZXByZXNlbnRpbmcgYSBzdHJlYW0gb2YgdmFsdWVzIHRoYXQgY2FuIGJlIGRpc3BhdGNoZWRcbi8vIG1hbnVhbGx5IGluIGFuIGltcGVyYXRpdmUgc3R5bGUgYnkgY2FsbGluZyBgc2VuZChldmVudCwgdmFsdWUpYFxuZnVuY3Rpb24gRXZlbnQoKSB7fVxuXG4vLyBgRXZlbnRgIHR5cGUgaGFzIGludGVybmFsIHByb3BlcnR5IG9mIGZvciBhZ2dyZWdhdGluZyBgd2F0Y2hlcnNgLiBUaGlzXG4vLyBwcm9wZXJ0eSBoYXMgYSB1bmlxdWUgbmFtZSBhbmQgaXMgaW50ZW50aW9uYWxseSBtYWRlIG5vbi1lbnVtZXJhYmxlIChpblxuLy8gYSBmdXR1cmUgaXQgd2lsbCBiZSBhIHByaXZhdGUgbmFtZXNcbi8vIGh0dHA6Ly93aWtpLmVjbWFzY3JpcHQub3JnL2Rva3UucGhwP2lkPWhhcm1vbnk6cHJpdmF0ZV9uYW1lX29iamVjdHMpIHNvXG4vLyB0aGF0IGl0J3MgYmVoYXZpb3IgY2FuIG5vdCBiZSB0ZW1wZXJlZC5cbnZhciByZWR1Y2VyID0gXCJ3YXRjaGVyc0BcIiArIG1vZHVsZS5pZFxudmFyIHN0YXRlID0gXCJzdGF0ZUBcIiArIG1vZHVsZS5pZFxudmFyIGVuZGVkID0gXCJlbmRlZEBcIiArIG1vZHVsZS5pZFxuT2JqZWN0LmRlZmluZVByb3BlcnR5KEV2ZW50LnByb3RvdHlwZSwgc3RhdGUsIHtcbiAgdmFsdWU6IHZvaWQoMCksIGVudW1lcmFibGU6IGZhbHNlLCBjb25maWd1cmFibGU6IGZhbHNlLCB3cml0YWJsZTogdHJ1ZVxufSlcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShFdmVudC5wcm90b3R5cGUsIHJlZHVjZXIsIHtcbiAgdmFsdWU6IHZvaWQoMCksIGVudW1lcmFibGU6IGZhbHNlLCBjb25maWd1cmFibGU6IGZhbHNlLCB3cml0YWJsZTogdHJ1ZVxufSlcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShFdmVudC5wcm90b3R5cGUsIGVuZGVkLCB7XG4gIHZhbHVlOiBmYWxzZSwgZW51bWVyYWJsZTogZmFsc2UsIGNvbmZpZ3VyYWJsZTogZmFsc2UsIHdyaXRhYmxlOiB0cnVlXG59KVxuXG5cblxuLy8gIyMgc2VuZFxuLy9cbi8vIGBFdmVudGAgdHlwZSBpbXBsZW1lbnRzIGBzZW5kYCBhcyBhIHByaW1hcnkgbWVjaGFuaXNtIGZvciBkaXNwYXRjaGluZyBuZXdcbi8vICB2YWx1ZXMgb2YgdGhlIGdpdmVuIGBldmVudGAuIEFsbCBvZiB0aGUgYHdhdGNoZXJzYCBvZiB0aGUgYGV2ZW50YCB3aWxsXG4vLyAgYmUgaW52b2tlZCBpbiBGSUZPIG9yZGVyLiBBbnkgbmV3IGB3YXRjaGVyc2AgYWRkZWQgaW4gc2lkZSBlZmZlY3QgdG8gdGhpc1xuLy8gIGNhbGwgd2lsbCBub3QgYmUgaW52b2tlZCB1bnRpbCBuZXh0IGBzZW5kYC4gTm90ZSBhdCB0aGlzIHBvaW50IGBzZW5kYCB3aWxsXG4vLyAgcmV0dXJuIGBmYWxzZWAgaWYgbm8gd2F0Y2hlcnMgaGF2ZSBiZWluZyBpbnZva2VkIGFuZCB3aWxsIHJldHVybiBgdHJ1ZWBcbi8vICBvdGhlcndpc2UsIGFsdGhvdWdoIHRoaXMgaW1wbGVtZW50YXRpb24gZGV0YWlsIGlzIG5vdCBndWFyYW50ZWVkIGFuZCBtYXlcbi8vICBjaGFuZ2UgaW4gYSBmdXR1cmUuXG5zZW5kLmRlZmluZShFdmVudCwgZnVuY3Rpb24gc2VuZEV2ZW50KGV2ZW50LCB2YWx1ZSkge1xuICAvLyBFdmVudCBtYXkgb25seSBiZSByZWR1Y2VkIGJ5IG9uZSBjb25zdW1lciBmdW5jdGlvbi5cbiAgLy8gT3RoZXIgZGF0YSB0eXBlcyBidWlsdCBvbiB0b3Agb2Ygc2lnbmFsIG1heSBhbGxvdyBmb3IgbW9yZSBjb25zdW1lcnMuXG4gIGlmIChldmVudFtlbmRlZF0pIHJldHVybiByZWR1Y2VkKClcbiAgaWYgKHZhbHVlID09PSBlbmQgfHwgaXNFcnJvcih2YWx1ZSkpIGV2ZW50W2VuZGVkXSA9IHRydWVcblxuICB2YXIgbmV4dCA9IGV2ZW50W3JlZHVjZXJdXG4gIGlmIChuZXh0KSB7XG4gICAgdmFyIHJlc3VsdCA9IG5leHQodmFsdWUsIGV2ZW50W3N0YXRlXSlcbiAgICBpZiAoaXNSZWR1Y2VkKHJlc3VsdCkgfHwgZXZlbnRbZW5kZWRdKVxuICAgICAgZXZlbnRbcmVkdWNlcl0gPSBldmVudFtzdGF0ZV0gPSB2b2lkKDApXG4gICAgZWxzZSBldmVudFtzdGF0ZV0gPSByZXN1bHRcbiAgfVxufSlcblxucmVkdWNlLmRlZmluZShFdmVudCwgZnVuY3Rpb24oZXZlbnQsIG5leHQsIGluaXRpYWwpIHtcbiAgLy8gRXZlbnQgbWF5IG9ubHkgYmUgcmVkdWNlZCBieSBvbmUgY29uc3VtZXIgZnVuY3Rpb24uXG4gIC8vIE90aGVyIGRhdGEgdHlwZXMgYnVpbHQgb24gdG9wIG9mIHNpZ25hbCBtYXkgYWxsb3cgZm9yIG1vcmUgY29uc3VtZXJzLlxuICBpZiAoZXZlbnRbcmVkdWNlcl0gfHwgZXZlbnRbZW5kZWRdKVxuICAgIHJldHVybiBuZXh0KEVycm9yKFwiRXZlbnQgaXMgYWxyZWFkeSByZWR1Y2VkXCIpLCBpbml0aWFsKVxuICBldmVudFtyZWR1Y2VyXSA9IG5leHRcbiAgZXZlbnRbc3RhdGVdID0gaW5pdGlhbFxufSlcblxuZnVuY3Rpb24gZXZlbnQoKSB7XG4gIC8qKlxuICBGdW5jdGlvbiBjcmVhdGVzIG5ldyBgRXZlbnRgIHRoYXQgY2FuIGJlIGB3YXRjaGVkYCBmb3IgYSBuZXcgdmFsdWVzIGBzZW5kYC1lZFxuICBvbiBpdC4gQWxzbyBgc2VuZGAgZnVuY3Rpb24gY2FuIGJlIHVzZWQgb24gcmV0dXJuZWQgaW5zdGFuY2UgdG8gc2VuZCBuZXdcbiAgdmFsdWVzLlxuXG4gICMjIEV4YW1wbGVcblxuICAgICAgdmFyIGUgPSBldmVudCgpXG5cbiAgICAgIHNlbmQoZSwgMClcblxuICAgICAgcmVkdWNlKGUsIGZ1bmN0aW9uKGluZGV4LCB2YWx1ZSkge1xuICAgICAgICBjb25zb2xlLmxvZyhcIj0+XCIsIGluZGV4LCB2YWx1ZSlcbiAgICAgICAgcmV0dXJuIGluZGV4ICsgMVxuICAgICAgfSwgMClcblxuICAgICAgc2VuZChlLCBcImFcIikgLy8gPT4gMCBcImFcIlxuICAgICAgc2VuZChlLCBcImJcIikgLy8gPT4gMCBcImJcIlxuICAqKi9cbiAgcmV0dXJuIG5ldyBFdmVudCgpXG59XG5ldmVudC50eXBlID0gRXZlbnRcblxubW9kdWxlLmV4cG9ydHMgPSBldmVudFxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkZWZpbmVQcm9wZXJ0eSA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eSB8fCBmdW5jdGlvbihvYmplY3QsIG5hbWUsIHByb3BlcnR5KSB7XG4gIG9iamVjdFtuYW1lXSA9IHByb3BlcnR5LnZhbHVlXG4gIHJldHVybiBvYmplY3Rcbn1cblxuLy8gU2hvcnRjdXQgZm9yIGBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nYCBmb3IgZmFzdGVyIGFjY2Vzcy5cbnZhciB0eXBlZnkgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nXG5cbi8vIE1hcCB0byBmb3IganVtcGluZyBmcm9tIHR5cGVvZih2YWx1ZSkgdG8gYXNzb2NpYXRlZCB0eXBlIHByZWZpeCB1c2VkXG4vLyBhcyBhIGhhc2ggaW4gdGhlIG1hcCBvZiBidWlsdGluIGltcGxlbWVudGF0aW9ucy5cbnZhciB0eXBlcyA9IHsgXCJmdW5jdGlvblwiOiBcIk9iamVjdFwiLCBcIm9iamVjdFwiOiBcIk9iamVjdFwiIH1cblxuLy8gQXJyYXkgaXMgdXNlZCB0byBzYXZlIG1ldGhvZCBpbXBsZW1lbnRhdGlvbnMgZm9yIHRoZSBob3N0IG9iamVjdHMgaW4gb3JkZXJcbi8vIHRvIGF2b2lkIGV4dGVuZGluZyB0aGVtIHdpdGggbm9uLXByaW1pdGl2ZSB2YWx1ZXMgdGhhdCBjb3VsZCBjYXVzZSBsZWFrcy5cbnZhciBob3N0ID0gW11cbi8vIEhhc2ggbWFwIGlzIHVzZWQgdG8gc2F2ZSBtZXRob2QgaW1wbGVtZW50YXRpb25zIGZvciBidWlsdGluIHR5cGVzIGluIG9yZGVyXG4vLyB0byBhdm9pZCBleHRlbmRpbmcgdGhlaXIgcHJvdG90eXBlcy4gVGhpcyBhbHNvIGFsbG93cyB0byBzaGFyZSBtZXRob2Rcbi8vIGltcGxlbWVudGF0aW9ucyBmb3IgdHlwZXMgYWNyb3NzIGRpZmYgY29udGV4dHMgLyBmcmFtZXMgLyBjb21wYXJ0bWVudHMuXG52YXIgYnVpbHRpbiA9IHt9XG5cbmZ1bmN0aW9uIFByaW1pdGl2ZSgpIHt9XG5mdW5jdGlvbiBPYmplY3RUeXBlKCkge31cbk9iamVjdFR5cGUucHJvdG90eXBlID0gbmV3IFByaW1pdGl2ZSgpXG5mdW5jdGlvbiBFcnJvclR5cGUoKSB7fVxuRXJyb3JUeXBlLnByb3RvdHlwZSA9IG5ldyBPYmplY3RUeXBlKClcblxudmFyIERlZmF1bHQgPSBidWlsdGluLkRlZmF1bHQgPSBQcmltaXRpdmUucHJvdG90eXBlXG52YXIgTnVsbCA9IGJ1aWx0aW4uTnVsbCA9IG5ldyBQcmltaXRpdmUoKVxudmFyIFZvaWQgPSBidWlsdGluLlZvaWQgPSBuZXcgUHJpbWl0aXZlKClcbmJ1aWx0aW4uU3RyaW5nID0gbmV3IFByaW1pdGl2ZSgpXG5idWlsdGluLk51bWJlciA9IG5ldyBQcmltaXRpdmUoKVxuYnVpbHRpbi5Cb29sZWFuID0gbmV3IFByaW1pdGl2ZSgpXG5cbmJ1aWx0aW4uT2JqZWN0ID0gT2JqZWN0VHlwZS5wcm90b3R5cGVcbmJ1aWx0aW4uRXJyb3IgPSBFcnJvclR5cGUucHJvdG90eXBlXG5cbmJ1aWx0aW4uRXZhbEVycm9yID0gbmV3IEVycm9yVHlwZSgpXG5idWlsdGluLkludGVybmFsRXJyb3IgPSBuZXcgRXJyb3JUeXBlKClcbmJ1aWx0aW4uUmFuZ2VFcnJvciA9IG5ldyBFcnJvclR5cGUoKVxuYnVpbHRpbi5SZWZlcmVuY2VFcnJvciA9IG5ldyBFcnJvclR5cGUoKVxuYnVpbHRpbi5TdG9wSXRlcmF0aW9uID0gbmV3IEVycm9yVHlwZSgpXG5idWlsdGluLlN5bnRheEVycm9yID0gbmV3IEVycm9yVHlwZSgpXG5idWlsdGluLlR5cGVFcnJvciA9IG5ldyBFcnJvclR5cGUoKVxuYnVpbHRpbi5VUklFcnJvciA9IG5ldyBFcnJvclR5cGUoKVxuXG5cbmZ1bmN0aW9uIE1ldGhvZChoaW50KSB7XG4gIC8qKlxuICBQcml2YXRlIE1ldGhvZCBpcyBhIGNhbGxhYmxlIHByaXZhdGUgbmFtZSB0aGF0IGRpc3BhdGNoZXMgb24gdGhlIGZpcnN0XG4gIGFyZ3VtZW50cyBzYW1lIG5hbWVkIE1ldGhvZDpcblxuICAgICAgbWV0aG9kKG9iamVjdCwgLi4ucmVzdCkgPT4gb2JqZWN0W21ldGhvZF0oLi4ucmVzdClcblxuICBPcHRpb25hbGx5IGhpbnQgc3RyaW5nIG1heSBiZSBwcm92aWRlZCB0aGF0IHdpbGwgYmUgdXNlZCBpbiBnZW5lcmF0ZWQgbmFtZXNcbiAgdG8gZWFzZSBkZWJ1Z2dpbmcuXG5cbiAgIyMgRXhhbXBsZVxuXG4gICAgICB2YXIgZm9vID0gTWV0aG9kKClcblxuICAgICAgLy8gSW1wbGVtZW50YXRpb24gZm9yIGFueSB0eXBlc1xuICAgICAgZm9vLmRlZmluZShmdW5jdGlvbih2YWx1ZSwgYXJnMSwgYXJnMikge1xuICAgICAgICAvLyAuLi5cbiAgICAgIH0pXG5cbiAgICAgIC8vIEltcGxlbWVudGF0aW9uIGZvciBhIHNwZWNpZmljIHR5cGVcbiAgICAgIGZvby5kZWZpbmUoQmFyVHlwZSwgZnVuY3Rpb24oYmFyLCBhcmcxLCBhcmcyKSB7XG4gICAgICAgIC8vIC4uLlxuICAgICAgfSlcbiAgKiovXG5cbiAgLy8gQ3JlYXRlIGFuIGludGVybmFsIHVuaXF1ZSBuYW1lIGlmIGBoaW50YCBpcyBwcm92aWRlZCBpdCBpcyB1c2VkIHRvXG4gIC8vIHByZWZpeCBuYW1lIHRvIGVhc2UgZGVidWdnaW5nLlxuICB2YXIgbmFtZSA9IChoaW50IHx8IFwiXCIpICsgXCIjXCIgKyBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDMyKS5zdWJzdHIoMilcblxuICBmdW5jdGlvbiBkaXNwYXRjaCh2YWx1ZSkge1xuICAgIC8vIE1ldGhvZCBkaXNwYXRjaGVzIG9uIHR5cGUgb2YgdGhlIGZpcnN0IGFyZ3VtZW50LlxuICAgIC8vIElmIGZpcnN0IGFyZ3VtZW50IGlzIGBudWxsYCBvciBgdm9pZGAgYXNzb2NpYXRlZCBpbXBsZW1lbnRhdGlvbiBpc1xuICAgIC8vIGxvb2tlZCB1cCBpbiB0aGUgYGJ1aWx0aW5gIGhhc2ggd2hlcmUgaW1wbGVtZW50YXRpb25zIGZvciBidWlsdC1pbnNcbiAgICAvLyBhcmUgc3RvcmVkLlxuICAgIHZhciB0eXBlID0gbnVsbFxuICAgIHZhciBtZXRob2QgPSB2YWx1ZSA9PT0gbnVsbCA/IE51bGxbbmFtZV0gOlxuICAgICAgICAgICAgICAgICB2YWx1ZSA9PT0gdm9pZCgwKSA/IFZvaWRbbmFtZV0gOlxuICAgICAgICAgICAgICAgICAvLyBPdGhlcndpc2UgYXR0ZW1wdCB0byB1c2UgbWV0aG9kIHdpdGggYSBnZW5lcmF0ZWQgcHJpdmF0ZVxuICAgICAgICAgICAgICAgICAvLyBgbmFtZWAgdGhhdCBpcyBzdXBwb3NlZGx5IGluIHRoZSBwcm90b3R5cGUgY2hhaW4gb2YgdGhlXG4gICAgICAgICAgICAgICAgIC8vIGB0YXJnZXRgLlxuICAgICAgICAgICAgICAgICB2YWx1ZVtuYW1lXSB8fFxuICAgICAgICAgICAgICAgICAvLyBPdGhlcndpc2UgYXNzdW1lIGl0J3Mgb25lIG9mIHRoZSBidWlsdC1pbiB0eXBlIGluc3RhbmNlcyxcbiAgICAgICAgICAgICAgICAgLy8gaW4gd2hpY2ggY2FzZSBpbXBsZW1lbnRhdGlvbiBpcyBzdG9yZWQgaW4gYSBgYnVpbHRpbmAgaGFzaC5cbiAgICAgICAgICAgICAgICAgLy8gQXR0ZW1wdCB0byBmaW5kIGEgaW1wbGVtZW50YXRpb24gZm9yIHRoZSBnaXZlbiBidWlsdC1pblxuICAgICAgICAgICAgICAgICAvLyB2aWEgY29uc3RydWN0b3IgbmFtZSBhbmQgbWV0aG9kIG5hbWUuXG4gICAgICAgICAgICAgICAgICgodHlwZSA9IGJ1aWx0aW5bKHZhbHVlLmNvbnN0cnVjdG9yIHx8IFwiXCIpLm5hbWVdKSAmJlxuICAgICAgICAgICAgICAgICAgdHlwZVtuYW1lXSkgfHxcbiAgICAgICAgICAgICAgICAgLy8gT3RoZXJ3aXNlIGFzc3VtZSBpdCdzIGEgaG9zdCBvYmplY3QuIEZvciBob3N0IG9iamVjdHNcbiAgICAgICAgICAgICAgICAgLy8gYWN0dWFsIG1ldGhvZCBpbXBsZW1lbnRhdGlvbnMgYXJlIHN0b3JlZCBpbiB0aGUgYGhvc3RgXG4gICAgICAgICAgICAgICAgIC8vIGFycmF5IGFuZCBvbmx5IGluZGV4IGZvciB0aGUgaW1wbGVtZW50YXRpb24gaXMgc3RvcmVkXG4gICAgICAgICAgICAgICAgIC8vIGluIHRoZSBob3N0IG9iamVjdCdzIHByb3RvdHlwZSBjaGFpbi4gVGhpcyBhdm9pZHMgbWVtb3J5XG4gICAgICAgICAgICAgICAgIC8vIGxlYWtzIHRoYXQgb3RoZXJ3aXNlIGNvdWxkIGhhcHBlbiB3aGVuIHNhdmluZyBKUyBvYmplY3RzXG4gICAgICAgICAgICAgICAgIC8vIG9uIGhvc3Qgb2JqZWN0LlxuICAgICAgICAgICAgICAgICBob3N0W3ZhbHVlW1wiIVwiICsgbmFtZV1dIHx8XG4gICAgICAgICAgICAgICAgIC8vIE90aGVyd2lzZSBhdHRlbXB0IHRvIGxvb2t1cCBpbXBsZW1lbnRhdGlvbiBmb3IgYnVpbHRpbnMgYnlcbiAgICAgICAgICAgICAgICAgLy8gYSB0eXBlIG9mIHRoZSB2YWx1ZS4gVGhpcyBiYXNpY2FsbHkgbWFrZXMgc3VyZSB0aGF0IGFsbFxuICAgICAgICAgICAgICAgICAvLyBub24gcHJpbWl0aXZlIHZhbHVlcyB3aWxsIGRlbGVnYXRlIHRvIGFuIGBPYmplY3RgLlxuICAgICAgICAgICAgICAgICAoKHR5cGUgPSBidWlsdGluW3R5cGVzW3R5cGVvZih2YWx1ZSldXSkgJiYgdHlwZVtuYW1lXSlcblxuXG4gICAgLy8gSWYgbWV0aG9kIGltcGxlbWVudGF0aW9uIGZvciB0aGUgdHlwZSBpcyBzdGlsbCBub3QgZm91bmQgdGhlblxuICAgIC8vIGp1c3QgZmFsbGJhY2sgZm9yIGRlZmF1bHQgaW1wbGVtZW50YXRpb24uXG4gICAgbWV0aG9kID0gbWV0aG9kIHx8IERlZmF1bHRbbmFtZV1cblxuXG4gICAgLy8gSWYgaW1wbGVtZW50YXRpb24gaXMgc3RpbGwgbm90IGZvdW5kICh3aGljaCBhbHNvIG1lYW5zIHRoZXJlIGlzIG5vXG4gICAgLy8gZGVmYXVsdCkganVzdCB0aHJvdyBhbiBlcnJvciB3aXRoIGEgZGVzY3JpcHRpdmUgbWVzc2FnZS5cbiAgICBpZiAoIW1ldGhvZCkgdGhyb3cgVHlwZUVycm9yKFwiVHlwZSBkb2VzIG5vdCBpbXBsZW1lbnRzIG1ldGhvZDogXCIgKyBuYW1lKVxuXG4gICAgLy8gSWYgaW1wbGVtZW50YXRpb24gd2FzIGZvdW5kIHRoZW4ganVzdCBkZWxlZ2F0ZS5cbiAgICByZXR1cm4gbWV0aG9kLmFwcGx5KG1ldGhvZCwgYXJndW1lbnRzKVxuICB9XG5cbiAgLy8gTWFrZSBgdG9TdHJpbmdgIG9mIHRoZSBkaXNwYXRjaCByZXR1cm4gYSBwcml2YXRlIG5hbWUsIHRoaXMgZW5hYmxlc1xuICAvLyBtZXRob2QgZGVmaW5pdGlvbiB3aXRob3V0IHN1Z2FyOlxuICAvL1xuICAvLyAgICB2YXIgbWV0aG9kID0gTWV0aG9kKClcbiAgLy8gICAgb2JqZWN0W21ldGhvZF0gPSBmdW5jdGlvbigpIHsgLyoqKi8gfVxuICBkaXNwYXRjaC50b1N0cmluZyA9IGZ1bmN0aW9uIHRvU3RyaW5nKCkgeyByZXR1cm4gbmFtZSB9XG5cbiAgLy8gQ29weSB1dGlsaXR5IG1ldGhvZHMgZm9yIGNvbnZlbmllbnQgQVBJLlxuICBkaXNwYXRjaC5pbXBsZW1lbnQgPSBpbXBsZW1lbnRNZXRob2RcbiAgZGlzcGF0Y2guZGVmaW5lID0gZGVmaW5lTWV0aG9kXG5cbiAgcmV0dXJuIGRpc3BhdGNoXG59XG5cbi8vIENyZWF0ZSBtZXRob2Qgc2hvcnRjdXRzIGZvcm0gZnVuY3Rpb25zLlxudmFyIGRlZmluZU1ldGhvZCA9IGZ1bmN0aW9uIGRlZmluZU1ldGhvZChUeXBlLCBsYW1iZGEpIHtcbiAgcmV0dXJuIGRlZmluZSh0aGlzLCBUeXBlLCBsYW1iZGEpXG59XG52YXIgaW1wbGVtZW50TWV0aG9kID0gZnVuY3Rpb24gaW1wbGVtZW50TWV0aG9kKG9iamVjdCwgbGFtYmRhKSB7XG4gIHJldHVybiBpbXBsZW1lbnQodGhpcywgb2JqZWN0LCBsYW1iZGEpXG59XG5cbi8vIERlZmluZSBgaW1wbGVtZW50YCBhbmQgYGRlZmluZWAgcG9seW1vcnBoaWMgbWV0aG9kcyB0byBhbGxvdyBkZWZpbml0aW9uc1xuLy8gYW5kIGltcGxlbWVudGF0aW9ucyB0aHJvdWdoIHRoZW0uXG52YXIgaW1wbGVtZW50ID0gTWV0aG9kKFwiaW1wbGVtZW50XCIpXG52YXIgZGVmaW5lID0gTWV0aG9kKFwiZGVmaW5lXCIpXG5cblxuZnVuY3Rpb24gX2ltcGxlbWVudChtZXRob2QsIG9iamVjdCwgbGFtYmRhKSB7XG4gIC8qKlxuICBJbXBsZW1lbnRzIGBNZXRob2RgIGZvciB0aGUgZ2l2ZW4gYG9iamVjdGAgd2l0aCBhIHByb3ZpZGVkIGBpbXBsZW1lbnRhdGlvbmAuXG4gIENhbGxpbmcgYE1ldGhvZGAgd2l0aCBgb2JqZWN0YCBhcyBhIGZpcnN0IGFyZ3VtZW50IHdpbGwgZGlzcGF0Y2ggb24gcHJvdmlkZWRcbiAgaW1wbGVtZW50YXRpb24uXG4gICoqL1xuICByZXR1cm4gZGVmaW5lUHJvcGVydHkob2JqZWN0LCBtZXRob2QudG9TdHJpbmcoKSwge1xuICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgIGNvbmZpZ3VyYWJsZTogZmFsc2UsXG4gICAgd3JpdGFibGU6IGZhbHNlLFxuICAgIHZhbHVlOiBsYW1iZGFcbiAgfSlcbn1cblxuZnVuY3Rpb24gX2RlZmluZShtZXRob2QsIFR5cGUsIGxhbWJkYSkge1xuICAvKipcbiAgRGVmaW5lcyBgTWV0aG9kYCBmb3IgdGhlIGdpdmVuIGBUeXBlYCB3aXRoIGEgcHJvdmlkZWQgYGltcGxlbWVudGF0aW9uYC5cbiAgQ2FsbGluZyBgTWV0aG9kYCB3aXRoIGEgZmlyc3QgYXJndW1lbnQgb2YgdGhpcyBgVHlwZWAgd2lsbCBkaXNwYXRjaCBvblxuICBwcm92aWRlZCBgaW1wbGVtZW50YXRpb25gLiBJZiBgVHlwZWAgaXMgYSBgTWV0aG9kYCBkZWZhdWx0IGltcGxlbWVudGF0aW9uXG4gIGlzIGRlZmluZWQuIElmIGBUeXBlYCBpcyBhIGBudWxsYCBvciBgdW5kZWZpbmVkYCBgTWV0aG9kYCBpcyBpbXBsZW1lbnRlZFxuICBmb3IgdGhhdCB2YWx1ZSB0eXBlLlxuICAqKi9cblxuICAvLyBBdHRlbXB0IHRvIGd1ZXNzIGEgdHlwZSB2aWEgYE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbGAgaGFjay5cbiAgdmFyIHR5cGUgPSBUeXBlICYmIHR5cGVmeS5jYWxsKFR5cGUucHJvdG90eXBlKVxuXG4gIC8vIElmIG9ubHkgdHdvIGFyZ3VtZW50cyBhcmUgcGFzc2VkIHRoZW4gYFR5cGVgIGlzIGFjdHVhbGx5IGFuIGltcGxlbWVudGF0aW9uXG4gIC8vIGZvciBhIGRlZmF1bHQgdHlwZS5cbiAgaWYgKCFsYW1iZGEpIERlZmF1bHRbbWV0aG9kXSA9IFR5cGVcbiAgLy8gSWYgYFR5cGVgIGlzIGBudWxsYCBvciBgdm9pZGAgc3RvcmUgaW1wbGVtZW50YXRpb24gYWNjb3JkaW5nbHkuXG4gIGVsc2UgaWYgKFR5cGUgPT09IG51bGwpIE51bGxbbWV0aG9kXSA9IGxhbWJkYVxuICBlbHNlIGlmIChUeXBlID09PSB2b2lkKDApKSBWb2lkW21ldGhvZF0gPSBsYW1iZGFcbiAgLy8gSWYgYHR5cGVgIGhhY2sgaW5kaWNhdGVzIGJ1aWx0LWluIHR5cGUgYW5kIHR5cGUgaGFzIGEgbmFtZSB1cyBpdCB0b1xuICAvLyBzdG9yZSBhIGltcGxlbWVudGF0aW9uIGludG8gYXNzb2NpYXRlZCBoYXNoLiBJZiBoYXNoIGZvciB0aGlzIHR5cGUgZG9lc1xuICAvLyBub3QgZXhpc3RzIHlldCBjcmVhdGUgb25lLlxuICBlbHNlIGlmICh0eXBlICE9PSBcIltvYmplY3QgT2JqZWN0XVwiICYmIFR5cGUubmFtZSkge1xuICAgIHZhciBCdWxpdGluID0gYnVpbHRpbltUeXBlLm5hbWVdIHx8IChidWlsdGluW1R5cGUubmFtZV0gPSBuZXcgT2JqZWN0VHlwZSgpKVxuICAgIEJ1bGl0aW5bbWV0aG9kXSA9IGxhbWJkYVxuICB9XG4gIC8vIElmIGB0eXBlYCBoYWNrIGluZGljYXRlcyBhbiBvYmplY3QsIHRoYXQgbWF5IGJlIGVpdGhlciBvYmplY3Qgb3IgYW55XG4gIC8vIEpTIGRlZmluZWQgXCJDbGFzc1wiLiBJZiBuYW1lIG9mIHRoZSBjb25zdHJ1Y3RvciBpcyBgT2JqZWN0YCwgYXNzdW1lIGl0J3NcbiAgLy8gYnVpbHQtaW4gYE9iamVjdGAgYW5kIHN0b3JlIGltcGxlbWVudGF0aW9uIGFjY29yZGluZ2x5LlxuICBlbHNlIGlmIChUeXBlLm5hbWUgPT09IFwiT2JqZWN0XCIpXG4gICAgYnVpbHRpbi5PYmplY3RbbWV0aG9kXSA9IGxhbWJkYVxuICAvLyBIb3N0IG9iamVjdHMgYXJlIHBhaW4hISEgRXZlcnkgYnJvd3NlciBkb2VzIHNvbWUgY3Jhenkgc3R1ZmYgZm9yIHRoZW1cbiAgLy8gU28gZmFyIGFsbCBicm93c2VyIHNlZW0gdG8gbm90IGltcGxlbWVudCBgY2FsbGAgbWV0aG9kIGZvciBob3N0IG9iamVjdFxuICAvLyBjb25zdHJ1Y3RvcnMuIElmIHRoYXQgaXMgYSBjYXNlIGhlcmUsIGFzc3VtZSBpdCdzIGEgaG9zdCBvYmplY3QgYW5kXG4gIC8vIHN0b3JlIGltcGxlbWVudGF0aW9uIGluIGEgYGhvc3RgIGFycmF5IGFuZCBzdG9yZSBgaW5kZXhgIGluIHRoZSBhcnJheVxuICAvLyBpbiBhIGBUeXBlLnByb3RvdHlwZWAgaXRzZWxmLiBUaGlzIGF2b2lkcyBtZW1vcnkgbGVha3MgdGhhdCBjb3VsZCBiZVxuICAvLyBjYXVzZWQgYnkgc3RvcmluZyBKUyBvYmplY3RzIG9uIGEgaG9zdCBvYmplY3RzLlxuICBlbHNlIGlmIChUeXBlLmNhbGwgPT09IHZvaWQoMCkpIHtcbiAgICB2YXIgaW5kZXggPSBob3N0LmluZGV4T2YobGFtYmRhKVxuICAgIGlmIChpbmRleCA8IDApIGluZGV4ID0gaG9zdC5wdXNoKGxhbWJkYSkgLSAxXG4gICAgLy8gUHJlZml4IHByaXZhdGUgbmFtZSB3aXRoIGAhYCBzbyBpdCBjYW4gYmUgZGlzcGF0Y2hlZCBmcm9tIHRoZSBtZXRob2RcbiAgICAvLyB3aXRob3V0IHR5cGUgY2hlY2tzLlxuICAgIGltcGxlbWVudChcIiFcIiArIG1ldGhvZCwgVHlwZS5wcm90b3R5cGUsIGluZGV4KVxuICB9XG4gIC8vIElmIEdvdCB0aGF0IGZhciBgVHlwZWAgaXMgdXNlciBkZWZpbmVkIEpTIGBDbGFzc2AuIERlZmluZSBwcml2YXRlIG5hbWVcbiAgLy8gYXMgaGlkZGVuIHByb3BlcnR5IG9uIGl0J3MgcHJvdG90eXBlLlxuICBlbHNlXG4gICAgaW1wbGVtZW50KG1ldGhvZCwgVHlwZS5wcm90b3R5cGUsIGxhbWJkYSlcbn1cblxuLy8gQW5kIHByb3ZpZGVkIGltcGxlbWVudGF0aW9ucyBmb3IgYSBwb2x5bW9ycGhpYyBlcXVpdmFsZW50cy5cbl9kZWZpbmUoZGVmaW5lLCBfZGVmaW5lKVxuX2RlZmluZShpbXBsZW1lbnQsIF9pbXBsZW1lbnQpXG5cbi8vIERlZmluZSBleHBvcnRzIG9uIGBNZXRob2RgIGFzIGl0J3Mgb25seSB0aGluZyBiZWluZyBleHBvcnRlZC5cbk1ldGhvZC5pbXBsZW1lbnQgPSBpbXBsZW1lbnRcbk1ldGhvZC5kZWZpbmUgPSBkZWZpbmVcbk1ldGhvZC5NZXRob2QgPSBNZXRob2Rcbk1ldGhvZC5tZXRob2QgPSBNZXRob2Rcbk1ldGhvZC5idWlsdGluID0gYnVpbHRpblxuTWV0aG9kLmhvc3QgPSBob3N0XG5cbm1vZHVsZS5leHBvcnRzID0gTWV0aG9kXG4iLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBTdHJpbmcoXCJFbmQgb2YgdGhlIGNvbGxlY3Rpb25cIilcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgc3RyaW5naWZpZXIgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nXG5cbmZ1bmN0aW9uIGlzRXJyb3IodmFsdWUpIHtcbiAgcmV0dXJuIHN0cmluZ2lmaWVyLmNhbGwodmFsdWUpID09PSBcIltvYmplY3QgRXJyb3JdXCJcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc0Vycm9yXG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHJlZHVjZWQgPSByZXF1aXJlKFwiLi9yZWR1Y2VkXCIpXG5cbmZ1bmN0aW9uIGlzUmVkdWNlZCh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgJiYgdmFsdWUuaXMgPT09IHJlZHVjZWRcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc1JlZHVjZWRcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZGVmaW5lUHJvcGVydHkgPSBPYmplY3QuZGVmaW5lUHJvcGVydHkgfHwgZnVuY3Rpb24ob2JqZWN0LCBuYW1lLCBwcm9wZXJ0eSkge1xuICBvYmplY3RbbmFtZV0gPSBwcm9wZXJ0eS52YWx1ZVxuICByZXR1cm4gb2JqZWN0XG59XG5cbi8vIFNob3J0Y3V0IGZvciBgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZ2AgZm9yIGZhc3RlciBhY2Nlc3MuXG52YXIgdHlwZWZ5ID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZ1xuXG4vLyBNYXAgdG8gZm9yIGp1bXBpbmcgZnJvbSB0eXBlb2YodmFsdWUpIHRvIGFzc29jaWF0ZWQgdHlwZSBwcmVmaXggdXNlZFxuLy8gYXMgYSBoYXNoIGluIHRoZSBtYXAgb2YgYnVpbHRpbiBpbXBsZW1lbnRhdGlvbnMuXG52YXIgdHlwZXMgPSB7IFwiZnVuY3Rpb25cIjogXCJPYmplY3RcIiwgXCJvYmplY3RcIjogXCJPYmplY3RcIiB9XG5cbi8vIEFycmF5IGlzIHVzZWQgdG8gc2F2ZSBtZXRob2QgaW1wbGVtZW50YXRpb25zIGZvciB0aGUgaG9zdCBvYmplY3RzIGluIG9yZGVyXG4vLyB0byBhdm9pZCBleHRlbmRpbmcgdGhlbSB3aXRoIG5vbi1wcmltaXRpdmUgdmFsdWVzIHRoYXQgY291bGQgY2F1c2UgbGVha3MuXG52YXIgaG9zdCA9IFtdXG4vLyBIYXNoIG1hcCBpcyB1c2VkIHRvIHNhdmUgbWV0aG9kIGltcGxlbWVudGF0aW9ucyBmb3IgYnVpbHRpbiB0eXBlcyBpbiBvcmRlclxuLy8gdG8gYXZvaWQgZXh0ZW5kaW5nIHRoZWlyIHByb3RvdHlwZXMuIFRoaXMgYWxzbyBhbGxvd3MgdG8gc2hhcmUgbWV0aG9kXG4vLyBpbXBsZW1lbnRhdGlvbnMgZm9yIHR5cGVzIGFjcm9zcyBkaWZmIGNvbnRleHRzIC8gZnJhbWVzIC8gY29tcGFydG1lbnRzLlxudmFyIGJ1aWx0aW4gPSB7fVxuXG5mdW5jdGlvbiBQcmltaXRpdmUoKSB7fVxuZnVuY3Rpb24gT2JqZWN0VHlwZSgpIHt9XG5PYmplY3RUeXBlLnByb3RvdHlwZSA9IG5ldyBQcmltaXRpdmUoKVxuZnVuY3Rpb24gRXJyb3JUeXBlKCkge31cbkVycm9yVHlwZS5wcm90b3R5cGUgPSBuZXcgT2JqZWN0VHlwZSgpXG5cbnZhciBEZWZhdWx0ID0gYnVpbHRpbi5EZWZhdWx0ID0gUHJpbWl0aXZlLnByb3RvdHlwZVxudmFyIE51bGwgPSBidWlsdGluLk51bGwgPSBuZXcgUHJpbWl0aXZlKClcbnZhciBWb2lkID0gYnVpbHRpbi5Wb2lkID0gbmV3IFByaW1pdGl2ZSgpXG5idWlsdGluLlN0cmluZyA9IG5ldyBQcmltaXRpdmUoKVxuYnVpbHRpbi5OdW1iZXIgPSBuZXcgUHJpbWl0aXZlKClcbmJ1aWx0aW4uQm9vbGVhbiA9IG5ldyBQcmltaXRpdmUoKVxuXG5idWlsdGluLk9iamVjdCA9IE9iamVjdFR5cGUucHJvdG90eXBlXG5idWlsdGluLkVycm9yID0gRXJyb3JUeXBlLnByb3RvdHlwZVxuXG5idWlsdGluLkV2YWxFcnJvciA9IG5ldyBFcnJvclR5cGUoKVxuYnVpbHRpbi5JbnRlcm5hbEVycm9yID0gbmV3IEVycm9yVHlwZSgpXG5idWlsdGluLlJhbmdlRXJyb3IgPSBuZXcgRXJyb3JUeXBlKClcbmJ1aWx0aW4uUmVmZXJlbmNlRXJyb3IgPSBuZXcgRXJyb3JUeXBlKClcbmJ1aWx0aW4uU3RvcEl0ZXJhdGlvbiA9IG5ldyBFcnJvclR5cGUoKVxuYnVpbHRpbi5TeW50YXhFcnJvciA9IG5ldyBFcnJvclR5cGUoKVxuYnVpbHRpbi5UeXBlRXJyb3IgPSBuZXcgRXJyb3JUeXBlKClcbmJ1aWx0aW4uVVJJRXJyb3IgPSBuZXcgRXJyb3JUeXBlKClcblxuXG5mdW5jdGlvbiBNZXRob2QoaWQpIHtcbiAgLyoqXG4gIFByaXZhdGUgTWV0aG9kIGlzIGEgY2FsbGFibGUgcHJpdmF0ZSBuYW1lIHRoYXQgZGlzcGF0Y2hlcyBvbiB0aGUgZmlyc3RcbiAgYXJndW1lbnRzIHNhbWUgbmFtZWQgTWV0aG9kOlxuXG4gICAgICBtZXRob2Qob2JqZWN0LCAuLi5yZXN0KSA9PiBvYmplY3RbbWV0aG9kXSguLi5yZXN0KVxuXG4gIEl0IGlzIHN1cHBvc2VkIHRvIGJlIGdpdmVuICoqdW5pcXVlKiogYGlkYCBwcmVmZXJhYmx5IGluIGBcImp1bXBAcGFja2FnZVwiYFxuICBsaWtlIGZvcm0gc28gaXQgd29uJ3QgY29sbGlkZSB3aXRoIGBpZCdzYCBvdGhlciB1c2VycyBjcmVhdGUuIElmIG5vIGFyZ3VtZW50XG4gIGlzIHBhc3NlZCB1bmlxdWUgaWQgaXMgZ2VuZXJhdGVkLCBidXQgaXQncyBwcm92ZWQgdG8gYmUgcHJvYmxlbWF0aWMgd2l0aFxuICBucG0gd2hlcmUgaXQncyBlYXN5IHRvIGVuZCB1cCB3aXRoIGEgY29waWVzIG9mIHNhbWUgbW9kdWxlIHdoZXJlIGVhY2ggY29weVxuICB3aWxsIGhhdmUgYSBkaWZmZXJlbnQgbmFtZS5cblxuICAjIyBFeGFtcGxlXG5cbiAgICAgIHZhciBmb28gPSBNZXRob2QoXCJmb29AYXdlc29tZW5lc3NcIilcblxuICAgICAgLy8gSW1wbGVtZW50YXRpb24gZm9yIGFueSB0eXBlc1xuICAgICAgZm9vLmRlZmluZShmdW5jdGlvbih2YWx1ZSwgYXJnMSwgYXJnMikge1xuICAgICAgICAvLyAuLi5cbiAgICAgIH0pXG5cbiAgICAgIC8vIEltcGxlbWVudGF0aW9uIGZvciBhIHNwZWNpZmljIHR5cGVcbiAgICAgIGZvby5kZWZpbmUoQmFyVHlwZSwgZnVuY3Rpb24oYmFyLCBhcmcxLCBhcmcyKSB7XG4gICAgICAgIC8vIC4uLlxuICAgICAgfSlcbiAgKiovXG5cbiAgLy8gQ3JlYXRlIGFuIGludGVybmFsIHVuaXF1ZSBuYW1lIGlmIG9uZSBpcyBub3QgcHJvdmlkZWQsIGFsc28gcHJlZml4IGl0XG4gIC8vIHRvIGF2b2lkIGNvbGxpc2lvbiB3aXRoIHJlZ3VsYXIgbWV0aG9kIG5hbWVzLlxuICB2YXIgbmFtZSA9IFwizrs6XCIgKyBTdHJpbmcoaWQgfHwgTWF0aC5yYW5kb20oKS50b1N0cmluZygzMikuc3Vic3RyKDIpKVxuXG4gIGZ1bmN0aW9uIGRpc3BhdGNoKHZhbHVlKSB7XG4gICAgLy8gTWV0aG9kIGRpc3BhdGNoZXMgb24gdHlwZSBvZiB0aGUgZmlyc3QgYXJndW1lbnQuXG4gICAgLy8gSWYgZmlyc3QgYXJndW1lbnQgaXMgYG51bGxgIG9yIGB2b2lkYCBhc3NvY2lhdGVkIGltcGxlbWVudGF0aW9uIGlzXG4gICAgLy8gbG9va2VkIHVwIGluIHRoZSBgYnVpbHRpbmAgaGFzaCB3aGVyZSBpbXBsZW1lbnRhdGlvbnMgZm9yIGJ1aWx0LWluc1xuICAgIC8vIGFyZSBzdG9yZWQuXG4gICAgdmFyIHR5cGUgPSBudWxsXG4gICAgdmFyIG1ldGhvZCA9IHZhbHVlID09PSBudWxsID8gTnVsbFtuYW1lXSA6XG4gICAgICAgICAgICAgICAgIHZhbHVlID09PSB2b2lkKDApID8gVm9pZFtuYW1lXSA6XG4gICAgICAgICAgICAgICAgIC8vIE90aGVyd2lzZSBhdHRlbXB0IHRvIHVzZSBtZXRob2Qgd2l0aCBhIGdlbmVyYXRlZCBwcml2YXRlXG4gICAgICAgICAgICAgICAgIC8vIGBuYW1lYCB0aGF0IGlzIHN1cHBvc2VkbHkgaW4gdGhlIHByb3RvdHlwZSBjaGFpbiBvZiB0aGVcbiAgICAgICAgICAgICAgICAgLy8gYHRhcmdldGAuXG4gICAgICAgICAgICAgICAgIHZhbHVlW25hbWVdIHx8XG4gICAgICAgICAgICAgICAgIC8vIE90aGVyd2lzZSBhc3N1bWUgaXQncyBvbmUgb2YgdGhlIGJ1aWx0LWluIHR5cGUgaW5zdGFuY2VzLFxuICAgICAgICAgICAgICAgICAvLyBpbiB3aGljaCBjYXNlIGltcGxlbWVudGF0aW9uIGlzIHN0b3JlZCBpbiBhIGBidWlsdGluYCBoYXNoLlxuICAgICAgICAgICAgICAgICAvLyBBdHRlbXB0IHRvIGZpbmQgYSBpbXBsZW1lbnRhdGlvbiBmb3IgdGhlIGdpdmVuIGJ1aWx0LWluXG4gICAgICAgICAgICAgICAgIC8vIHZpYSBjb25zdHJ1Y3RvciBuYW1lIGFuZCBtZXRob2QgbmFtZS5cbiAgICAgICAgICAgICAgICAgKCh0eXBlID0gYnVpbHRpblsodmFsdWUuY29uc3RydWN0b3IgfHwgXCJcIikubmFtZV0pICYmXG4gICAgICAgICAgICAgICAgICB0eXBlW25hbWVdKSB8fFxuICAgICAgICAgICAgICAgICAvLyBPdGhlcndpc2UgYXNzdW1lIGl0J3MgYSBob3N0IG9iamVjdC4gRm9yIGhvc3Qgb2JqZWN0c1xuICAgICAgICAgICAgICAgICAvLyBhY3R1YWwgbWV0aG9kIGltcGxlbWVudGF0aW9ucyBhcmUgc3RvcmVkIGluIHRoZSBgaG9zdGBcbiAgICAgICAgICAgICAgICAgLy8gYXJyYXkgYW5kIG9ubHkgaW5kZXggZm9yIHRoZSBpbXBsZW1lbnRhdGlvbiBpcyBzdG9yZWRcbiAgICAgICAgICAgICAgICAgLy8gaW4gdGhlIGhvc3Qgb2JqZWN0J3MgcHJvdG90eXBlIGNoYWluLiBUaGlzIGF2b2lkcyBtZW1vcnlcbiAgICAgICAgICAgICAgICAgLy8gbGVha3MgdGhhdCBvdGhlcndpc2UgY291bGQgaGFwcGVuIHdoZW4gc2F2aW5nIEpTIG9iamVjdHNcbiAgICAgICAgICAgICAgICAgLy8gb24gaG9zdCBvYmplY3QuXG4gICAgICAgICAgICAgICAgIGhvc3RbdmFsdWVbXCIhXCIgKyBuYW1lXV0gfHxcbiAgICAgICAgICAgICAgICAgLy8gT3RoZXJ3aXNlIGF0dGVtcHQgdG8gbG9va3VwIGltcGxlbWVudGF0aW9uIGZvciBidWlsdGlucyBieVxuICAgICAgICAgICAgICAgICAvLyBhIHR5cGUgb2YgdGhlIHZhbHVlLiBUaGlzIGJhc2ljYWxseSBtYWtlcyBzdXJlIHRoYXQgYWxsXG4gICAgICAgICAgICAgICAgIC8vIG5vbiBwcmltaXRpdmUgdmFsdWVzIHdpbGwgZGVsZWdhdGUgdG8gYW4gYE9iamVjdGAuXG4gICAgICAgICAgICAgICAgICgodHlwZSA9IGJ1aWx0aW5bdHlwZXNbdHlwZW9mKHZhbHVlKV1dKSAmJiB0eXBlW25hbWVdKVxuXG5cbiAgICAvLyBJZiBtZXRob2QgaW1wbGVtZW50YXRpb24gZm9yIHRoZSB0eXBlIGlzIHN0aWxsIG5vdCBmb3VuZCB0aGVuXG4gICAgLy8ganVzdCBmYWxsYmFjayBmb3IgZGVmYXVsdCBpbXBsZW1lbnRhdGlvbi5cbiAgICBtZXRob2QgPSBtZXRob2QgfHwgRGVmYXVsdFtuYW1lXVxuXG4gICAgLy8gSWYgaW1wbGVtZW50YXRpb24gaXMgc3RpbGwgbm90IGZvdW5kICh3aGljaCBhbHNvIG1lYW5zIHRoZXJlIGlzIG5vXG4gICAgLy8gZGVmYXVsdCkganVzdCB0aHJvdyBhbiBlcnJvciB3aXRoIGEgZGVzY3JpcHRpdmUgbWVzc2FnZS5cbiAgICBpZiAoIW1ldGhvZCkgdGhyb3cgVHlwZUVycm9yKFwiVHlwZSBkb2VzIG5vdCBpbXBsZW1lbnRzIG1ldGhvZDogXCIgKyBuYW1lKVxuXG4gICAgLy8gSWYgaW1wbGVtZW50YXRpb24gd2FzIGZvdW5kIHRoZW4ganVzdCBkZWxlZ2F0ZS5cbiAgICByZXR1cm4gbWV0aG9kLmFwcGx5KG1ldGhvZCwgYXJndW1lbnRzKVxuICB9XG5cbiAgLy8gTWFrZSBgdG9TdHJpbmdgIG9mIHRoZSBkaXNwYXRjaCByZXR1cm4gYSBwcml2YXRlIG5hbWUsIHRoaXMgZW5hYmxlc1xuICAvLyBtZXRob2QgZGVmaW5pdGlvbiB3aXRob3V0IHN1Z2FyOlxuICAvL1xuICAvLyAgICB2YXIgbWV0aG9kID0gTWV0aG9kKClcbiAgLy8gICAgb2JqZWN0W21ldGhvZF0gPSBmdW5jdGlvbigpIHsgLyoqKi8gfVxuICBkaXNwYXRjaC50b1N0cmluZyA9IGZ1bmN0aW9uIHRvU3RyaW5nKCkgeyByZXR1cm4gbmFtZSB9XG5cbiAgLy8gQ29weSB1dGlsaXR5IG1ldGhvZHMgZm9yIGNvbnZlbmllbnQgQVBJLlxuICBkaXNwYXRjaC5pbXBsZW1lbnQgPSBpbXBsZW1lbnRNZXRob2RcbiAgZGlzcGF0Y2guZGVmaW5lID0gZGVmaW5lTWV0aG9kXG5cbiAgcmV0dXJuIGRpc3BhdGNoXG59XG5cbi8vIENyZWF0ZSBtZXRob2Qgc2hvcnRjdXRzIGZvcm0gZnVuY3Rpb25zLlxudmFyIGRlZmluZU1ldGhvZCA9IGZ1bmN0aW9uIGRlZmluZU1ldGhvZChUeXBlLCBsYW1iZGEpIHtcbiAgcmV0dXJuIGRlZmluZSh0aGlzLCBUeXBlLCBsYW1iZGEpXG59XG52YXIgaW1wbGVtZW50TWV0aG9kID0gZnVuY3Rpb24gaW1wbGVtZW50TWV0aG9kKG9iamVjdCwgbGFtYmRhKSB7XG4gIHJldHVybiBpbXBsZW1lbnQodGhpcywgb2JqZWN0LCBsYW1iZGEpXG59XG5cbi8vIERlZmluZSBgaW1wbGVtZW50YCBhbmQgYGRlZmluZWAgcG9seW1vcnBoaWMgbWV0aG9kcyB0byBhbGxvdyBkZWZpbml0aW9uc1xuLy8gYW5kIGltcGxlbWVudGF0aW9ucyB0aHJvdWdoIHRoZW0uXG52YXIgaW1wbGVtZW50ID0gTWV0aG9kKFwiaW1wbGVtZW50QG1ldGhvZFwiKVxudmFyIGRlZmluZSA9IE1ldGhvZChcImRlZmluZUBtZXRob2RcIilcblxuXG5mdW5jdGlvbiBfaW1wbGVtZW50KG1ldGhvZCwgb2JqZWN0LCBsYW1iZGEpIHtcbiAgLyoqXG4gIEltcGxlbWVudHMgYE1ldGhvZGAgZm9yIHRoZSBnaXZlbiBgb2JqZWN0YCB3aXRoIGEgcHJvdmlkZWQgYGltcGxlbWVudGF0aW9uYC5cbiAgQ2FsbGluZyBgTWV0aG9kYCB3aXRoIGBvYmplY3RgIGFzIGEgZmlyc3QgYXJndW1lbnQgd2lsbCBkaXNwYXRjaCBvbiBwcm92aWRlZFxuICBpbXBsZW1lbnRhdGlvbi5cbiAgKiovXG4gIHJldHVybiBkZWZpbmVQcm9wZXJ0eShvYmplY3QsIG1ldGhvZC50b1N0cmluZygpLCB7XG4gICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgY29uZmlndXJhYmxlOiBmYWxzZSxcbiAgICB3cml0YWJsZTogZmFsc2UsXG4gICAgdmFsdWU6IGxhbWJkYVxuICB9KVxufVxuXG5mdW5jdGlvbiBfZGVmaW5lKG1ldGhvZCwgVHlwZSwgbGFtYmRhKSB7XG4gIC8qKlxuICBEZWZpbmVzIGBNZXRob2RgIGZvciB0aGUgZ2l2ZW4gYFR5cGVgIHdpdGggYSBwcm92aWRlZCBgaW1wbGVtZW50YXRpb25gLlxuICBDYWxsaW5nIGBNZXRob2RgIHdpdGggYSBmaXJzdCBhcmd1bWVudCBvZiB0aGlzIGBUeXBlYCB3aWxsIGRpc3BhdGNoIG9uXG4gIHByb3ZpZGVkIGBpbXBsZW1lbnRhdGlvbmAuIElmIGBUeXBlYCBpcyBhIGBNZXRob2RgIGRlZmF1bHQgaW1wbGVtZW50YXRpb25cbiAgaXMgZGVmaW5lZC4gSWYgYFR5cGVgIGlzIGEgYG51bGxgIG9yIGB1bmRlZmluZWRgIGBNZXRob2RgIGlzIGltcGxlbWVudGVkXG4gIGZvciB0aGF0IHZhbHVlIHR5cGUuXG4gICoqL1xuXG4gIC8vIEF0dGVtcHQgdG8gZ3Vlc3MgYSB0eXBlIHZpYSBgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsYCBoYWNrLlxuICB2YXIgdHlwZSA9IFR5cGUgJiYgdHlwZWZ5LmNhbGwoVHlwZS5wcm90b3R5cGUpXG5cbiAgLy8gSWYgb25seSB0d28gYXJndW1lbnRzIGFyZSBwYXNzZWQgdGhlbiBgVHlwZWAgaXMgYWN0dWFsbHkgYW4gaW1wbGVtZW50YXRpb25cbiAgLy8gZm9yIGEgZGVmYXVsdCB0eXBlLlxuICBpZiAoIWxhbWJkYSkgRGVmYXVsdFttZXRob2RdID0gVHlwZVxuICAvLyBJZiBgVHlwZWAgaXMgYG51bGxgIG9yIGB2b2lkYCBzdG9yZSBpbXBsZW1lbnRhdGlvbiBhY2NvcmRpbmdseS5cbiAgZWxzZSBpZiAoVHlwZSA9PT0gbnVsbCkgTnVsbFttZXRob2RdID0gbGFtYmRhXG4gIGVsc2UgaWYgKFR5cGUgPT09IHZvaWQoMCkpIFZvaWRbbWV0aG9kXSA9IGxhbWJkYVxuICAvLyBJZiBgdHlwZWAgaGFjayBpbmRpY2F0ZXMgYnVpbHQtaW4gdHlwZSBhbmQgdHlwZSBoYXMgYSBuYW1lIHVzIGl0IHRvXG4gIC8vIHN0b3JlIGEgaW1wbGVtZW50YXRpb24gaW50byBhc3NvY2lhdGVkIGhhc2guIElmIGhhc2ggZm9yIHRoaXMgdHlwZSBkb2VzXG4gIC8vIG5vdCBleGlzdHMgeWV0IGNyZWF0ZSBvbmUuXG4gIGVsc2UgaWYgKHR5cGUgIT09IFwiW29iamVjdCBPYmplY3RdXCIgJiYgVHlwZS5uYW1lKSB7XG4gICAgdmFyIEJ1bGl0aW4gPSBidWlsdGluW1R5cGUubmFtZV0gfHwgKGJ1aWx0aW5bVHlwZS5uYW1lXSA9IG5ldyBPYmplY3RUeXBlKCkpXG4gICAgQnVsaXRpblttZXRob2RdID0gbGFtYmRhXG4gIH1cbiAgLy8gSWYgYHR5cGVgIGhhY2sgaW5kaWNhdGVzIGFuIG9iamVjdCwgdGhhdCBtYXkgYmUgZWl0aGVyIG9iamVjdCBvciBhbnlcbiAgLy8gSlMgZGVmaW5lZCBcIkNsYXNzXCIuIElmIG5hbWUgb2YgdGhlIGNvbnN0cnVjdG9yIGlzIGBPYmplY3RgLCBhc3N1bWUgaXQnc1xuICAvLyBidWlsdC1pbiBgT2JqZWN0YCBhbmQgc3RvcmUgaW1wbGVtZW50YXRpb24gYWNjb3JkaW5nbHkuXG4gIGVsc2UgaWYgKFR5cGUubmFtZSA9PT0gXCJPYmplY3RcIilcbiAgICBidWlsdGluLk9iamVjdFttZXRob2RdID0gbGFtYmRhXG4gIC8vIEhvc3Qgb2JqZWN0cyBhcmUgcGFpbiEhISBFdmVyeSBicm93c2VyIGRvZXMgc29tZSBjcmF6eSBzdHVmZiBmb3IgdGhlbVxuICAvLyBTbyBmYXIgYWxsIGJyb3dzZXIgc2VlbSB0byBub3QgaW1wbGVtZW50IGBjYWxsYCBtZXRob2QgZm9yIGhvc3Qgb2JqZWN0XG4gIC8vIGNvbnN0cnVjdG9ycy4gSWYgdGhhdCBpcyBhIGNhc2UgaGVyZSwgYXNzdW1lIGl0J3MgYSBob3N0IG9iamVjdCBhbmRcbiAgLy8gc3RvcmUgaW1wbGVtZW50YXRpb24gaW4gYSBgaG9zdGAgYXJyYXkgYW5kIHN0b3JlIGBpbmRleGAgaW4gdGhlIGFycmF5XG4gIC8vIGluIGEgYFR5cGUucHJvdG90eXBlYCBpdHNlbGYuIFRoaXMgYXZvaWRzIG1lbW9yeSBsZWFrcyB0aGF0IGNvdWxkIGJlXG4gIC8vIGNhdXNlZCBieSBzdG9yaW5nIEpTIG9iamVjdHMgb24gYSBob3N0IG9iamVjdHMuXG4gIGVsc2UgaWYgKFR5cGUuY2FsbCA9PT0gdm9pZCgwKSkge1xuICAgIHZhciBpbmRleCA9IGhvc3QuaW5kZXhPZihsYW1iZGEpXG4gICAgaWYgKGluZGV4IDwgMCkgaW5kZXggPSBob3N0LnB1c2gobGFtYmRhKSAtIDFcbiAgICAvLyBQcmVmaXggcHJpdmF0ZSBuYW1lIHdpdGggYCFgIHNvIGl0IGNhbiBiZSBkaXNwYXRjaGVkIGZyb20gdGhlIG1ldGhvZFxuICAgIC8vIHdpdGhvdXQgdHlwZSBjaGVja3MuXG4gICAgaW1wbGVtZW50KFwiIVwiICsgbWV0aG9kLCBUeXBlLnByb3RvdHlwZSwgaW5kZXgpXG4gIH1cbiAgLy8gSWYgR290IHRoYXQgZmFyIGBUeXBlYCBpcyB1c2VyIGRlZmluZWQgSlMgYENsYXNzYC4gRGVmaW5lIHByaXZhdGUgbmFtZVxuICAvLyBhcyBoaWRkZW4gcHJvcGVydHkgb24gaXQncyBwcm90b3R5cGUuXG4gIGVsc2VcbiAgICBpbXBsZW1lbnQobWV0aG9kLCBUeXBlLnByb3RvdHlwZSwgbGFtYmRhKVxufVxuXG4vLyBBbmQgcHJvdmlkZWQgaW1wbGVtZW50YXRpb25zIGZvciBhIHBvbHltb3JwaGljIGVxdWl2YWxlbnRzLlxuX2RlZmluZShkZWZpbmUsIF9kZWZpbmUpXG5fZGVmaW5lKGltcGxlbWVudCwgX2ltcGxlbWVudClcblxuLy8gRGVmaW5lIGV4cG9ydHMgb24gYE1ldGhvZGAgYXMgaXQncyBvbmx5IHRoaW5nIGJlaW5nIGV4cG9ydGVkLlxuTWV0aG9kLmltcGxlbWVudCA9IGltcGxlbWVudFxuTWV0aG9kLmRlZmluZSA9IGRlZmluZVxuTWV0aG9kLk1ldGhvZCA9IE1ldGhvZFxuTWV0aG9kLm1ldGhvZCA9IE1ldGhvZFxuTWV0aG9kLmJ1aWx0aW4gPSBidWlsdGluXG5NZXRob2QuaG9zdCA9IGhvc3RcblxubW9kdWxlLmV4cG9ydHMgPSBNZXRob2RcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgbWV0aG9kID0gcmVxdWlyZShcIm1ldGhvZFwiKVxuXG52YXIgaXNSZWR1Y2VkID0gcmVxdWlyZShcIi4vaXMtcmVkdWNlZFwiKVxudmFyIGlzRXJyb3IgPSByZXF1aXJlKFwiLi9pcy1lcnJvclwiKVxudmFyIGVuZCA9IHJlcXVpcmUoXCIuL2VuZFwiKVxuXG52YXIgcmVkdWNlID0gbWV0aG9kKFwicmVkdWNlQHJlZHVjaWJsZVwiKVxuXG4vLyBJbXBsZW1lbnRhdGlvbiBvZiBgcmVkdWNlYCBmb3IgdGhlIGVtcHR5IGNvbGxlY3Rpb25zLCB0aGF0IGltbWVkaWF0ZWx5XG4vLyBzaWduYWxzIHJlZHVjZXIgdGhhdCBpdCdzIGVuZGVkLlxucmVkdWNlLmVtcHR5ID0gZnVuY3Rpb24gcmVkdWNlRW1wdHkoZW1wdHksIG5leHQsIGluaXRpYWwpIHtcbiAgbmV4dChlbmQsIGluaXRpYWwpXG59XG5cbi8vIEltcGxlbWVudGF0aW9uIG9mIGByZWR1Y2VgIGZvciB0aGUgc2luZ3VsYXIgdmFsdWVzIHdoaWNoIGFyZSB0cmVhdGVkXG4vLyBhcyBjb2xsZWN0aW9ucyB3aXRoIGEgc2luZ2xlIGVsZW1lbnQuIFlpZWxkcyBhIHZhbHVlIGFuZCBzaWduYWxzIHRoZSBlbmQuXG5yZWR1Y2Uuc2luZ3VsYXIgPSBmdW5jdGlvbiByZWR1Y2VTaW5ndWxhcih2YWx1ZSwgbmV4dCwgaW5pdGlhbCkge1xuICBuZXh0KGVuZCwgbmV4dCh2YWx1ZSwgaW5pdGlhbCkpXG59XG5cbi8vIEltcGxlbWVudGF0aW9uIG9mIGByZWR1Y2VgIGZvciB0aGUgYXJyYXkgKGFuZCBhbGlrZSkgdmFsdWVzLCBzdWNoIHRoYXQgaXRcbi8vIHdpbGwgY2FsbCBhY2N1bXVsYXRvciBmdW5jdGlvbiBgbmV4dGAgZWFjaCB0aW1lIHdpdGggbmV4dCBpdGVtIGFuZFxuLy8gYWNjdW11bGF0ZWQgc3RhdGUgdW50aWwgaXQncyBleGhhdXN0ZWQgb3IgYG5leHRgIHJldHVybnMgbWFya2VkIHZhbHVlXG4vLyBpbmRpY2F0aW5nIHRoYXQgaXQncyByZWR1Y2VkLiBFaXRoZXIgd2F5IHNpZ25hbHMgYGVuZGAgdG8gYW4gYWNjdW11bGF0b3IuXG5yZWR1Y2UuaW5kZXhlZCA9IGZ1bmN0aW9uIHJlZHVjZUluZGV4ZWQoaW5kZXhlZCwgbmV4dCwgaW5pdGlhbCkge1xuICB2YXIgc3RhdGUgPSBpbml0aWFsXG4gIHZhciBpbmRleCA9IDBcbiAgdmFyIGNvdW50ID0gaW5kZXhlZC5sZW5ndGhcbiAgd2hpbGUgKGluZGV4IDwgY291bnQpIHtcbiAgICB2YXIgdmFsdWUgPSBpbmRleGVkW2luZGV4XVxuICAgIHN0YXRlID0gbmV4dCh2YWx1ZSwgc3RhdGUpXG4gICAgaW5kZXggPSBpbmRleCArIDFcbiAgICBpZiAodmFsdWUgPT09IGVuZCkgcmV0dXJuIGVuZFxuICAgIGlmIChpc0Vycm9yKHZhbHVlKSkgcmV0dXJuIHN0YXRlXG4gICAgaWYgKGlzUmVkdWNlZChzdGF0ZSkpIHJldHVybiBzdGF0ZS52YWx1ZVxuICB9XG4gIG5leHQoZW5kLCBzdGF0ZSlcbn1cblxuLy8gQm90aCBgdW5kZWZpbmVkYCBhbmQgYG51bGxgIGltcGxlbWVudCBhY2N1bXVsYXRlIGZvciBlbXB0eSBzZXF1ZW5jZXMuXG5yZWR1Y2UuZGVmaW5lKHZvaWQoMCksIHJlZHVjZS5lbXB0eSlcbnJlZHVjZS5kZWZpbmUobnVsbCwgcmVkdWNlLmVtcHR5KVxuXG4vLyBBcnJheSBhbmQgYXJndW1lbnRzIGltcGxlbWVudCBhY2N1bXVsYXRlIGZvciBpbmRleGVkIHNlcXVlbmNlcy5cbnJlZHVjZS5kZWZpbmUoQXJyYXksIHJlZHVjZS5pbmRleGVkKVxuXG5mdW5jdGlvbiBBcmd1bWVudHMoKSB7IHJldHVybiBhcmd1bWVudHMgfVxuQXJndW1lbnRzLnByb3RvdHlwZSA9IEFyZ3VtZW50cygpXG5yZWR1Y2UuZGVmaW5lKEFyZ3VtZW50cywgcmVkdWNlLmluZGV4ZWQpXG5cbi8vIEFsbCBvdGhlciBidWlsdC1pbiBkYXRhIHR5cGVzIGFyZSB0cmVhdGVkIGFzIHNpbmdsZSB2YWx1ZSBjb2xsZWN0aW9uc1xuLy8gYnkgZGVmYXVsdC4gT2YgY291cnNlIGluZGl2aWR1YWwgdHlwZXMgbWF5IGNob29zZSB0byBvdmVycmlkZSB0aGF0LlxucmVkdWNlLmRlZmluZShyZWR1Y2Uuc2luZ3VsYXIpXG5cbi8vIEVycm9ycyBqdXN0IHlpZWxkIHRoYXQgZXJyb3IuXG5yZWR1Y2UuZGVmaW5lKEVycm9yLCBmdW5jdGlvbihlcnJvciwgbmV4dCkgeyBuZXh0KGVycm9yKSB9KVxubW9kdWxlLmV4cG9ydHMgPSByZWR1Y2VcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5cbi8vIEV4cG9ydGVkIGZ1bmN0aW9uIGNhbiBiZSB1c2VkIGZvciBib3hpbmcgdmFsdWVzLiBUaGlzIGJveGluZyBpbmRpY2F0ZXNcbi8vIHRoYXQgY29uc3VtZXIgb2Ygc2VxdWVuY2UgaGFzIGZpbmlzaGVkIGNvbnN1bWluZyBpdCwgdGhlcmUgZm9yIG5ldyB2YWx1ZXNcbi8vIHNob3VsZCBub3QgYmUgbm8gbG9uZ2VyIHB1c2hlZC5cbmZ1bmN0aW9uIHJlZHVjZWQodmFsdWUpIHtcbiAgLyoqXG4gIEJveGVzIGdpdmVuIHZhbHVlIGFuZCBpbmRpY2F0ZXMgdG8gYSBzb3VyY2UgdGhhdCBpdCdzIGFscmVhZHkgcmVkdWNlZCBhbmRcbiAgbm8gbmV3IHZhbHVlcyBzaG91bGQgYmUgc3VwcGxpZWRcbiAgKiovXG4gIHJldHVybiB7IHZhbHVlOiB2YWx1ZSwgaXM6IHJlZHVjZWQgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHJlZHVjZWRcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgbWV0aG9kID0gcmVxdWlyZShcIm1ldGhvZFwiKVxudmFyIHNlbmQgPSBtZXRob2QoXCJzZW5kXCIpXG5cbm1vZHVsZS5leHBvcnRzID0gc2VuZFxuIiwidmFyIGV2ZW50cyA9IHJlcXVpcmUoJ2V2ZW50Jyk7XG5cbmNvbnNvbGUubG9nKCdIZWxsbywgV29ybGQnKTtcbmNvbnNvbGUubG9nKGV2ZW50cyk7XG5cbiJdfQ==
