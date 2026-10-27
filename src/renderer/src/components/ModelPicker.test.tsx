import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CatalogModel } from '@shared/types'
import { CUSTOM_MODEL_LABEL, ModelPicker } from './ModelPicker'

const models: CatalogModel[] = [
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini' },
  { id: 'gpt-5.4', name: 'GPT-5.4' },
  { id: 'legacy-model', name: 'Legacy Model', deprecated: true }
]

function renderPicker(selectedModel = 'gpt-5.4-mini', custom = false) {
  const onSelect = vi.fn()
  render(
    <ModelPicker
      models={models}
      selectedModel={selectedModel}
      custom={custom}
      onSelect={onSelect}
    />
  )
  return { onSelect }
}

describe('ModelPicker', () => {
  it('shows the selected model name', () => {
    renderPicker()
    expect(screen.getByRole('combobox', { name: '模型' })).toHaveTextContent('GPT-5.4 mini')
  })

  it('filters by id and selects a model', async () => {
    const { onSelect } = renderPicker()
    await userEvent.click(screen.getByRole('combobox', { name: '模型' }))
    await userEvent.type(screen.getByLabelText('搜索模型'), 'gpt-5.4-mini')
    await userEvent.click(screen.getByRole('option', { name: /GPT-5.4 mini/ }))

    expect(onSelect).toHaveBeenCalledWith('gpt-5.4-mini')
  })

  it('selects the custom model option', async () => {
    const { onSelect } = renderPicker()
    await userEvent.click(screen.getByRole('combobox', { name: '模型' }))
    await userEvent.click(
      screen.getByRole('option', { name: new RegExp(CUSTOM_MODEL_LABEL) })
    )

    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('keeps a saved model that is not in the catalog', async () => {
    renderPicker('old-model')
    expect(screen.getByRole('combobox', { name: '模型' })).toHaveTextContent('old-model')
    await userEvent.click(screen.getByRole('combobox', { name: '模型' }))
    expect(screen.getByRole('option', { name: /old-model/ })).toBeInTheDocument()
    expect(screen.getByText('已保存')).toBeInTheDocument()
  })

  it('shows the custom label while custom mode is active', () => {
    renderPicker('gpt-5.4-mini', true)
    expect(screen.getByRole('combobox', { name: '模型' })).toHaveTextContent(CUSTOM_MODEL_LABEL)
  })

  it('marks deprecated models', async () => {
    renderPicker('legacy-model')
    await userEvent.click(screen.getByRole('combobox', { name: '模型' }))
    expect(screen.getAllByText('已弃用').length).toBeGreaterThan(0)
  })
})
