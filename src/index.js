// @flow

import { createConnection, type Socket } from 'net'
import oboe from 'oboe'
import {
  type Observer,
  ReplaySubject,
  Subject,
  Subscriber,
  Subscription,
} from 'rxjs'
import { AnonymousSubject } from 'rxjs/internal/Subject'

type OpenObserver = Observer<void>
type CloseObserver = Observer<boolean>

export type ConnectArg = string | net$connectOptions

export type Config = {
  connect: ConnectArg,
  openObserver?: ?OpenObserver,
  closeObserver?: ?CloseObserver,
}

export type ConnectOrConfig = ConnectArg | Config

export class SocketSubject<T> extends AnonymousSubject<T> {
  _config: Config
  _output: Subject<T>
  _socket: ?Socket

  constructor(connectOrConfig: ConnectOrConfig) {
    super()

    this._config =
      // $FlowFixMe: config type
      typeof connectOrConfig === 'string' || connectOrConfig.connect == null
        ? { connect: connectOrConfig }
        : connectOrConfig
    this._output = new Subject()
    this.destination = new ReplaySubject()
  }

  _reset() {
    this._socket = null
    this._output = new Subject()
  }

  _connectSocket() {
    const { connect, openObserver, closeObserver } = this._config
    const observer = this._output

    const socket = createConnection(connect)
    this._socket = socket

    const subscription = new Subscription()

    socket.on('connect', () => {
      openObserver && openObserver.next()

      const queue = this.destination

      this.destination = Subscriber.create(
        x => {
          socket.write(JSON.stringify(x))
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

    oboe(socket)
      .on('done', (value: T) => {
        try {
          observer.next(value)
        } catch (err) {
          observer.error(err)
        }
      })
      .on('fail', (report: { thrown: ?Error, body: ?string }) => {
        observer.error(
          report.thrown || new Error(report.body || 'Socket error'),
        )
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
