import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// SPIKE (diagnostic, not a regression) — decides whether the "lockstep dual-drive" undo
// coupling (option #2) is even possible. Three unknowns, all VS-Code-runtime behaviours:
//   Q1 TARGETING  — does executeCommand('undo') from the host revert OUR custom editor's
//                   TextDocument at all?
//   Q2 COALESCING — does ONE undo revert ONE applyEdit, or several merged into one stop?
//   Q3 COUNT      — how many undos to reach !isDirty vs the number of applyEdits (3)?
// Lockstep needs Q1=yes AND a 1:1 edit↔undo-step relationship (Q2 = one-at-a-time, Q3 = 3).
// If VS Code coalesces our applyEdits (Q2/Q3 < 3) we cannot align the two stacks → #2 dies.
const FIXTURE = path.join(__dirname, 'fixtures', 'undo-dirty.md')

test('SPIKE: applyEdit coalescing + undo targeting for lockstep (#2)', async ({
  evaluateInVSCode,
}) => {
  const result = (await evaluateInVSCode(
    async (vscode: typeof import('vscode'), args: string[]) => {
      const uri = args[0]
      await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(uri),
        'vmarkd.editor',
      )
      await new Promise((r) => setTimeout(r, 1500))
      const u = vscode.Uri.file(uri)
      const doc = vscode.workspace.textDocuments.find(
        (d) => d.uri.fsPath === uri,
      )
      if (!doc) return { error: 'doc not found' }
      const initialText = doc.getText()
      const endPos = () => doc.lineAt(doc.lineCount - 1).range.end
      const log: Record<string, unknown> = {}
      log.initial = { dirty: doc.isDirty, version: doc.version }

      // 3 SEPARATE forward edits (simulating 3 debounced webview edits), spaced apart so
      // they are NOT in the same instant — this is the realistic typing-burst cadence.
      const applyAppend = async (s: string) => {
        const e = new vscode.WorkspaceEdit()
        e.insert(u, endPos(), s)
        await vscode.workspace.applyEdit(e)
      }
      await applyAppend('\nMARK_AAA')
      await new Promise((r) => setTimeout(r, 200))
      await applyAppend('\nMARK_BBB')
      await new Promise((r) => setTimeout(r, 200))
      await applyAppend('\nMARK_CCC')
      await new Promise((r) => setTimeout(r, 200))
      log.afterEdits = {
        dirty: doc.isDirty,
        version: doc.version,
        has: {
          A: doc.getText().includes('MARK_AAA'),
          B: doc.getText().includes('MARK_BBB'),
          C: doc.getText().includes('MARK_CCC'),
        },
      }

      // Q1 + Q2: ONE undo from the host. Did the doc change? How much reverted?
      const before = doc.getText()
      await vscode.commands.executeCommand('undo')
      await new Promise((r) => setTimeout(r, 250))
      log.afterUndo1 = {
        changedOurDoc: doc.getText() !== before, // Q1
        dirty: doc.isDirty,
        version: doc.version,
        has: {
          A: doc.getText().includes('MARK_AAA'),
          B: doc.getText().includes('MARK_BBB'),
          C: doc.getText().includes('MARK_CCC'), // Q2: only C gone = 1:1
        },
      }

      // Q3: keep undoing until clean (or cap); count steps.
      let steps = 1
      while (doc.isDirty && steps < 15) {
        const t = doc.getText()
        await vscode.commands.executeCommand('undo')
        await new Promise((r) => setTimeout(r, 150))
        if (doc.getText() === t) break // undo no longer changing anything → stuck
        steps++
      }
      log.undoToClean = {
        totalUndoSteps: steps,
        editsApplied: 3,
        dirty: doc.isDirty,
        backToInitial: doc.getText() === initialText,
        version: doc.version,
      }
      return log
    },
    [FIXTURE] as [string],
  )) as Record<string, unknown>

  // eslint-disable-next-line no-console
  console.log(`[lockstep-spike] ${JSON.stringify(result, null, 2)}`)
  expect(result).toBeTruthy()
})
