import { useMemo } from 'react'
import { PROTOCOL_LABELS } from '@shared/providers'
import type { CatalogModel } from '@shared/types'
import { SearchPicker, type SearchPickerOption } from './SearchPicker'

export const CUSTOM_MODEL_LABEL = '自定义模型…'

interface ModelPickerProps {
  id?: string
  models: CatalogModel[]
  selectedModel: string
  /** 正在手动填写模型 ID */
  custom: boolean
  onSelect(model: string | null): void
}

export function ModelPicker({ id, models, selectedModel, custom, onSelect }: ModelPickerProps) {
  const options = useMemo<SearchPickerOption[]>(() => {
    const list: SearchPickerOption[] = models.map((model) => {
      const protocolLabel = model.protocol ? PROTOCOL_LABELS[model.protocol] : undefined
      return {
        id: model.id,
        label: model.name && model.name !== model.id ? model.name : model.id,
        hint: model.name && model.name !== model.id ? model.id : undefined,
        tag: model.deprecated ? '已弃用' : protocolLabel,
        keywords: [model.id, model.name, protocolLabel ?? '']
      }
    })
    if (selectedModel && !models.some((model) => model.id === selectedModel)) {
      list.unshift({ id: selectedModel, label: selectedModel, hint: '已保存' })
    }
    return list
  }, [models, selectedModel])

  return (
    <SearchPicker
      id={id}
      triggerLabel="模型"
      searchLabel="搜索模型"
      placeholder="搜索模型名称或 ID"
      listLabel="模型列表"
      emptyText="没有匹配的模型"
      options={options}
      selectedId={custom ? null : selectedModel}
      custom={{ label: CUSTOM_MODEL_LABEL, hint: '手动填写模型 ID' }}
      onSelect={onSelect}
    />
  )
}
