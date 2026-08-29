import { describe, expect, it } from 'vitest'
import {
  ConfigurationRoot,
  ExtensionId,
  ProductDisplayName,
  MarkdownEditorViewType,
  OutlineViewId,
} from '../../src/shared/product-identity'

describe('product identity', () => {
  it('exports the canonical extension contracts', () => {
    expect({
      ExtensionId,
      ProductDisplayName,
      ConfigurationRoot,
      MarkdownEditorViewType,
      OutlineViewId,
    }).toEqual({
      ExtensionId: 'laicasaane.vmde',
      ProductDisplayName: 'VMDE',
      ConfigurationRoot: 'vmde',
      MarkdownEditorViewType: 'vmde.editor',
      OutlineViewId: 'vmde.outline',
    })
  })
})
