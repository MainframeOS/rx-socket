import { createServer } from 'net'
import { join } from 'path'
import test from 'ava'

import { SocketSubject } from '../src'

const randomString = () => {
  return Math.random()
    .toString(36)
    .slice(2, 10)
}

const createSocketServer = listener => {
  const path = join(process.cwd(), randomString())
  const close = cb => {
    server.close(cb)
  }
  const server = createServer(listener)
  return new Promise((resolve, reject) => {
    server.listen(path, err => {
      if (err) reject(err)
      else resolve({ close, path })
    })
  })
}

test('connects to the server when subscribed', async t => {
  t.plan(1)
  const server = await createSocketServer(s => {
    s.write(JSON.stringify({ ok: true }))
  })
  const socket = new SocketSubject(server.path)
  return new Promise(resolve => {
    socket.subscribe(msg => {
      t.true(msg.ok)
      server.close()
      resolve()
    })
  })
})

test('sends JSON objects', t => {
  t.plan(1)
  return new Promise(async resolve => {
    const server = await createSocketServer(s => {
      s.on('data', chunk => {
        t.is(chunk.toString(), '{"ok":true}')
        resolve()
      })
    })
    const socket = new SocketSubject(server.path)
    socket.next({ ok: true })
    socket.subscribe()
  })
})

test('accepts a config object with open and close observers', t => {
  t.plan(2)
  return new Promise(async resolve => {
    const server = await createSocketServer(s => {
      s.write('"test"')
    })
    const socket = new SocketSubject({
      connect: server.path,
      openObserver: {
        next: () => {
          t.pass()
        },
      },
      closeObserver: {
        next: () => {
          t.pass()
          resolve()
        },
      },
    })
    socket.subscribe(() => {
      socket.unsubscribe()
      server.close()
    })
  })
})
