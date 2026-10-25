import { useMemo } from 'react'
import { PROVIDERS, type ProviderPreset } from '@shared/providers'
import { SearchPicker, type SearchPickerOption } from './SearchPicker'

export const CUSTOM_PROVIDER_LABEL = '其他（自定义）'

interface ProviderPickerProps {
  id?: string
  /** 选中的预设 id；null 表示「其他（自定义）」 */
  selectedId: string | null
  onSelect(provider: ProviderPreset | null): void
}

export function ProviderPicker({ id, selectedId, onSelect }: ProviderPickerProps) {
  const options = useMemo<SearchPickerOption[]>(
    () =>
      PROVIDERS.map((provider) => ({
        id: provider.id,
        label: provider.name,
        hint: provider.baseUrl,
        tag: provider.local ? '本地' : undefined,
        keywords: provider.keywords
      })),
    []
  )

  return (
    <SearchPicker
      id={id}
      triggerLabel="服务商"
      searchLabel="搜索服务商"
      placeholder="搜索服务商，例如 deepseek / 硅基流动"
      listLabel="服务商列表"
      emptyText="没有匹配的服务商"
      options={options}
      selectedId={selectedId}
      custom={{ label: CUSTOM_PROVIDER_LABEL, hint: '手动填写 Base URL' }}
      onSelect={(optionId) => {
        onSelect(optionId ? (PROVIDERS.find((provider) => provider.id === optionId) ?? null) : null)
      }}
    />
  )
}
