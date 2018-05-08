// @flow

import { createConnection, type Socket } from 'net'
import { EOL } from 'os'
import {
  Observable,
  type Observer,
  ReplaySubject,
  Subject,
  Subscriber,
  Subscription,
} from 'rxjs'
import { AnonymousSubject } from 'rxjs/internal/Subject'

type OpenObserver = Observer<void>
type CloseObserver = Observer<boolean>

type ConnectArg = string | net$connectOptions

export type Config<T> = {
  connect: ConnectArg,
  deserializer: (value: string) => T,
  serializer: (value: any) => string,
  openObserver?: ?OpenObserver,
  closeObserver?: ?CloseObserver,
}

const DEFAULT_CONFIG = {
  deserializer: (value: string) => JSON.parse(value),
  serializer: (value: any) => JSON.stringify(value),
}

export class SocketSubject<T> extends AnonymousSubject<T> {
  _config: Config<T>
  _output: Subject<T>
  _socket: ?Socket

  constructor(connectOrConfig: ConnectArg | Config<T>) {
    super()

    const config =
      typeof connectOrConfig === 'string' || connectOrConfig.connect == null
        ? { connect: connectOrConfig }
        : connectOrConfig

    // $FlowFixMe: config type
    this._config = Object.assign({}, DEFAULT_CONFIG, config)
    this._output = new Subject()
    this.destination = new ReplaySubject()
  }

  _reset() {
    this._socket = null
    this._output = new Subject()
  }

  _connectSocket() {
    const {
      connect,
      deserializer,
      serializer,
      openObserver,
      closeObserver,
    } = this._config
    const observer = this._output

    const socket = createConnection(connect)
    this._socket = socket

    const subscription = new Subscription()

    socket.on('connect', () => {
      openObserver && openObserver.next()

      const queue = this.destination

      this.destination = Subscriber.create(
        x => {
          socket.write(serializer(x))
        },
        e => {
          observer.error(e)
          this._reset()
        },
        () => {
          socket.end()
          this._reset()
        },
      )

      if (queue && queue instanceof ReplaySubject) {
        subscription.add(queue.subscribe(this.destination))
      }
    })

    socket.on('close', (had_error: boolean) => {
      this._reset()
      closeObserver && closeObserver.next(had_error)
      if (had_error) {
        observer.error(new Error('Connection closed'))
      } else {
        observer.complete()
      }
    })

    const tryPush = value => {
      try {
        observer.next(deserializer(value))
      } catch (err) {
        observer.error(err)
      }
    }

    socket.on('data', data => {
      data
        .toString()
        .split(EOL)
        .filter(Boolean)
        .forEach(tryPush)
    })
  }

  _subscribe(subscriber: Subscriber<T>): Subscription {
    if (!this._socket) {
      this._connectSocket()
    }

    const subscription = new Subscription()
    subscription.add(this._output.subscribe(subscriber))
    subscription.add(() => {
      if (this._output.observers.length === 0) {
        this._socket && this._socket.end()
        this._reset()
      }
    })
    return subscription
  }

  unsubscribe() {
    if (this._socket) {
      this._socket.end()
      this._reset()
    }
    super.unsubscribe()
  }
}
