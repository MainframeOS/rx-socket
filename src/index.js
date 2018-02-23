// @flow

import { createConnection, type Socket } from 'net'
import { EOL } from 'os'
import { Observable } from 'rxjs/Observable'
import { type Observer } from 'rxjs/Observer'
import { ReplaySubject } from 'rxjs/ReplaySubject'
import { Subject, AnonymousSubject } from 'rxjs/Subject'
import { Subscriber } from 'rxjs/Subscriber'
import { Subscription } from 'rxjs/Subscription'

type constructorOptions = net$connectOptions & {
  openObserver?: Observer<void>,
  closeObserver?: Observer<boolean>,
}

type connectArg = number | string | constructorOptions

export class SocketSubject<T> extends AnonymousSubject<T> {
  socket: ?Socket
  openObserver: ?Observer<void>
  closeObserver: ?Observer<boolean>

  _connectArg: connectArg
  _output: Subject<T>

  constructor(connectArg: connectArg, destination?: Observer<T>) {
    super()

    if (typeof connectArg === 'object') {
      const { openObserver, closeObserver, ...arg } = connectArg
      this.openObserver = openObserver
      this.closeObserver = closeObserver
      this._connectArg = arg
    } else {
      this._connectArg = connectArg
    }

    this._output = new Subject()
    // $FlowFixMe
    this.destination = new ReplaySubject()
  }

  resultSelector(data: string): T {
    return JSON.parse(data)
  }

  _reset() {
    this.socket = null
    this._output = new Subject()
  }

  _connectSocket() {
    const observer = this._output

    const socket = createConnection(this._connectArg)
    this.socket = socket

    // $FlowFixMe
    const subscription = new Subscription(() => {
      socket.end()
      this.socket = null
    })

    socket.on('connect', () => {
      if (this.openObserver) {
        this.openObserver.next()
      }

      const queue = this.destination

      // $FlowFixMe
      this.destination = Subscriber.create(
        x => {
          socket.write(x)
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
      this.closeObserver && this.closeObserver.next(had_error)
      if (had_error) {
        observer.error(new Error('Connection closed'))
      } else {
        observer.complete()
      }
    })

    const tryPush = str => {
      try {
        const result = this.resultSelector(str)
        observer.next(result)
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
    if (!this.socket) {
      this._connectSocket()
    }

    const subscription = new Subscription()
    subscription.add(this._output.subscribe(subscriber))
    subscription.add(() => {
      if (this._output.observers.length === 0) {
        if (this.socket) {
          this.socket.end()
        }
        this._reset()
      }
    })
    return subscription
  }

  unsubscribe() {
    if (this.socket) {
      this.socket.end()
      this._reset()
    }
    super.unsubscribe()
  }
}
