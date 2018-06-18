var stringify  = require('json-stringify-safe')
  , format     = require('util').format
  , is         = require('core-util-is')
  , individual = require('individual')('$$bole', { })
  , levels     = 'debug info warn error'.split(' ')
  , hostname   = require('os').hostname()
  , pid        = process.pid


function stackToString (e) {
  var s = e.stack
    , ce

  if (is.isFunction(e.cause) && (ce = e.cause()))
    s += '\nCaused by: ' + stackToString(ce)

  return s
}

function getUrl(err) {
  if (err.options && err.options.url)
    return err.options.url

  if (err.options && err.options.uri)
    return err.options.uri

  return undefined;
}

function getMessage(err) {
  var url, error, message
  url = getUrl(err)
  error = err.error && err.error.error ? err.error.error : undefined
  message = err.message
  if (error)
    message += ' ' + error
  if (err.description)
    message += ' ' + err.description
  if (url)
    message += ' for ' + url
  return message
}

function levelLogger (level, name) {
  return function (inp) {
    var outputs = individual[level]

    if (!outputs)
      return // no outputs for this level

    var out = {
            time     : new Date().toISOString()
          , hostname : hostname
          , pid      : pid
          , level    : level
          , name     : name
        }
      , k
      , i = 0
      , stringified

    // if called with string, error args, and error is of useless stacktrace type,
    // then swap the args so we get the best formatting.
    if (arguments.length > 1 && typeof inp === 'string' && isHideStackErrorType(arguments[1])) {
      var t = arguments[0]
      arguments[0] = arguments[1]
      arguments[1] = t
    }

    if (is.isError(inp) && inp.name === 'StatusCodeError') {
      if (arguments.length > 1)
        out.message = format.apply(null, Array.prototype.slice.call(arguments, 1))

      out.err = {
          name    : inp.name
        , message : getMessage(inp)
        , code    : inp.statusCode
        , stack   : ''
      }
    } else if (is.isError(inp) && (inp.name === 'RequestError' || inp.name === 'RequestTimedOutError')) {
      if (arguments.length > 1)
        out.message = format.apply(null, Array.prototype.slice.call(arguments, 1))

      out.err = {
          name    : inp.name
        , message : getMessage(inp)
        , code    : inp.error && inp.error.code ? inp.error.code : ''
        , stack   : ''
      }
    } else if (is.isError(inp) && inp.type === 'TransportError') {
      if (arguments.length > 1)
        out.message = format.apply(null, Array.prototype.slice.call(arguments, 1))

      out.err = {
          name    : inp.type
        , message : getMessage(inp)
        , code    : inp.error && inp.error.code ? inp.error.code : ''
        , stack   : ''
      }
    } else if (is.isError(inp)) {
      if (arguments.length > 1)
        out.message = format.apply(null, Array.prototype.slice.call(arguments, 1))

      out.err = {
          name    : inp.name
        , message : inp.message
        , code    : inp.code // perhaps
        , stack   : stackToString(inp)
      }
    } else if (is.isObject(inp) && inp.method && inp.url && inp.headers && inp.socket) {
      if (arguments.length > 1)
        out.message = format.apply(null, Array.prototype.slice.call(arguments, 1))

      out.req = {
          method        : inp.method
        , url           : inp.url
        , headers       : inp.headers
        , remoteAddress : inp.connection.remoteAddress
        , remotePort    : inp.connection.remotePort
      }
    } else if (is.isObject(inp)) {
      if (arguments.length > 1)
        out.message = format.apply(null, Array.prototype.slice.call(arguments, 1))

      for (k in inp) {
        if (Object.prototype.hasOwnProperty.call(inp, k))
          out[k] = inp[k]
      }
    } else if (!is.isUndefined(inp)) {
      out.message = format.apply(null, arguments)
    }

    if (inp) {
        if (inp.details) {
          out.details = inp.details;
        }
        if (inp.statusCode) {
          if (out.err) {
            out.err.code = out.err.code || inp.statusCode;
          } else if(out.req) {
            out.req.statusCode = inp.statusCode;
          } else {
            out.statusCode = inp.statusCode;
          }
        }
        if (inp.statusCodeDescription) {
          if (out.err) {
            out.err.codeDescription = inp.statusCodeDescription;
          } else if(out.req) {
            out.req.statusCodeDescription = out.req.statusCodeDescription || inp.statusCodeDescription;
          } else {
            out.statusCodeDescription = inp.statusCodeDescription;
          }
        }
        if (inp.appCode) {
            if (out.err) {
              out.err.appCode = inp.appCode;
            } else if(out.req) {
              out.req.appCode = inp.appCode;
            } else {
              out.appCode = inp.appCode;
            }
        }
    }

    for (; i < outputs.length; i++) {
      if (outputs[i]._writableState && outputs[i]._writableState.objectMode === true) {
        outputs[i].write(out)
      } else {
        if (!stringified) // lazy stringify
          stringified = stringify(out) + '\n'
        outputs[i].write(stringified)
      }
    }
  }
}

function isHideStackErrorType(obj) {
  return is.isError(obj) && (
    obj.name === 'StatusCodeError' ||
    obj.name === 'RequestError' ||
    obj.name === 'RequestTimedOutError' ||
    obj.type === 'TransportError'
  )
}

function bole (name) {
  function boleLogger (subname) {
    return bole(name + ':' + subname)
  }

  function makeLogger (p, level) {
    p[level] = levelLogger(level, name)
    return p
  }

  return levels.reduce(makeLogger, boleLogger)
}


bole.output = function (opt) {
  if (Array.isArray(opt))
    return opt.forEach(bole.output)

  var i = 0
    , b = false

  for (; i < levels.length; i++) {
    if (levels[i] === opt.level)
      b = true

    if (b) {
      if (!individual[levels[i]])
        individual[levels[i]] = []
      individual[levels[i]].push(opt.stream)
    }
  }
}


bole.reset = function () {
  for (var k in individual)
    delete individual[k]
}


module.exports = bole
