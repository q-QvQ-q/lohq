import test from 'node:test'
import assert from 'node:assert/strict'
import { anniversaryOccursOn, chinaClock, dueWithinWindow, todoOccursOn } from './schedule.mjs'

test('China clock does not use device or server timezone', () => {
  assert.deepEqual(chinaClock(new Date('2026-09-19T16:30:00Z')), { date: '2026-09-20', time: '00:30' })
})

test('reminder sends only within a short window', () => {
  assert.equal(dueWithinWindow('09:00:00', '09:00'), true)
  assert.equal(dueWithinWindow('09:00:00', '09:10'), true)
  assert.equal(dueWithinWindow('09:00:00', '09:11'), false)
  assert.equal(dueWithinWindow('09:00:00', '08:59'), false)
})

test('todo recurrence matches the calendar recurrence rules', () => {
  assert.equal(todoOccursOn({ due_date: '2026-01-31', recurrence: 'monthly' }, '2026-02-28'), true)
  assert.equal(todoOccursOn({ due_date: '2026-01-31', recurrence: 'monthly' }, '2026-03-30'), false)
  assert.equal(todoOccursOn({ due_date: '2026-09-20', recurrence: 'daily' }, '2026-09-21'), true)
  assert.equal(todoOccursOn({ due_date: '2026-09-20', recurrence: 'weekly' }, '2026-09-27'), true)
  assert.equal(todoOccursOn({ due_date: '2026-09-20', recurrence: 'none' }, '2026-09-21'), false)
})

test('anniversary recurs yearly only on the matching day', () => {
  assert.equal(anniversaryOccursOn({ date: '2024-09-20', is_repeat_yearly: true }, '2026-09-20'), true)
  assert.equal(anniversaryOccursOn({ date: '2024-09-20', is_repeat_yearly: false }, '2026-09-20'), false)
})
