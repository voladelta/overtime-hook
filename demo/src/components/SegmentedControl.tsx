import type { CSSProperties } from "react"

type Segment<T extends string> = {
  value: T
  label: string
  count?: number
}

type SegmentedControlProps<T extends string> = {
  value: T
  options: Segment<T>[]
  onChange: (value: T) => void
  label: string
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: SegmentedControlProps<T>) {
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))

  return (
    <div
      className="segmented"
      role="group"
      aria-label={label}
      style={{ "--segment-count": options.length, "--selected-index": selectedIndex } as CSSProperties}
    >
      <span className="segmented__indicator" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.value}
          className="segmented__item"
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          <span>{option.label}</span>
          {option.count ? <small>{option.count}</small> : null}
        </button>
      ))}
    </div>
  )
}
