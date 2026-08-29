import { describe, expect, it } from 'vitest'
import {
  ConfigurationRoot,
  ExtensionId,
  MarkdownEditorViewType,
  OutlineViewId,
} from '../../src/shared/product-identity'

describe('product identity', () => {
  it('exports the canonical extension contracts', () => {
    expect({
      ExtensionId,
      ConfigurationRoot,
      MarkdownEditorViewType,
      OutlineViewId,
    }).toEqual({
      ExtensionId: 'laicasaane.vmde',
      ConfigurationRoot: 'vmde',
      MarkdownEditorViewType: 'vmde.editor',
      OutlineViewId: 'vmde.outline',
    })
  })
})
