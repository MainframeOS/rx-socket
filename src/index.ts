import { createConnection, IpcSocketConnectOpts, Socket } from 'net'
import oboe from 'oboe'
import {
  NextObserver,
  ReplaySubject,
  Subject,
  Subscriber,
  Subscription,
} from 'rxjs'
import { AnonymousSubject } from 'rxjs/internal/Subject'

export interface Config extends IpcSocketConnectOpts {
  closeObserver?: NextObserver<boolean> | undefined | null
  openObserver?: NextObserver<void> | undefined | null
  path: string
}

export class SocketSubject<T> extends AnonymousSubject<T> {
  protected _config: Config
  protected _output: Subject<T>
  protected _socket: Socket | null
  public destination: ReplaySubject<T>

  public constructor(pathOrConfig: string | Config) {
    super()

    this._config =
      typeof pathOrConfig === 'string' ? { path: pathOrConfig } : pathOrConfig
    this._socket = null
    this._output = new Subject()
    this.destination = new ReplaySubject()
  }

  public _subscribe(subscriber: Subscriber<T>): Subscription {
    console.log('socket _subscribe()')
    if (this._socket === null) {
      this._connectSocket()
    }

    const subscription = new Subscription()
    subscription.add(this._output.subscribe(subscriber))
    subscription.add(() => {
      if (this._output.observers.length === 0) {
        if (this._socket !== null) {
          this._socket.end()
        }
        this._reset()
      }
    })

    return subscription
  }

  public unsubscribe(): void {
    if (this._socket !== null) {
      this._socket.end()
      this._reset()
    }
    super.unsubscribe()
  }

  protected _connectSocket(): void {
    const { path, openObserver, closeObserver } = this._config
    const observer = this._output

    const socket = createConnection(path)
    this._socket = socket
    console.log('connect socket', path)

    const subscription = new Subscription()

    socket.on('connect', () => {
      if (openObserver != null) {
        console.log('trigger openObserver')
        openObserver.next()
      }

      console.log('socket connected')

      const queue = this.destination

      this.destination = Subscriber.create(
        (msg: T) => {
          console.log('socket write', msg)
          socket.write(JSON.stringify(msg))
        },
        (err: Error) => {
          console.log('socket send error', err)
          observer.error(err)
          this._reset()
        },
        () => {
          socket.end()
          this._reset()
        },
      )

      if (queue !== undefined && queue instanceof ReplaySubject) {
        console.log('subscribe queue')
        subscription.add(queue.subscribe(this.destination))
      }
    })

    socket.on('close', (hadError: boolean) => {
      this._reset()
      if (closeObserver != null) {
        console.log('trigger closeObserver')
        closeObserver.next(hadError)
      }
      if (hadError) {
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
      .on(
        'fail',
        (report: { body: string | undefined; thrown: Error | undefined }) => {
          if (report.thrown !== undefined) {
            observer.error(report.thrown)
          } else {
            observer.error(
              new Error(
                report.body === undefined ? 'Socket error' : report.body,
              ),
            )
          }
        },
      )
  }

  protected _reset(): void {
    this._socket = null
    this._output = new Subject()
  }
}
