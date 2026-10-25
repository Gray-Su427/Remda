import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProviderPicker } from './ProviderPicker'

function renderPicker(value = 'https://api.deepseek.com/v1') {
  const onSelect = vi.fn()
  render(<ProviderPicker value={value} onSelect={onSelect} />)
  return { onSelect }
}

describe('ProviderPicker', () => {
  it('shows the provider matched by the current base url', () => {
    renderPicker()
    expect(screen.getByRole('combobox')).toHaveTextContent('DeepSeek')
  })

  it('shows custom for an unknown base url', () => {
    renderPicker('https://example.com/v1')
    expect(screen.getByRole('combobox')).toHaveTextContent('自定义')
  })

  it('filters by chinese alias and selects by click', async () => {
    const { onSelect } = renderPicker()
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.type(screen.getByLabelText('搜索服务商'), '硅基流动')

    expect(screen.queryByRole('option', { name: /OpenAI/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: /硅基流动/ }))

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'siliconflow' }))
    expect(screen.queryByLabelText('搜索服务商')).not.toBeInTheDocument()
  })

  it('selects the first match with the keyboard', async () => {
    const { onSelect } = renderPicker()
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.type(screen.getByLabelText('搜索服务商'), 'openrouter{Enter}')

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'openrouter' }))
  })

  it('closes on escape', async () => {
    renderPicker()
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.type(screen.getByLabelText('搜索服务商'), '{Escape}')
    expect(screen.queryByLabelText('搜索服务商')).not.toBeInTheDocument()
  })

  it('reports no matches', async () => {
    renderPicker()
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.type(screen.getByLabelText('搜索服务商'), 'no-such-provider')
    expect(screen.getByText('没有匹配的服务商')).toBeInTheDocument()
  })
})
