// @flow

import { createConnection, type Socket } from 'net'
import { EOL } from 'os'
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

type ConnectArg = string | net$connectOptions

export type Config<T> = {
  connect: ConnectArg,
  deserializer: (value: string) => T,
  serializer: (value: any) => string,
  openObserver?: ?OpenObserver,
  closeObserver?: ?CloseObserver,
  frameSize: number,
  maxBufferFrames: number,
}

const DEFAULT_CONFIG = {
  deserializer: (value: string) => JSON.parse(value),
  serializer: (value: any) => JSON.stringify(value),
  frameSize: 8192,
  maxBufferFrames: 10,
}

export class SocketSubject<T> extends AnonymousSubject<T> {
  _config: Config<T>
  _output: Subject<T>
  _socket: ?Socket
  _buffer: string = ''

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
      frameSize,
      maxBufferFrames,
    } = this._config
    const observer = this._output

    const maxBufferSize = frameSize * maxBufferFrames

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

    const tryPush = (value: T): void => {
      try {
        observer.next(value)
      } catch (err) {
        observer.error(err)
      }
    }

    const tryParse = (value: string): ?T => {
      try {
        return deserializer(value)
      } catch (err) {
        // Swallow error
      }
    }

    const tryParseAll = (value: string): Array<T> => {
      return value
        .split(EOL)
        .map(tryParse)
        .filter(Boolean)
    }

    socket.on('data', data => {
      const str = data.toString()
      let parsed = []

      if (str.length === frameSize) {
        // Frame is full: could be incomplete message
        if (this._buffer.length > 0) {
          // A previous frame is already buffered, try to parse them combined
          parsed = tryParseAll(this._buffer + str)
          if (parsed.length === 0) {
            // No message parsed with combined frames, try with only the new frame
            parsed = tryParseAll(str)
            if (parsed.length === 0) {
              // Failed to parse a message from new frame
              if (this._buffer.length === maxBufferSize) {
                // Buffer is full, emit error
                observer.error(new Error('Buffer overflow'))
              } else {
                // Append frame to existing buffer
                this._buffer += str
              }
            }
          }
        } else {
          // No previous frame in buffer, try to parse new one
          parsed = tryParseAll(str)
          if (parsed.length === 0) {
            // Failed to parse a message from new frame, buffer it
            this._buffer = str
          }
        }
      } else if (this._buffer.length > 0) {
        // A previous frame is already buffered, try to parse them combined
        parsed = tryParseAll(this._buffer + str)
        if (parsed.length === 0) {
          // No message parsed with combined frames, try with only the new frame
          parsed = tryParseAll(str)
        }
      } else {
        // Basic case: frame is not full and buffer is empty
        parsed = tryParseAll(str)
      }

      if (parsed.length !== 0) {
        // At least one message was parsed, clear buffer and push messages
        this._buffer = ''
        parsed.forEach(tryPush)
      }
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
