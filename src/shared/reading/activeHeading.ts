export interface HeadingPos {
  id: string
  top: number
}

export function findActiveHeading(
  headings: HeadingPos[],
  scrollTop: number,
  offset = 0
): string | null {
  const line = scrollTop + offset
  let active: string | null = null
  for (const heading of headings) {
    if (heading.top <= line) active = heading.id
    else break
  }
  return active
}
