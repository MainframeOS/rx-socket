# rx-socket

[RxJS Subject](http://reactivex.io/rxjs/class/es6/Subject.js~Subject.html) for
[Node Socket](https://nodejs.org/dist/latest-v9.x/docs/api/net.html#net_class_net_socket).

## Installation

```sh
yarn add rx-socket
```

## Usage

```js
import { SocketSubject } from 'rx-socket'

const socket = new SocketSubject('/path/to/socket')

socket.subscribe(data => {
  // `data` will be an Object, expecting a JSON-encoded string to be provided
  console.log(data)
})

// `next()` expects a string by default
socket.next(JSON.stringify({ hello: 'world' }))
```

See the
[`socket.connect()` documentation](https://nodejs.org/dist/latest-v9.x/docs/api/net.html#net_socket_connect)
for the supported `SocketSubject` constructor argument.

## License

MIT.\
See [LICENSE](LICENSE) file.
