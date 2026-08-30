export function parseVsixPackageArgs(args) {
  let output
  let preRelease = false
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--pre-release') {
      if (preRelease) throw new Error('duplicate argument: --pre-release')
      preRelease = true
      continue
    }
    if (argument === '--out') {
      if (output !== undefined) throw new Error('duplicate argument: --out')
      output = args[index + 1]
      if (!output || output.startsWith('--')) {
        throw new Error('--out requires a file path')
      }
      index += 1
      continue
    }
    throw new Error(`unknown argument: ${argument}`)
  }
  return { preRelease, output }
}

export function buildVscePackageArgs({
  vsceCli,
  output,
  marketplaceImagesBase,
  preRelease = false,
}) {
  return [
    vsceCli,
    'package',
    '--no-dependencies',
    '--baseImagesUrl',
    marketplaceImagesBase,
    ...(preRelease ? ['--pre-release'] : []),
    '--out',
    output,
  ]
}
