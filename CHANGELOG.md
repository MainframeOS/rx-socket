## v0.5.0 (2019-02-13)

- Changed `connect` config option to `path`.
- Replaced Flow by TypeScript.
- Added TypeScript definitions.

## v0.4.1 (2018-10-26)

Fix `Observer` Flow type.

## v0.4.0 (2018-08-02)

- Add `oboe` dependency to handle frames parsing.
- Remove support for custom `serializer` and `deserializer` options. Only JSON objects are supported.
- Remove buffering options, delegated to `oboe` logic.

## v0.3.2 (2018-08-01)

Fix multi-frames message handling with customizable buffer size.

## v0.3.1 (2018-07-09)

Changed exports to CommonJS, removed esm dependency.

## v0.3.0 (2018-04-25)

- `.next()` now serializes the provided value to JSON.
- Updated RxJS dependency to v6.
- Added esm dependency for module support.

## v0.2.0 (2018-02-23)

- Incoming data is now split using node's `os.EOL` separator to emit individual values.
- Added `resultSelector()` method to match RxJS' WebSocketSubject implementation of parsing incoming data.

## v0.1.0 (2017-11-16)

First release.
