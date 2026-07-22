import '@testing-library/jest-dom/vitest'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App template', () => {
  it('keeps the Vite template mountable', () => {
    const { container } = render(<App />)

    expect(container).toBeInTheDocument()
  })
})
