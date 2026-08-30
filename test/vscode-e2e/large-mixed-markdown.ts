export const LARGE_MIXED_TARGET =
  'TARGET alpha beta gamma delta epsilon zeta eta theta iota kappa lambda'

export function largeMixedMarkdown(): string {
  const lines: string[] = []
  const singleLineTargets = new Set([400, 401, 600])
  for (let index = 0; index < 801; index++) {
    lines.push(
      index === 400
        ? LARGE_MIXED_TARGET
        : `Paragraph ${index} alpha beta gamma delta epsilon zeta eta theta iota kappa lambda`,
    )
    if (!singleLineTargets.has(index)) {
      lines.push(
        `Continuation ${index} preserves a realistic soft line with inline **bold** and [link](./note.md).`,
      )
    }
    lines.push('')
  }
  for (let index = 0; index < 48; index++) {
    lines.push(`- list ${index} first item`)
    lines.push(`- list ${index} second item`)
    lines.push('')
    lines.push(`After list ${index} separator paragraph.`)
    lines.push('')
  }
  for (let index = 0; index < 4; index++) {
    lines.push('')
    lines.push(`| Table ${index} | Value   |`)
    lines.push('| ------- | ------- |')
    lines.push(`| row ${index}   | content |`)
    lines.push('')
  }
  for (let index = 0; index < 4; index++) {
    lines.push('```ts')
    lines.push(`const ordinaryFence${index} = "value"`)
    lines.push('```')
    lines.push('')
  }
  for (let index = 0; index < 4; index++) {
    lines.push('```mermaid')
    lines.push(`graph TD; M${index}A[Start] --> M${index}B[Finish]`)
    lines.push('```')
    lines.push('')
  }
  return lines.join('\n')
}
