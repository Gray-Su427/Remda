import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CUSTOM_PROVIDER_LABEL, ProviderPicker } from './ProviderPicker'

function renderPicker(selectedId: string | null = 'deepseek') {
  const onSelect = vi.fn()
  render(<ProviderPicker selectedId={selectedId} onSelect={onSelect} />)
  return { onSelect }
}

describe('ProviderPicker', () => {
  it('shows the selected provider', () => {
    renderPicker()
    expect(screen.getByRole('combobox')).toHaveTextContent('DeepSeek')
  })

  it('shows the custom label when nothing is selected', () => {
    renderPicker(null)
    expect(screen.getByRole('combobox')).toHaveTextContent(CUSTOM_PROVIDER_LABEL)
  })

  it('filters by chinese alias and selects by click', async () => {
    const { onSelect } = renderPicker()
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.type(screen.getByLabelText('搜索服务商'), '硅基流动')

    expect(screen.queryByRole('option', { name: /OpenAI/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: /SiliconFlow \(China\)/ }))

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'siliconflow-cn' }))
    expect(screen.queryByLabelText('搜索服务商')).not.toBeInTheDocument()
  })

  it('selects the custom option', async () => {
    const { onSelect } = renderPicker()
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: new RegExp(CUSTOM_PROVIDER_LABEL) }))

    expect(onSelect).toHaveBeenCalledWith(null)
    expect(screen.queryByLabelText('搜索服务商')).not.toBeInTheDocument()
  })

  it('selects the first match with the keyboard', async () => {
    const { onSelect } = renderPicker()
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.type(screen.getByLabelText('搜索服务商'), 'openrouter{Enter}')

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'openrouter' }))
  })

  it('reaches the custom option with the keyboard', async () => {
    const { onSelect } = renderPicker()
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.keyboard('{ArrowUp}{Enter}')

    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('closes on escape', async () => {
    renderPicker()
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.type(screen.getByLabelText('搜索服务商'), '{Escape}')
    expect(screen.queryByLabelText('搜索服务商')).not.toBeInTheDocument()
  })

  it('keeps the custom option when nothing matches', async () => {
    renderPicker()
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.type(screen.getByLabelText('搜索服务商'), 'no-such-provider')
    expect(screen.getByText('没有匹配的服务商')).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: new RegExp(CUSTOM_PROVIDER_LABEL) })
    ).toBeInTheDocument()
  })
})
