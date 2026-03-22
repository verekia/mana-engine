import { expect, test } from 'bun:test'

import { mountGame } from './index'

test('mountGame is exported', () => {
  expect(typeof mountGame).toBe('function')
})
