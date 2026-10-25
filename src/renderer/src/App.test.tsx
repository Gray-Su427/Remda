import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('renders the app shell', () => {
    render(<App />)
    expect(screen.getByText('Remda')).toBeInTheDocument()
    expect(screen.getByText('read md with ai')).toBeInTheDocument()
  })
})
