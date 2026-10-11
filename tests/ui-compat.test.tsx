import {describe, expect, it, vi} from 'vitest'

const ui = vi.hoisted(() => {
  const Content = vi.fn()
  const Dialog = Object.assign(vi.fn(), {Content})

  return {
    Card: vi.fn(),
    Dialog,
  }
})

vi.mock('@sanity/ui', () => ui)

import {CompatibleCard} from '../src/components/uiCompat'

describe('CompatibleCard with the UI 5 API', () => {
  it.each([
    ['positive', 'positive'],
    ['caution', 'caution'],
    ['critical', 'critical'],
    ['omitted', undefined, 'neutral'],
  ] as const)('passes the %s tone to the UI 5 Card', (_name, inputTone, expectedTone) => {
    const element = CompatibleCard({children: 'Card content', tone: inputTone})

    expect(element.type).toBe(ui.Card)
    expect(element.props).toMatchObject({tone: expectedTone ?? inputTone})
  })
})
